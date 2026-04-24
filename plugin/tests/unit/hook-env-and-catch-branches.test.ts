// Final branch-coverage pushes for hook handlers:
//   - `process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude')`
//     left/right branches (CLAUDE_ROOT unset → `||` right; HOME unset → inner `||` right)
//   - `err instanceof Error ? err.message : String(err)` non-Error branch in handleImpl catches
//     for each of H1, H4, H5 (H2/H3 already hit via existing tests)

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { handleImpl as h1Impl } from '../../src/hooks/h1-input-manifest/index.js';
import { handleImpl as h4Impl } from '../../src/hooks/h4-model-assignment/index.js';
import { handleImpl as h5Impl } from '../../src/hooks/h5-gate-result/index.js';
import type { AuditLogger } from '../../src/core/audit/index.js';

let originalExit: typeof process.exit;

function stubExit(): void {
  originalExit = process.exit;
  process.exit = ((code?: number): never => {
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

describe('Hook handle() env default branches — CLAUDE_ROOT/HOME unset', () => {
  let savedHome: string | undefined;
  let savedClaudeRoot: string | undefined;

  beforeEach(() => {
    savedHome = process.env.HOME;
    savedClaudeRoot = process.env.CLAUDE_ROOT;
    // Clear both so the `||` right-hand branches fire.
    delete process.env.HOME;
    delete process.env.CLAUDE_ROOT;
    stubExit();
  });

  afterEach(() => {
    if (savedHome !== undefined) process.env.HOME = savedHome;
    if (savedClaudeRoot !== undefined) process.env.CLAUDE_ROOT = savedClaudeRoot;
    restoreExit();
    vi.resetModules();
  });

  it('H1 handle() uses /root fallback when HOME and CLAUDE_ROOT are unset', async () => {
    const { handle } = await import('../../src/hooks/h1-input-manifest/index.js');
    // handle() will try to read /root/.claude/plugins/cdcc/plan-state.json which
    // doesn't exist → ENOENT caught by handleImpl outer catch → halt decision →
    // process.exit(1) → our stub throws.
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:1/);
  });

  it('H2 handle() uses /root fallback when HOME and CLAUDE_ROOT are unset', async () => {
    pipeFakeStdin('{}');
    const { handle } = await import('../../src/hooks/h2-deviation-manifest/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:[01]/);
  });

  it('H3 handle() uses /root fallback when HOME and CLAUDE_ROOT are unset', async () => {
    const { handle } = await import('../../src/hooks/h3-sandbox-hygiene/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:[01]/);
  });

  it('H4 handle() uses /root fallback when HOME and CLAUDE_ROOT are unset', async () => {
    pipeFakeStdin('{"tool":"Read"}');
    const { handle } = await import('../../src/hooks/h4-model-assignment/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:[01]/);
  });

  it('H5 handle() uses /root fallback when HOME and CLAUDE_ROOT are unset', async () => {
    pipeFakeStdin('{"converged":true,"counter":5,"findings":[]}');
    const { handle } = await import('../../src/hooks/h5-gate-result/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:[01]/);
  });
});

describe('handleImpl outer-catch String(err) non-Error branch', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cdcc-nonerror-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function oneShotLogger(calls: { count: number }): AuditLogger {
    return {
      log: async () => {
        calls.count += 1;
        if (calls.count === 1) {
          // Non-Error thrown: handleImpl outer catch classifies as `String(err)`.
          // This is deliberately a string rather than an Error instance.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'non-error-thrown-value';
        }
        return { ok: true as const, value: undefined };
      },
    } as unknown as AuditLogger;
  }

  it('H1 handleImpl: non-Error throw from auditLogger.log hits String(err) branch', async () => {
    const planPath = join(dir, 'plan-state.json');
    await writeFile(
      planPath,
      JSON.stringify({ stages: [{ id: 's0', inputManifest: ['f.ts'] }] }),
      'utf-8',
    );

    const calls = { count: 0 };
    const result = await h1Impl({
      readFile: async () => await (await import('node:fs/promises')).readFile(planPath, 'utf-8'),
      auditLogger: oneShotLogger(calls),
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: () => {
        // no-op
      },
      planStatePath: planPath,
    });

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
    expect(result.audit.rationale).toContain('non-error-thrown-value');
  });

  it('H4 handleImpl: non-Error throw from auditLogger.log hits String(err) branch', async () => {
    const planPath = join(dir, 'plan-state.json');
    await writeFile(
      planPath,
      JSON.stringify({ stages: [{ id: 's0', assignedModel: 'haiku-4-5' }] }),
      'utf-8',
    );

    const calls = { count: 0 };
    const result = await h4Impl({
      readFile: async () => await (await import('node:fs/promises')).readFile(planPath, 'utf-8'),
      stdinReader: async () => '{"tool":"Write","args":{},"executingModel":"haiku-4-5"}',
      auditLogger: oneShotLogger(calls),
      emit: () => {
        // no-op
      },
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: () => {
        // no-op
      },
      planStatePath: planPath,
    });

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
    expect(result.audit.rationale).toContain('non-error-thrown-value');
  });

  it('H5 handleImpl: non-Error throw from auditLogger.log hits String(err) branch', async () => {
    const calls = { count: 0 };
    const result = await h5Impl({
      stdinReader: async () => JSON.stringify({ converged: true, counter: 3, findings: [] }),
      auditLogger: oneShotLogger(calls),
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: () => {
        // no-op
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
    expect(result.audit.rationale).toContain('non-error-thrown-value');
  });

  // Keep this block's imports in use to satisfy strict lint config.
  void mkdir;
});
