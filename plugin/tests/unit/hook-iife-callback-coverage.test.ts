// Coverage for each hook's entry-point IIFE callback body:
//   if (import.meta.url === pathToFileURL(process.argv[1]).href) {
//     handle().catch((err) => {
//       console.error('<HID> uncaught error:', err);
//       process.exit(2);
//     });
//   }
//
// Reaching the callback body requires TWO conditions simultaneously:
//   (a) the IIFE guard evaluates true — i.e., process.argv[1] equals fileURLToPath(hook_src_url)
//   (b) handle() rejects asynchronously
//
// (a) is achieved by temporarily overriding process.argv[1] to point at the hook's
//     built .js file BEFORE the module-level import evaluates the guard.
// (b) is achieved by mocking the AuditLogger so log() throws on BOTH the happy-path
//     call AND the catch-block's compensating call — the second throw escapes
//     handleImpl's outer catch (which has no inner try around its own log() call),
//     propagates through handle()'s unwrapped await, and surfaces as the rejection
//     the IIFE's .catch is designed to receive.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

interface ConsoleCapture {
  errors: string[];
  restore: () => void;
}

function captureConsoleError(): ConsoleCapture {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]): void => {
    errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
  };
  return { errors, restore: () => { console.error = original; } };
}

interface ArgvOverride {
  restore: () => void;
}

function overrideArgv(argv1: string): ArgvOverride {
  const original = process.argv[1];
  process.argv[1] = argv1;
  return { restore: () => { process.argv[1] = original; } };
}

interface ExitStub {
  calls: number[];
  restore: () => void;
}

function stubExit(): ExitStub {
  const original = process.exit;
  const calls: number[] = [];
  // Do NOT throw from the stub. The IIFE .catch callback runs inside a detached
  // microtask at module top-level eval time; a throw here becomes an unhandled
  // rejection that Stryker's dry-run classifier treats as an error outside a test.
  // We only need to observe that exit was called — which the `calls` array does.
  process.exit = ((code?: number): never => {
    calls.push(code ?? 0);
    // Return undefined via type-cast; callers never use the return value.
    return undefined as never;
  }) as typeof process.exit;
  return { calls, restore: () => { process.exit = original; } };
}

function pipeFakeStdin(payload: string): void {
  const stream = Readable.from([payload]);
  Object.defineProperty(process, 'stdin', {
    value: stream,
    configurable: true,
    writable: true,
  });
}

const PLUGIN_ROOT = resolve(__dirname, '..', '..');

// Paths to the built hook .js files (what the user actually invokes).
const HOOK_DIST = {
  h1: join(PLUGIN_ROOT, 'dist', 'hooks', 'h1-input-manifest', 'index.js'),
  h2: join(PLUGIN_ROOT, 'dist', 'hooks', 'h2-deviation-manifest', 'index.js'),
  h3: join(PLUGIN_ROOT, 'dist', 'hooks', 'h3-sandbox-hygiene', 'index.js'),
  h4: join(PLUGIN_ROOT, 'dist', 'hooks', 'h4-model-assignment', 'index.js'),
  h5: join(PLUGIN_ROOT, 'dist', 'hooks', 'h5-gate-result', 'index.js'),
};

// Specifiers the IIFE guard resolves at module-load time. Vitest transforms .ts
// imports; the runtime module URL ends up pointing at the .ts file during test
// runs. pathToFileURL(argv[1]).href must match that; the quickest way is to set
// argv[1] to the TS source absolute path and let pathToFileURL normalize it.
const HOOK_SRC = {
  h1: join(PLUGIN_ROOT, 'src', 'hooks', 'h1-input-manifest', 'index.ts'),
  h2: join(PLUGIN_ROOT, 'src', 'hooks', 'h2-deviation-manifest', 'index.ts'),
  h3: join(PLUGIN_ROOT, 'src', 'hooks', 'h3-sandbox-hygiene', 'index.ts'),
  h4: join(PLUGIN_ROOT, 'src', 'hooks', 'h4-model-assignment', 'index.ts'),
  h5: join(PLUGIN_ROOT, 'src', 'hooks', 'h5-gate-result', 'index.ts'),
};

