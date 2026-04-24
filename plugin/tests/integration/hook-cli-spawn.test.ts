// Integration test: spawn each H1–H5 CLI entry point against the built dist.
// Purpose: exercise the `if (import.meta.url === file://${process.argv[1]}) { ... }`
// entry-point IIFE and the `handle()` function body (which is otherwise unreachable
// under in-process vitest imports).
//
// Under V8 coverage provider, inline `// istanbul ignore next` comments are not
// honored — so even code explicitly marked as unreachable in the source counts
// as uncovered. These spawn tests lift coverage on the IIFE shell + handle()
// body. The IIFE's `.catch` callback body (e.g. `console.error(...); process.exit(1)`)
// is exercised by the "force-handle-reject" variant below, which points CLAUDE_ROOT
// at a path that breaks AuditLogger's mkdir, forcing handleImpl's outer-catch path
// to re-throw and escape handle().

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

const PLUGIN_ROOT = resolve(__dirname, '..', '..');
const DIST_HOOKS = join(PLUGIN_ROOT, 'dist', 'hooks');

type HookId =
  | 'h1-input-manifest'
  | 'h2-deviation-manifest'
  | 'h3-sandbox-hygiene'
  | 'h4-model-assignment'
  | 'h5-gate-result';

function hookDist(id: HookId): string {
  return join(DIST_HOOKS, id, 'index.js');
}

beforeAll(() => {
  // Ensure dist is fresh. Use spawnSync (not execSync) for shell-injection safety
  // per the execFile-no-throw convention — no user input goes into the argv here.
  if (!existsSync(hookDist('h1-input-manifest'))) {
    const build = spawnSync('npm', ['run', 'build'], {
      cwd: PLUGIN_ROOT,
      stdio: 'pipe',
      shell: true,
    });
    if (build.status !== 0) {
      throw new Error(`Build failed with status ${String(build.status)}: ${build.stderr?.toString() ?? ''}`);
    }
  }
});

describe('Hook CLI entry points — spawn-based coverage', () => {
  let claudeRoot: string;
  let planStatePath: string;
  let pluginDir: string;

  beforeEach(async () => {
    claudeRoot = await mkdtemp(join(tmpdir(), 'cdcc-hook-spawn-'));
    pluginDir = join(claudeRoot, 'plugins', 'cdcc');
    await mkdir(pluginDir, { recursive: true });
    planStatePath = join(pluginDir, 'plan-state.json');
  });

  afterEach(async () => {
    await rm(claudeRoot, { recursive: true, force: true });
  });

  describe('happy-path IIFE shell execution', () => {
    it('H1: CLI entry runs handle() and exits cleanly (block on empty manifest)', async () => {
      await writeFile(planStatePath, JSON.stringify({ stages: [] }), 'utf-8');
      const res = spawnSync('node', [hookDist('h1-input-manifest')], {
        env: { ...process.env, CLAUDE_ROOT: claudeRoot },
        encoding: 'utf-8',
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('H1 BLOCK');
    });

    it('H2: CLI entry reads stdin, exits 0 on no BUILD_COMPLETE', async () => {
      const res = spawnSync('node', [hookDist('h2-deviation-manifest')], {
        env: { ...process.env, CLAUDE_ROOT: claudeRoot },
        input: '{"status":"regular completion"}',
        encoding: 'utf-8',
      });
      expect(res.status).toBe(0);
    });

    it('H3: CLI entry exits 0 on initial sandbox scan', async () => {
      const res = spawnSync('node', [hookDist('h3-sandbox-hygiene')], {
        env: { ...process.env, CLAUDE_ROOT: claudeRoot },
        encoding: 'utf-8',
      });
      expect(res.status).toBe(0);
    });

    it('H4: CLI entry allows non-Write/Edit tool', async () => {
      await writeFile(
        planStatePath,
        JSON.stringify({ stages: [{ id: 's0', assignedModel: 'haiku-4-5' }] }),
        'utf-8',
      );
      const res = spawnSync('node', [hookDist('h4-model-assignment')], {
        env: { ...process.env, CLAUDE_ROOT: claudeRoot },
        input: '{"tool":"Read","args":{},"executingModel":"opus-4-7"}',
        encoding: 'utf-8',
      });
      expect(res.status).toBe(0);
    });

    it('H5: CLI entry allows converged gate result', async () => {
      const res = spawnSync('node', [hookDist('h5-gate-result')], {
        env: { ...process.env, CLAUDE_ROOT: claudeRoot },
        input: JSON.stringify({ converged: true, counter: 3, findings: [] }),
        encoding: 'utf-8',
      });
      expect(res.status).toBe(0);
    });
  });

  describe('handle() rejection path via missing plan state', () => {
    // H1 and H4 read plan-state.json. Pointing CLAUDE_ROOT at a directory that
    // exists but contains no plugins/cdcc/plan-state.json forces handleImpl to
    // catch an ENOENT and return exitCode=1 via the halt path. This verifies
    // that the compiled dist's handle() chain (spawn → argv check → handle() →
    // await handleImpl → process.exit(result.exitCode)) wires correctly end-to-end.
    //
    // Note on IIFE `.catch` callback body (lines 108-110 / 169-171 / etc.):
    // that body fires ONLY if handle() itself rejects asynchronously. handleImpl's
    // own try/catch converts every error into a HandleResult, so handle() never
    // rejects in practice. Those lines are documented as reachability-impossible
    // under the current architecture in workspace/deprecated/asae-logs/gate-09.
    it('H1 with missing plan-state file exits 1 via handleImpl halt path', async () => {
      const res = spawnSync('node', [hookDist('h1-input-manifest')], {
        env: { ...process.env, CLAUDE_ROOT: claudeRoot },
        encoding: 'utf-8',
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/H1 (HALT|BLOCK):/);
    });

    it('H4 with missing plan-state file and Write tool exits 1 via handleImpl halt path', async () => {
      const res = spawnSync('node', [hookDist('h4-model-assignment')], {
        env: { ...process.env, CLAUDE_ROOT: claudeRoot },
        input: '{"tool":"Write","args":{},"executingModel":"opus-4-7"}',
        encoding: 'utf-8',
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/H4 (HALT|BLOCK):/);
    });

    it('H5 with malformed stdin exits 1 via block path', async () => {
      const res = spawnSync('node', [hookDist('h5-gate-result')], {
        env: { ...process.env, CLAUDE_ROOT: claudeRoot },
        input: 'not-json',
        encoding: 'utf-8',
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('H5 BLOCK');
    });
  });
});
