// Stage 08b — H5 Fail-Closed: 4 exit-2 path assertions.
// Each test verifies process.exit(2) is invoked + stderr JSON matches schema.
// Per §3.08b spec + PRD-AR-NV-01 + PRD-AR-04.

import { describe, it, expect } from 'vitest';
import { handleImpl, type HandleDeps } from '../../../../src/hooks/h5-gate-result/index.js';
import type { AuditLogger } from '../../../../src/core/audit/index.js';

function noopLogger(): AuditLogger {
  return {
    log: async () => undefined,
  } as unknown as AuditLogger;
}

describe('H5 exit-paths — Stage 08b fail-closed (4 paths each exit 2)', () => {
  // Path 1: stdin parse error → exit 2
  it('Path 1 — stdin parse error: exit 2 + stderr rule=h5_parse_error', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () => 'not-valid-json {{',
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderr.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h5_parse_error');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detected_value).toBe('string');
  });

  // Path 2: schema invalid → exit 2
  it('Path 2 — schema invalid: exit 2 + stderr rule=h5_schema_invalid', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify({ converged: 'not-a-bool' }),
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderr.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h5_schema_invalid');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detail).toBe('string');
  });

  // Path 3: not converged → exit 2
  it('Path 3 — not converged: exit 2 + stderr rule=h5_not_converged', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () =>
        JSON.stringify({
          converged: false,
          counter: 1,
          findings: [{ severity: 'CRITICAL', message: 'test failure detected' }],
        }),
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderr.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h5_not_converged');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.findings).toBe('string');
    expect((parsed.findings as string)).toContain('[CRITICAL]');
  });

  // Path 4: handler error (stdin read throws) → exit 2
  it('Path 4 — handler error (stdin read): exit 2 + stderr rule=h5_handler_error', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () => {
        throw new Error('stdin read failed');
      },
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderr.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('halt');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h5_handler_error');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detail).toBe('string');
  });
});
