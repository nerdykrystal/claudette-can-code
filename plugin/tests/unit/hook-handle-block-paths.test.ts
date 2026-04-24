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
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:1/);
    expect(exitCapture).toBe(1);
  });

  it('H2 handle() block path on BUILD_COMPLETE without deviationManifest', async () => {
    pipeFakeStdin('BUILD_COMPLETE reached at stage qa');
    const { handle } = await import('../../src/hooks/h2-deviation-manifest/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:1/);
    expect(exitCapture).toBe(1);
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
    await writeFile(
      join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json'),
      JSON.stringify({ stages: [{ id: 's0', assignedModel: 'haiku-4-5' }] }),
      'utf-8',
    );
    // executingModel='opus-4-7' ≠ assignedModel='haiku-4-5' → block + redirect emit.
    pipeFakeStdin('{"tool":"Write","args":{"path":"a.ts"},"executingModel":"opus-4-7"}');
    const { handle } = await import('../../src/hooks/h4-model-assignment/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:1/);
    expect(exitCapture).toBe(1);
  });

  it('H4 handle() allow path: no current stage (currentStageId ?? null branch)', async () => {
    await writeFile(
      join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json'),
      // Empty stages: currentStageId = undefined, currentStage = undefined → allow path at 80.
      JSON.stringify({ stages: [] }),
      'utf-8',
    );
    pipeFakeStdin('{"tool":"Write","args":{},"executingModel":"opus-4-7"}');
    const { handle } = await import('../../src/hooks/h4-model-assignment/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:0/);
    expect(exitCapture).toBe(0);
  });

  it('H4 handle() halt path with malformed plan-state (catch at 124 + stderrWrite at 141)', async () => {
    await writeFile(
      join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json'),
      'this is not json {{{',
      'utf-8',
    );
    pipeFakeStdin('{"tool":"Write","args":{},"executingModel":"opus-4-7"}');
    const { handle } = await import('../../src/hooks/h4-model-assignment/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:1/);
    expect(exitCapture).toBe(1);
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
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:1/);
    expect(exitCapture).toBe(1);
  });

  it('H5 handle() block path on malformed gate result (invalid JSON)', async () => {
    pipeFakeStdin('not-json-at-all');
    const { handle } = await import('../../src/hooks/h5-gate-result/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:1/);
    expect(exitCapture).toBe(1);
  });
});
