// Targeted coverage for the last remaining uncovered branches across:
// - audit/index.ts:135-136 (malformed JSONL line skipped), 140-141 (readdir fails)
// - bundle/index.ts:119-120 (readFile throws → PARSE_FAIL)
// - gate/index.ts:43 (default maxIterations when omitted)
// - hook-installer/index.ts:57-58 (non-Error throw re-thrown), 66-70 (hooks is not a record)
// - plan-generator/index.ts:104-108 (fallback when stageType absent from model maps)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AuditLogger } from '../../src/core/audit/index.js';
import { consume, consumeOne } from '../../src/core/bundle/index.js';
import { runGate, type GateScope, type Finding } from '../../src/core/gate/index.js';
import type { HookEntry } from '../../src/core/hook-installer/index.js';

describe('Audit Logger — query() error paths (lines 135-136, 140-141)', () => {
  let logDir: string;

  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), 'cdcc-audit-query-'));
  });

  afterEach(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  it('lines 135-136: malformed JSONL lines are skipped without throwing', async () => {
    const logger = new AuditLogger(logDir);
    // Write a log file that mixes valid + malformed lines.
    const todayFile = join(logDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    await writeFile(
      todayFile,
      [
        JSON.stringify({
          ts: '2026-04-24T00:00:00Z',
          hookId: 'H1',
          stage: null,
          decision: 'allow',
          rationale: 'valid',
          payload: {},
        }),
        'this-is-not-json-{malformed',
        '{"also": "malformed but not matching schema"}',
        JSON.stringify({
          ts: '2026-04-24T00:00:01Z',
          hookId: 'H2',
          stage: null,
          decision: 'allow',
          rationale: 'valid2',
          payload: {},
        }),
      ].join('\n'),
      'utf-8',
    );

    const entries = await logger.query();
    // Valid entries returned; malformed lines silently skipped.
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.some((e) => e.rationale === 'valid')).toBe(true);
    expect(entries.some((e) => e.rationale === 'valid2')).toBe(true);
  });

  it('lines 140-141: query() returns empty array when logDir does not exist', async () => {
    const logger = new AuditLogger(join(logDir, 'does-not-exist'));
    const entries = await logger.query();
    expect(entries).toEqual([]);
  });
});

describe('Bundle Consumer — per-doc readFile catch (lines 119-120)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('node:fs/promises');
  });

  it('lines 119-120: PARSE_FAIL when readFile throws on a candidate doc', async () => {
    const realFsp = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.doMock('node:fs/promises', () => ({
      ...realFsp,
      readFile: async () => {
        throw new Error('simulated disk failure');
      },
      default: { ...realFsp },
    }));
    vi.resetModules();

    const mod = await import('../../src/core/bundle/index.js');
    // consumeOne is exported for this exact coverage purpose (if not, use consume()).
    const hasConsumeOne = typeof (mod as Record<string, unknown>).consumeOne === 'function';
    if (hasConsumeOne) {
      const result = await (mod as unknown as { consumeOne: (p: string, k: string) => Promise<unknown> }).consumeOne(
        '/fake/path.md',
        'PRD',
      );
      expect((result as { ok: boolean }).ok).toBe(false);
      expect((result as { error: { code: string } }).error.code).toBe('PARSE_FAIL');
    } else {
      // Fallback: exercise the same catch via consume() with a fake dir — readFile throws on any file
      const tempDir = await realFsp.mkdtemp(join(tmpdir(), 'cdcc-bundle-err-'));
      // Create placeholder files so the glob matches them (glob uses fs.readdir, which we didn't mock).
      await realFsp.writeFile(join(tempDir, 'PRD.md'), '# placeholder');
      await realFsp.writeFile(join(tempDir, 'TRD.md'), '# placeholder');
      await realFsp.writeFile(join(tempDir, 'AVD.md'), '# placeholder');
      await realFsp.writeFile(join(tempDir, 'TQCD.md'), '# placeholder');
      const result = await mod.consume(tempDir);
      expect(result.ok).toBe(false);
      // Error code can be MISSING_DOC or PARSE_FAIL depending on glob order + readFile timing.
      if (!result.ok) {
        expect(['PARSE_FAIL', 'MISSING_DOC']).toContain(result.error.code);
      }
      await realFsp.rm(tempDir, { recursive: true, force: true });
    }
    // Use consume import so TS doesn't complain about unused
    void consume;
    void consumeOne;
  });
});

