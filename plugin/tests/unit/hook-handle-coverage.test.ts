// In-process coverage for each hook's exported `handle()` function body
// (including the readFileWrapper / stdinReader inner definitions).
// Strategy: import `handle()` + stub `process.exit` + stub `process.stdin` so the
// in-process call path of handle() is exercised by vitest's coverage instrumentation.
// The CLI entry-point IIFE itself (`if (import.meta.url === pathToFileURL(process.argv[1]).href)`)
// remains unreachable in-process because `process.argv[1]` points at vitest — that
// branch is documented as reachability-impossible in gate-09.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';

let exitCapture: number | undefined;
let originalExit: typeof process.exit;

function stubProcessExit(): void {
  originalExit = process.exit;
  exitCapture = undefined;
  process.exit = ((code?: number): never => {
    exitCapture = code ?? 0;
    throw new Error(`__test_exit_stub__:${String(code)}`);
  }) as typeof process.exit;
}

function restoreProcessExit(): void {
  process.exit = originalExit;
}

function pipeFakeStdin(payload: string): void {
  const stream = Readable.from([payload]);
  // Override the global process.stdin for the duration of the test.
  Object.defineProperty(process, 'stdin', {
    value: stream,
    configurable: true,
    writable: true,
  });
}

describe('Hook handle() function bodies — in-process coverage', () => {
  let claudeRoot: string;

  beforeEach(async () => {
    claudeRoot = await mkdtemp(join(tmpdir(), 'cdcc-handle-cov-'));
    await mkdir(join(claudeRoot, 'plugins', 'cdcc'), { recursive: true });
    process.env.CLAUDE_ROOT = claudeRoot;
    stubProcessExit();
  });

  afterEach(async () => {
    restoreProcessExit();
    delete process.env.CLAUDE_ROOT;
    vi.resetModules();
    await rm(claudeRoot, { recursive: true, force: true });
  });

  it('H1 handle() reads plan-state, runs handleImpl, and calls process.exit with block code', async () => {
    await writeFile(
      join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json'),
      JSON.stringify({ stages: [{ id: 's0', inputManifest: [] }] }),
      'utf-8',
    );
    const { handle } = await import('../../src/hooks/h1-input-manifest/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:1/);
    expect(exitCapture).toBe(1);
  });

  it('H2 handle() reads stdin, runs handleImpl, and calls process.exit with allow code', async () => {
    pipeFakeStdin('{"status":"not a build complete"}');
    const { handle } = await import('../../src/hooks/h2-deviation-manifest/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:0/);
    expect(exitCapture).toBe(0);
  });

  it('H3 handle() runs initial scan and calls process.exit with allow code', async () => {
    const { handle } = await import('../../src/hooks/h3-sandbox-hygiene/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:0/);
    expect(exitCapture).toBe(0);
  });

  it('H4 handle() reads stdin + plan-state (exercises readFileWrapper body)', async () => {
    // Stage 08a: H4 now uses PlanStateStore.read() (HMAC-aware) for plan-state reads.
    // Write plan-state + HMAC sidecar via PlanStateStore.write() so HMAC verification passes.
    const { PlanStateStore } = await import('../../src/core/plan-state/index.js');
    const planStatePath = join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json');
    const hmacKeyPath = join(claudeRoot, 'plugins', 'cdcc', 'hmac.key');
    const store = new PlanStateStore({ jsonPath: planStatePath, hmacKeyPath });
    await store.write({ stages: [{ id: 's0', assignedModel: 'opus-4-7' }] } as never);
    pipeFakeStdin('{"tool":"Write","args":{"path":"a"},"executingModel":"opus-4-7"}');
    const { handle } = await import('../../src/hooks/h4-model-assignment/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:0/);
    expect(exitCapture).toBe(0);
  });

  it('H5 handle() reads stdin converged result and calls process.exit with allow code', async () => {
    pipeFakeStdin(JSON.stringify({ converged: true, counter: 3, findings: [] }));
    const { handle } = await import('../../src/hooks/h5-gate-result/index.js');
    await expect(handle()).rejects.toThrow(/__test_exit_stub__:0/);
    expect(exitCapture).toBe(0);
  });
});