describe('Hook entry-point IIFE .catch callback bodies (in-process)', () => {
  let claudeRoot: string;
  let argvOverride: ArgvOverride | null;
  let exit: ExitStub | null;
  let consoleCap: ConsoleCapture | null;

  beforeEach(async () => {
    claudeRoot = await mkdtemp(join(tmpdir(), 'cdcc-iife-cov-'));
    await mkdir(join(claudeRoot, 'plugins', 'cdcc'), { recursive: true });
    process.env.CLAUDE_ROOT = claudeRoot;
    argvOverride = null;
    exit = null;
    consoleCap = null;
  });

  afterEach(async () => {
    argvOverride?.restore();
    exit?.restore();
    consoleCap?.restore();
    delete process.env.CLAUDE_ROOT;
    vi.resetModules();
    vi.doUnmock('../../src/core/audit/index.js');
    await rm(claudeRoot, { recursive: true, force: true });
    // Best-effort marker of the IIFE callback check: reference hook dist paths
    // to keep them visible in the test source for the next maintainer.
    void HOOK_DIST;
  });

  async function importHookWithForcedReject(srcPath: string, hookModule: string): Promise<void> {
    // Mock AuditLogger so log() throws on EVERY call. handleImpl's catch itself
    // calls log() → the throw escapes handleImpl → handle() rejects → IIFE .catch
    // fires (because we also aligned argv[1] so the guard evaluates true).
    vi.doMock('../../src/core/audit/index.js', async () => {
      const actual =
        await vi.importActual<typeof import('../../src/core/audit/index.js')>(
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

    argvOverride = overrideArgv(srcPath);
    exit = stubExit();
    consoleCap = captureConsoleError();

    vi.resetModules();

    // Dynamic import triggers the IIFE guard evaluation at top level.
    // The guard needs `pathToFileURL(process.argv[1]).href === import.meta.url`.
    // On ESM the module URL is the actual file URL of the .ts (or compiled) file.
    // In vitest, module URLs look like `file:///.../src/hooks/hX/index.ts`.
    await import(hookModule);

    // Give the microtask queue a chance to run the rejected handle().catch callback,
    // which synchronously calls console.error then process.exit (stubbed to throw).
    // The process.exit throw escapes from microtask land — we catch it globally
    // via an unhandledRejection listener patch.
    await new Promise<void>((r) => setTimeout(r, 50));
  }

  it('H1: IIFE .catch callback body executes when handle() rejects', async () => {
    await writeFile(
      join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json'),
      JSON.stringify({ stages: [] }),
      'utf-8',
    );
    await importHookWithForcedReject(HOOK_SRC.h1, '../../src/hooks/h1-input-manifest/index.js');

    // Either console.error captured the IIFE message, or exit was called with 1
    // from inside the IIFE .catch.
    const iifeFired =
      (consoleCap?.errors ?? []).some((e) => e.includes('H1 uncaught error:')) ||
      (exit?.calls ?? []).includes(2);
    expect(iifeFired).toBe(true);
  });

  it('H2: IIFE .catch callback body executes when handle() rejects', async () => {
    pipeFakeStdin('{"status":"no build complete"}');
    await importHookWithForcedReject(HOOK_SRC.h2, '../../src/hooks/h2-deviation-manifest/index.js');
    const iifeFired =
      (consoleCap?.errors ?? []).some((e) => e.includes('H2 uncaught error:')) ||
      (exit?.calls ?? []).includes(2);
    expect(iifeFired).toBe(true);
  });

  it('H3: IIFE .catch callback body executes when handle() rejects', async () => {
    await importHookWithForcedReject(HOOK_SRC.h3, '../../src/hooks/h3-sandbox-hygiene/index.js');
    const iifeFired =
      (consoleCap?.errors ?? []).some((e) => e.includes('H3 uncaught error:')) ||
      (exit?.calls ?? []).includes(2);
    expect(iifeFired).toBe(true);
  });

  it('H4: IIFE .catch callback body executes when handle() rejects', async () => {
    pipeFakeStdin('{"tool":"Read"}');
    await importHookWithForcedReject(HOOK_SRC.h4, '../../src/hooks/h4-model-assignment/index.js');
    const iifeFired =
      (consoleCap?.errors ?? []).some((e) => e.includes('H4 uncaught error:')) ||
      (exit?.calls ?? []).includes(2);
    expect(iifeFired).toBe(true);
  });

  it('H5: IIFE .catch callback body executes when handle() rejects', async () => {
    pipeFakeStdin('not-valid-json');
    await importHookWithForcedReject(HOOK_SRC.h5, '../../src/hooks/h5-gate-result/index.js');
    const iifeFired =
      (consoleCap?.errors ?? []).some((e) => e.includes('H5 uncaught error:')) ||
      (exit?.calls ?? []).includes(2);
    expect(iifeFired).toBe(true);
  });
});