describe('Gate Engine — default maxIterations (line 43)', () => {
  it('line 43: scope.maxIterations omitted uses default 10', async () => {
    let calls = 0;
    const auditor = async (): Promise<Finding[]> => {
      calls += 1;
      return [{ severity: 'CRITICAL', message: 'never converges' }];
    };
    const scope: GateScope = {
      target: '/fake',
      sources: [],
      prompt: '',
      domain: 'code',
      threshold: 3,
      severityPolicy: 'standard',
      // maxIterations deliberately omitted → ?? 10 defaults to 10
    };
    const result = await runGate(scope, auditor);
    expect(result.converged).toBe(false);
    expect(result.iterations).toBe(10);
    expect(calls).toBe(10);
  });

  it('scope.maxIterations explicit value overrides default', async () => {
    let calls = 0;
    const auditor = async (): Promise<Finding[]> => {
      calls += 1;
      return [{ severity: 'HIGH', message: 'never converges' }];
    };
    const scope: GateScope = {
      target: '/fake',
      sources: [],
      prompt: '',
      domain: 'code',
      threshold: 3,
      severityPolicy: 'standard',
      maxIterations: 2,
    };
    const result = await runGate(scope, auditor);
    expect(result.iterations).toBe(2);
    expect(calls).toBe(2);
  });
});

describe('Hook Installer — remaining inner branches (lines 57-58, 66-70)', () => {
  let dir: string;
  const entry: HookEntry = {
    id: 'H1',
    event: 'UserPromptSubmit',
    handler: 'dist/hooks/h1-input-manifest/index.js',
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cdcc-hook-installer-final-'));
  });

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('node:fs/promises');
    await rm(dir, { recursive: true, force: true });
  });

  it('lines 57-58: non-Error throw from readFile re-throws to outer catch', async () => {
    const realFsp = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.doMock('node:fs/promises', () => ({
      ...realFsp,
      readFile: async () => {
        // Throw a non-Error value; the `if (err instanceof Error)` branch is false,
        // falling through to the outer `else throw err;` on lines 57-58.
        throw 'i-am-a-string-not-an-error';
      },
      default: { ...realFsp },
    }));
    vi.resetModules();

    const { installHooks } = await import('../../src/core/hook-installer/index.js');
    const settingsPath = join(dir, 'settings.json');
    const result = await installHooks(settingsPath, [entry]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_FAIL');
      expect(result.error.detail).toContain('i-am-a-string-not-an-error');
    }
  });

  it('lines 66-70: PARSE_FAIL when settings.hooks is an array (not a record)', async () => {
    const settingsPath = join(dir, 'settings.json');
    await writeFile(settingsPath, JSON.stringify({ hooks: ['item1', 'item2'] }), 'utf-8');

    const { installHooks } = await import('../../src/core/hook-installer/index.js');
    const result = await installHooks(settingsPath, [entry]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_FAIL');
      expect(result.error.detail).toContain('hooks is not a record');
    }
  });

  it('lines 66-70: PARSE_FAIL when settings.hooks is a primitive string', async () => {
    const settingsPath = join(dir, 'settings.json');
    await writeFile(settingsPath, JSON.stringify({ hooks: 'not-an-object' }), 'utf-8');

    const { installHooks } = await import('../../src/core/hook-installer/index.js');
    const result = await installHooks(settingsPath, [entry]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_FAIL');
    }
  });
});

describe('Plan Generator — stage-type fallback default (lines 104-108)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../src/core/backwards-planning/index.js');
  });

  it('lines 104-108: stage whose id is a "plan-*" variant outside the known map falls back to haiku/medium/Deep/3', async () => {
    // Mock the backwards-planning engine to emit a stage whose id contains 'plan'
    // but is neither 'plan-skeleton' nor 'plan-full' — so stageType = stage.id and
    // none of modelMap/effortMap/depthMap/gateThresholdMap has that key, exercising
    // the `|| 'haiku-4-5'` / `|| 'medium'` / `|| 'Deep'` / `|| 3` fallbacks.
    vi.doMock('../../src/core/backwards-planning/index.js', () => ({
      planBackwards: () => [
        {
          id: 'plan-custom-variant',
          name: 'Custom variant stage',
          purpose: 'exercise fallback',
          dependsOn: [],
        },
      ],
    }));
    vi.resetModules();

    const { generate } = await import('../../src/core/plan-generator/index.js');
    const bundle = {
      prd: { kind: 'PRD' as const, path: '/fake/PRD.md', content: '# PRD', frontmatter: {} },
      trd: { kind: 'TRD' as const, path: '/fake/TRD.md', content: '# TRD', frontmatter: {} },
      avd: { kind: 'AVD' as const, path: '/fake/AVD.md', content: '# AVD', frontmatter: {} },
      tqcd: { kind: 'TQCD' as const, path: '/fake/TQCD.md', content: '# TQCD', frontmatter: {} },
    };
    const catalog = {
      skills: [],
      plugins: [],
      mcpServers: [],
      source: { settingsPath: '/fake/settings.json', pluginsDir: '/fake/plugins' },
    };

    const result = await generate({ bundle, catalog });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const stage = result.value.stages.find((s) => s.id === 'plan-custom-variant');
      expect(stage).toBeDefined();
      if (stage) {
        // Fallbacks applied per `|| ...` on each map lookup.
        expect(stage.assignedModel).toBe('haiku-4-5');
        expect(stage.effortLevel).toBe('medium');
        expect(stage.specDepth).toBe('Deep');
        expect(stage.gate.threshold).toBe(3);
      }
    }
  });
});
