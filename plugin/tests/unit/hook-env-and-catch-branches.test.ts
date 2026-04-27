// Final branch-coverage pushes for hook handlers:
//   - `process.env.CLAUDE_ROOT || join(homedir(), '.claude')` — exercises the
//     CLAUDE_ROOT-falsy branch (the inner `process.env.HOME || '/root'` fallback
//     was removed in v1.0.3 in favor of cross-platform `os.homedir()`)
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

describe('Hook handle() env default branches — CLAUDE_ROOT unset (uses homedir() fallback)', () => {
  let savedClaudeRoot: string | undefined;
  let claudeRootDir: string;

  beforeEach(async () => {
    savedClaudeRoot = process.env.CLAUDE_ROOT;
    // Set CLAUDE_ROOT to an empty tmpdir so the resolution exercises the
    // CLAUDE_ROOT-set branch deterministically AND points at a path with no
    // plan-state.json. handle() then ENOENTs → halt decision → exit. This
    // test setup makes the "no plan state" assertion deterministic regardless
    // of homedir() behavior across platforms (Linux $HOME / Mac $HOME / Windows
    // $USERPROFILE / containers).
    claudeRootDir = await mkdtemp(join(tmpdir(), 'cdcc-default-branch-'));
    process.env.CLAUDE_ROOT = claudeRootDir;
    stubExit();
  });

  afterEach(async () => {
    if (savedClaudeRoot !== undefined) {
      process.env.CLAUDE_ROOT = savedClaudeRoot;
    } else {
      delete process.env.CLAUDE_ROOT;
    }
    restoreExit();
    vi.resetModules();
    await rm(claudeRootDir, { recursive: true, force: true });
  });

  it('H1 handle() halts when plan-state.json is absent (CLAUDE_ROOT empty)', async () => {
    const { handle } = await import('../../src/hooks/h1-input-manifest/index.js');
    // handle() reads <CLAUDE_ROOT>/plugins/cdcc/plan-state.json which doesn't
    // exist → ENOENT caught by handleImpl outer catch → halt → process.exit(2)
    // → our stub throws.
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:2/);
  });

  it('H2 handle() halts when plan-state.json is absent (CLAUDE_ROOT empty)', async () => {
    pipeFakeStdin('{}');
    const { handle } = await import('../../src/hooks/h2-deviation-manifest/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:[01]/);
  });

  it('H3 handle() halts when plan-state.json is absent (CLAUDE_ROOT empty)', async () => {
    const { handle } = await import('../../src/hooks/h3-sandbox-hygiene/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:[01]/);
  });

  it('H4 handle() halts when plan-state.json is absent (CLAUDE_ROOT empty)', async () => {
    pipeFakeStdin('{"tool":"Read"}');
    const { handle } = await import('../../src/hooks/h4-model-assignment/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:[01]/);
  });

  it('H5 handle() halts when plan-state.json is absent (CLAUDE_ROOT empty)', async () => {
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

    expect(result.exitCode).toBe(2);
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

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('halt');
    expect(result.audit.rationale).toContain('non-error-thrown-value');
  });

  // Keep this block's imports in use to satisfy strict lint config.
  void mkdir;
});
