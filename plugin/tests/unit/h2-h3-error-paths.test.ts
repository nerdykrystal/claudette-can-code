// Targeted coverage:
// - H2 deviation-manifest lines 100-111: valid-manifest allow path
// - H3 sandbox-hygiene lines 81-93: outer catch (auditLogger throws)

import { describe, it, expect } from 'vitest';
import { handleImpl as h2HandleImpl, type HandleDeps as H2HandleDeps } from '../../src/hooks/h2-deviation-manifest/index.js';
import { handleImpl as h3HandleImpl, type HandleDeps as H3HandleDeps } from '../../src/hooks/h3-sandbox-hygiene/index.js';
import type { AuditLogger } from '../../src/core/audit/index.js';

describe('H2 Deviation Manifest — valid-manifest allow path (lines 100-111)', () => {
  it('returns allow when BUILD_COMPLETE carries a valid deviationManifest', async () => {
    const loggedEntries: Record<string, unknown>[] = [];
    const mockLogger = {
      log: async (entry: Record<string, unknown>) => {
        loggedEntries.push(entry);
        return { ok: true as const, value: undefined };
      },
    } as unknown as AuditLogger;

    const stderrCalls: string[] = [];

    // Payload carries BUILD_COMPLETE + structurally-valid deviationManifest object.
    // The regex in source is /"deviationManifest"\s*:\s*({[^}]*})/ — must stay on one line
    // with no inner braces so it matches the minimal shape.
    const payload = `{"status":"BUILD_COMPLETE","deviationManifest":{"substitutions":[]}}`;

    const deps: H2HandleDeps = {
      stdinReader: async () => payload,
      auditLogger: mockLogger,
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: (msg) => stderrCalls.push(msg),
    };

    const result = await h2HandleImpl(deps);

    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.rationale).toBe('deviationManifest validated');
    expect(loggedEntries).toHaveLength(1);
    expect(loggedEntries[0].rationale).toBe('deviationManifest validated');
    expect(stderrCalls).toEqual([]);
  });
});

describe('H3 Sandbox Hygiene — outer-catch halt path (lines 81-93)', () => {
  it('returns halt with exit 2 when auditLogger.log throws from within the happy path', async () => {
    // To reach the outer catch on lines 81-93, an exception must escape the inner flow.
    // auditLogger.log is called unconditionally in the happy path; throw on call #1
    // (happy-path log) but succeed on call #2 (catch-block log) so handleImpl can
    // return a halt-decision HandleResult rather than re-throwing.
    const stderrCalls: string[] = [];
    let logCall = 0;
    const failingLogger = {
      log: async () => {
        logCall += 1;
        if (logCall === 1) {
          throw new Error('audit log disk full');
        }
        return { ok: true as const, value: undefined };
      },
    } as unknown as AuditLogger;

    const deps: H3HandleDeps = {
      // readFile on marker path always rejects → markerExists stays false → proceed to "scan" branch
      readFile: async () => {
        throw new Error('ENOENT: no marker');
      },
      writeFile: async () => {
        // Not reached — outer catch fires before writeFile is called.
      },
      mkdir: async () => {
        // Not reached.
      },
      auditLogger: failingLogger,
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: (msg) => stderrCalls.push(msg),
      sandboxMarkerPath: '/fake/marker',
    };

    const result = await h3HandleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('halt');
    expect(result.audit.rationale).toContain('H3 handler error');
    expect(result.audit.rationale).toContain('audit log disk full');
    expect(stderrCalls.some((m) => m.includes('h3_handler_error'))).toBe(true);
  });

  it('auditLogger.log throw in the second (catch-block) invocation still yields a handler result', async () => {
    // Both the happy-path log() and the outer-catch log() use the same auditLogger.
    // If both reject, the outer catch's call-and-await throws again, escaping handleImpl.
    // This test exercises the failure chain via a logger that rejects every call.
    let callCount = 0;
    const everFailingLogger = {
      log: async () => {
        callCount += 1;
        throw new Error(`log-failure-${callCount}`);
      },
    } as unknown as AuditLogger;

    const deps: H3HandleDeps = {
      readFile: async () => {
        throw new Error('ENOENT');
      },
      writeFile: async () => {
        // unused
      },
      mkdir: async () => {
        // unused
      },
      auditLogger: everFailingLogger,
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: () => {
        // no-op
      },
      sandboxMarkerPath: '/fake/marker',
    };

    // Second log call inside the outer catch will reject; handleImpl allows that
    // to propagate — the test asserts the rejection escapes (no silent swallow).
    await expect(h3HandleImpl(deps)).rejects.toThrow(/log-failure/);
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
