// Stage 08b — H1 Fail-Closed: 2 exit-2 path assertions.
// Each test verifies process.exit(2) is invoked + stderr JSON matches schema.
// Per §3.08b spec + PRD-AR-NV-01 + PRD-AR-04.

import { describe, it, expect } from 'vitest';
import { handleImpl, type HandleDeps } from '../../../../src/hooks/h1-input-manifest/index.js';
import type { AuditLogger } from '../../../../src/core/audit/index.js';

function noopLogger(): AuditLogger {
  return {
    log: async () => undefined,
  } as unknown as AuditLogger;
}

describe('H1 exit-paths — Stage 08b fail-closed (2 paths each exit 2)', () => {
  // Path 1: no input manifest (block) → exit 2 with h1_no_input_manifest stderr
  it('Path 1 — no input manifest: exit 2 + stderr rule=h1_no_input_manifest', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({ stages: [] }),
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderr.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h1_no_input_manifest');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detected_value).toBe('string');
  });

  // Path 2: handler error (halt) → exit 2 with h1_handler_error stderr
  it('Path 2 — handler error (plan-state missing): exit 2 + stderr rule=h1_handler_error', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      readFile: async () => {
        throw new Error('ENOENT: no such file or directory');
      },
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderr.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('halt');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h1_handler_error');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detail).toBe('string');
  });
});
