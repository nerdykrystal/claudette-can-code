// Stage 08b — H3 Fail-Closed: 1 exit-2 path assertion.
// H3 only has one fail-closed path: the outer catch (handler error).
// All other paths in H3 are allow (exit 0) — even marker creation failures
// are best-effort and do not change the allow decision.
// Per §3.08b spec + PRD-AR-NV-01 + PRD-AR-04.

import { describe, it, expect } from 'vitest';
import { handleImpl, type HandleDeps } from '../../../../src/hooks/h3-sandbox-hygiene/index.js';
import type { AuditLogger } from '../../../../src/core/audit/index.js';

describe('H3 exit-paths — Stage 08b fail-closed (1 path exit 2)', () => {
  // Path 1: handler error (auditLogger.log throws in happy path) → outer catch → exit 2
  it('Path 1 — handler error (auditLogger.log throws): exit 2 + stderr rule=h3_handler_error', async () => {
    const stderr: string[] = [];
    let logCall = 0;
    const failingLogger: AuditLogger = {
      log: async () => {
        logCall += 1;
        if (logCall === 1) {
          throw new Error('audit-disk-full');
        }
        return { ok: true as const, value: undefined };
      },
    } as unknown as AuditLogger;

    const deps: HandleDeps = {
      readFile: async () => {
        throw new Error('ENOENT: no marker');
      },
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      auditLogger: failingLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderr.push(msg),
      sandboxMarkerPath: '/fake/marker',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('halt');
    expect(result.audit.rationale).toContain('H3 handler error');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h3_handler_error');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detail).toBe('string');
  });
});
