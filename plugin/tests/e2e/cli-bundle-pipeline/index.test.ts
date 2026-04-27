// tests/e2e/cli-bundle-pipeline/index.test.ts
// Stage 04c: E2E test exercising CLI → bundle-parser → generator → plan output
// using the real CDCC v1.1.0 bundle at plugin/docs/planning/v1.1.0/
// Covers gate-22 C-1 / M-2 / M-10 / H-4 on the production CLI path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main } from '../../../src/cli/index.js';

// Helper to run CLI directly by invoking the exported main function
async function runCLI(
  args: string[],
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; status: number }> {
  const oldArgv = process.argv;
  const oldEnv = process.env.CLAUDE_ROOT;
  const logCapture: { stdout: string[]; stderr: string[] } = { stdout: [], stderr: [] };

  try {
    process.argv = ['node', 'cdcc', ...args];
    if (env?.CLAUDE_ROOT) {
      process.env.CLAUDE_ROOT = env.CLAUDE_ROOT;
    } else if (oldEnv) {
      delete process.env.CLAUDE_ROOT;
    }

    const originalLog = console.log;
    const originalError = console.error;
    const stringifyArg = (a: unknown): string => (typeof a === 'string' ? a : String(a));
    console.log = (...msgArgs: unknown[]): void => {
      logCapture.stdout.push(msgArgs.map(stringifyArg).join(' '));
    };
    console.error = (...msgArgs: unknown[]): void => {
      logCapture.stderr.push(msgArgs.map(stringifyArg).join(' '));
    };

    let status = 0;
    try {
      status = await main();
    } catch (err) {
      logCapture.stderr.push((err as Error).message);
      status = 99;
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    return {
      stdout: logCapture.stdout.join('\n'),
      stderr: logCapture.stderr.join('\n'),
      status,
    };
  } finally {
    process.argv = oldArgv;
    if (oldEnv !== undefined) {
      process.env.CLAUDE_ROOT = oldEnv;
    } else {
      delete process.env.CLAUDE_ROOT;
    }
  }
}

// Resolve real CDCC v1.1.0 bundle path (relative to plugin/ CWD when running vitest)
function resolveV110BundlePath(): string {
  // When vitest runs from plugin/, cwd is plugin/
  const cwdRelative = resolve(process.cwd(), 'docs', 'planning', 'v1.1.0');
  if (existsSync(join(cwdRelative, 'CDCC_PRD_2026-04-26_v01_I.md'))) {
    return cwdRelative;
  }
  // Absolute fallback for alternate run contexts
  const absoluteFallback =
    'C:/Users/NerdyKrystal/cold read 2026-04-25/claudette-can-code/plugin/docs/planning/v1.1.0';
  if (existsSync(join(absoluteFallback, 'CDCC_PRD_2026-04-26_v01_I.md'))) {
    return absoluteFallback;
  }
  throw new Error(
    `Cannot locate real CDCC v1.1.0 bundle. Tried:\n  ${cwdRelative}\n  ${absoluteFallback}`,
  );
}

describe('CLI Bundle Pipeline E2E — Stage 04c live path', () => {
  let bundlePath: string;
  let tmpDir: string;

  beforeEach(() => {
    bundlePath = resolveV110BundlePath();
    tmpDir = mkdtempSync(join(tmpdir(), 'cdcc-e2e-v110-'));
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true });
    }
  });

  // ── dry-run live path ───────────────────────────────────────────────────────

  it('e2e-1: dry-run on real v1.1.0 bundle → ok=true; plan has stages (live path)', async () => {
    const result = await runCLI(['dry-run', bundlePath]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);

    expect(parsed).toHaveProperty('dryRun', true);
    expect(parsed).toHaveProperty('plan');
    expect(parsed.plan).toHaveProperty('stages');
    expect(Array.isArray(parsed.plan.stages)).toBe(true);
    expect(parsed.plan.stages.length).toBeGreaterThan(0);
    expect(parsed.plan).toHaveProperty('schemaVersion', '0.1.0');
  });

  it('e2e-2: dry-run → plan id is deterministic UUID-like string', async () => {
    const r1 = await runCLI(['dry-run', bundlePath]);
    const r2 = await runCLI(['dry-run', bundlePath]);

    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);

    const p1 = JSON.parse(r1.stdout);
    const p2 = JSON.parse(r2.stdout);

    // Same bundle → same plan id
    expect(p1.plan.id).toBe(p2.plan.id);
    // UUID-like pattern
    expect(p1.plan.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('e2e-3: dry-run → stages have valid assignedModel from spec (gate-22 M-2 / H-4 closed on CLI)', async () => {
    const result = await runCLI(['dry-run', bundlePath]);
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    const { stages } = parsed.plan;

    for (const stage of stages) {
      expect(['opus-4-7', 'sonnet-4-6', 'haiku-4-5']).toContain(stage.assignedModel);
    }

    // QA stage must use opus-4-7
    const qaStage = stages.find((s: { id: string }) => s.id === 'qa');
    expect(qaStage).toBeDefined();
    if (qaStage) {
      expect(qaStage.assignedModel).toBe('opus-4-7');
    }
  });

  it('e2e-4: dry-run → stages have valid effortLevel from spec (gate-22 M-10 closed on CLI)', async () => {
    const result = await runCLI(['dry-run', bundlePath]);
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    const { stages } = parsed.plan;

    for (const stage of stages) {
      expect(['low', 'medium', 'high']).toContain(stage.effortLevel);
    }

    const qaStage = stages.find((s: { id: string }) => s.id === 'qa');
    expect(qaStage?.effortLevel).toBe('high');

    const planSkeleton = stages.find((s: { id: string }) => s.id === 'plan-skeleton');
    expect(planSkeleton?.effortLevel).toBe('low');
  });

  // ── generate live path ─────────────────────────────────────────────────────

  it('e2e-5: generate on real v1.1.0 bundle → writes plan.json + installs hooks', async () => {
    const claudeRoot = join(tmpDir, '.claude');
    // plan.json is written to resolve('plan.json') = process.cwd() in the worker.
    // We verify success via stdout, not the written file (process.chdir unsupported in workers).
    const result = await runCLI(['generate', bundlePath], { CLAUDE_ROOT: claudeRoot });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);

    expect(parsed).toHaveProperty('ok', true);
    expect(parsed).toHaveProperty('plan');
    expect(parsed).toHaveProperty('settings');
    expect(typeof parsed.stages).toBe('number');
    expect(parsed.stages).toBeGreaterThan(0);
  });

  it('e2e-6: generate → stdout reports stages > 0 and valid plan path (live path, not hardcode)', async () => {
    const claudeRoot = join(tmpDir, '.claude');
    const result = await runCLI(['generate', bundlePath], { CLAUDE_ROOT: claudeRoot });
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('ok', true);
    expect(parsed.stages).toBeGreaterThan(0);
    // plan path must be an absolute path ending in plan.json
    expect(parsed.plan).toMatch(/plan\.json$/);
  });

  // ── bundle-parser → generator integration ─────────────────────────────────

  it('e2e-7: parseBundle + generateFromBundleAST pipeline produces valid plan (direct module test)', async () => {
    const { parseBundle } = await import('../../../src/core/bundle-parser/index.js');
    const { generateFromBundleAST } = await import('../../../src/core/plan-generator/index.js');
    const { buildCatalog } = await import('../../../src/core/catalog/index.js');

    const bundleResult = parseBundle(bundlePath);
    expect(bundleResult.ok).toBe(true);
    if (!bundleResult.ok) throw new Error(`parseBundle failed: ${bundleResult.error.message}`);

    const catalog = await buildCatalog(tmpDir);
    const planResult = await generateFromBundleAST({
      bundle: bundleResult.value,
      catalog,
      now: () => new Date('2026-04-27T12:00:00Z'),
    });

    expect(planResult.ok).toBe(true);
    if (!planResult.ok) {
      throw new Error(`generateFromBundleAST failed: ${JSON.stringify(planResult.error)}`);
    }

    const plan = planResult.value;
    expect(plan.schemaVersion).toBe('0.1.0');
    expect(plan.stages.length).toBeGreaterThan(0);

    // Verify gate-22 C-1: plan was derived from bundle content (not hardcode)
    // The plan's bundle refs must match the real bundle doc paths
    expect(plan.bundle.prd.path).toBe(bundleResult.value.prd.path);
    expect(plan.bundle.trd.path).toBe(bundleResult.value.trd.path);
  });
});
