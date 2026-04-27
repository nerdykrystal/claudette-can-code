// Coverage for handle() block paths across H1–H5 — ensures the inner arrow
// functions (stderrWrite, emit, readFileWrapper, stdinReader) are actually
// invoked, plus the ?? null / ?? 0 default branches on stage-id lookups.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

let originalExit: typeof process.exit;
let exitCapture: number | undefined;

function stubExit(): void {
  originalExit = process.exit;
  exitCapture = undefined;
  process.exit = ((code?: number): never => {
    exitCapture = code ?? 0;
    throw new Error(`__test_exit_stub__:${String(code)}`);
  }) as typeof process.exit;
}

function restoreExit(): void {
  process.exit = originalExit;
}

function pipeFakeStdin(payload: string): void {
  const stream = Readable.from([payload]);
  Object.defineProperty(process, 'stdin', {
    value: stream,
    configurable: true,
    writable: true,
  });
}

describe('Hook handle() block paths — inner arrow invocation + default branches', () => {
  let claudeRoot: string;

  beforeEach(async () => {
    claudeRoot = await mkdtemp(join(tmpdir(), 'cdcc-handle-block-'));
    await mkdir(join(claudeRoot, 'plugins', 'cdcc'), { recursive: true });
    process.env.CLAUDE_ROOT = claudeRoot;
    stubExit();
  });

  afterEach(async () => {
    restoreExit();
    delete process.env.CLAUDE_ROOT;
    vi.doUnmock('../../src/core/audit/index.js');
    vi.resetModules();
    await rm(claudeRoot, { recursive: true, force: true });
  });

  it('H1 handle() with stages containing no id property (?? null branch on audit.stage)', async () => {
    await writeFile(
      join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json'),
      // First stage has inputManifest (length>0) → hasManifest=true → happy path.
      // But first stage has NO `id` — the `plan.stages?.[0]?.id ?? null` expression
      // falls through to the null branch.
      JSON.stringify({ stages: [{ inputManifest: ['file.ts'] }] }),
      'utf-8',
    );
    const { handle } = await import('../../src/hooks/h1-input-manifest/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:0/);
    expect(exitCapture).toBe(0);
  });

  it('H1 handle() with no stages field at all (?? 0 branch on manifestCount)', async () => {
    await writeFile(
      join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json'),
      // No `stages` property at all → plan.stages is undefined → hasManifest=false
      // → block path → stderrWrite invoked.
      JSON.stringify({}),
      'utf-8',
    );
    const { handle } = await import('../../src/hooks/h1-input-manifest/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:2/);
    expect(exitCapture).toBe(2);
  });

  it('H2 handle() block path on BUILD_COMPLETE without deviationManifest', async () => {
    pipeFakeStdin('BUILD_COMPLETE reached at stage qa');
    const { handle } = await import('../../src/hooks/h2-deviation-manifest/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:2/);
    expect(exitCapture).toBe(2);
  });

  it('H3 handle() halt path via auditLogger throw (stderrWrite invoked)', async () => {
    // Mock the audit module so log() throws on first call. handleImpl's outer
    // catch re-invokes log() (which also throws). The rejection escapes handleImpl
    // → handle() rejects → process.exit is not called from handle() → our stubbed
    // exit also never records. But handle() itself throws, which gets caught by
    // vitest's expect(...).rejects.
    vi.doMock('../../src/core/audit/index.js', async () => {
      const actual = await vi.importActual<typeof import('../../src/core/audit/index.js')>(
        '../../src/core/audit/index.js',
      );
      class ThrowingAuditLogger {
        public readonly logDir: string;
        constructor(logDir: string) {
          this.logDir = logDir;
        }
        async log(): Promise<never> {
          throw new Error('audit-log-always-throws');
        }
        async query(): Promise<[]> {
          return [];
        }
      }
      return {
        ...actual,
        AuditLogger: ThrowingAuditLogger as unknown as typeof actual.AuditLogger,
      };
    });
    vi.resetModules();

    const { handle } = await import('../../src/hooks/h3-sandbox-hygiene/index.js');
    await expect(handle()).rejects.toThrow(/audit-log-always-throws/);
  });

  it('H4 handle() block path on model mismatch (emit + stderrWrite invoked)', async () => {
    // Stage 08a: write plan-state + HMAC sidecar via PlanStateStore.write() so HMAC
    // verification passes and the mismatch path is exercised (not the hmac_missing path).
    const { PlanStateStore } = await import('../../src/core/plan-state/index.js');
    const planStatePath = join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json');
    const hmacKeyPath = join(claudeRoot, 'plugins', 'cdcc', 'hmac.key');
    const store = new PlanStateStore({ jsonPath: planStatePath, hmacKeyPath });
    await store.write({ stages: [{ id: 's0', assignedModel: 'haiku-4-5' }] } as never);
    // executingModel='opus-4-7' ≠ assignedModel='haiku-4-5' → block + redirect emit.
    // Stage 08a: model mismatch is fail-closed → exit 2
    pipeFakeStdin('{"tool":"Write","args":{"path":"a.ts"},"executingModel":"opus-4-7"}');
    const { handle } = await import('../../src/hooks/h4-model-assignment/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:2/);
    expect(exitCapture).toBe(2);
  });

  it('H4 handle() block path: no current stage — fail-closed exit 2 (stage-08a)', async () => {
    // Stage 08a: write plan-state + HMAC sidecar so HMAC passes; then empty stages triggers
    // stage-not-found fail-closed path (exit 2).
    const { PlanStateStore } = await import('../../src/core/plan-state/index.js');
    const planStatePath = join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json');
    const hmacKeyPath = join(claudeRoot, 'plugins', 'cdcc', 'hmac.key');
    const store = new PlanStateStore({ jsonPath: planStatePath, hmacKeyPath });
    // Empty stages: currentStageId = undefined, currentStage = undefined → fail-closed exit 2.
    await store.write({ stages: [] } as never);
    pipeFakeStdin('{"tool":"Write","args":{},"executingModel":"opus-4-7"}');
    const { handle } = await import('../../src/hooks/h4-model-assignment/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:2/);
    expect(exitCapture).toBe(2);
  });

  it('H4 handle() block path with malformed plan-state — exit 2 (stage-08a fail-closed)', async () => {
    // Stage 08a: malformed plan-state is now fail-closed (exit 2) not halt (exit 1).
    // PlanStateStore.read() returns malformed_json → structured stderr + exit 2.
    await writeFile(
      join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json'),
      'this is not json {{{',
      'utf-8',
    );
    pipeFakeStdin('{"tool":"Write","args":{},"executingModel":"opus-4-7"}');
    const { handle } = await import('../../src/hooks/h4-model-assignment/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:2/);
    expect(exitCapture).toBe(2);
  });

  it('H5 handle() block path on non-converged gate result', async () => {
    pipeFakeStdin(
      JSON.stringify({
        converged: false,
        counter: 0,
        findings: [
          { severity: 'CRITICAL', message: 'sample finding' },
          { severity: 'HIGH', message: 'another finding' },
        ],
      }),
    );
    const { handle } = await import('../../src/hooks/h5-gate-result/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:2/);
    expect(exitCapture).toBe(2);
  });

  it('H5 handle() block path on malformed gate result (invalid JSON)', async () => {
    pipeFakeStdin('not-json-at-all');
    const { handle } = await import('../../src/hooks/h5-gate-result/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:2/);
    expect(exitCapture).toBe(2);
  });
});
