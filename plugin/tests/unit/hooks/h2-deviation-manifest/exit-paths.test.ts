// Stage 08b — H2 Fail-Closed: 4 exit-2 path assertions.
// Each test verifies process.exit(2) is invoked + stderr JSON matches schema.
// Per §3.08b spec + PRD-AR-NV-01 + PRD-AR-04.
// Gate-22 H-2 PARTIAL→CLOSED: Array.isArray + null guard verifying substitutions is non-null array.

import { describe, it, expect } from 'vitest';
import { handleImpl, type HandleDeps } from '../../../../src/hooks/h2-deviation-manifest/index.js';
import type { AuditLogger } from '../../../../src/core/audit/index.js';

function noopLogger(): AuditLogger {
  return {
    log: async () => undefined,
  } as unknown as AuditLogger;
}

describe('H2 exit-paths — Stage 08b fail-closed (4 paths each exit 2)', () => {
  // Path 1: BUILD_COMPLETE without deviationManifest → exit 2
  it('Path 1 — no deviationManifest: exit 2 + stderr rule=h2_no_deviation_manifest', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () => 'BUILD_COMPLETE reached',
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
    expect(parsed.rule).toBe('h2_no_deviation_manifest');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detected_value).toBe('string');
  });

  // Path 2: BUILD_COMPLETE + manifest present but schema invalid → exit 2
  it('Path 2 — manifest schema invalid: exit 2 + stderr rule=h2_manifest_schema_invalid', async () => {
    const stderr: string[] = [];
    // Payload with deviationManifest that has substitutions: [] — passes Array.isArray guard but fails schema if required items missing
    // Actually {"substitutions":[]} is valid per schema (empty array). Use a manifest without substitutions field.
    const payload = 'BUILD_COMPLETE "deviationManifest": {"notSubstitutions": true}';
    const deps: HandleDeps = {
      stdinReader: async () => payload,
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
    expect(parsed.rule).toBe('h2_manifest_schema_invalid');
    expect(parsed.resolution).toBeTruthy();
  });

  // Path 3: BUILD_COMPLETE + manifest with null substitutions (gate-22 H-2 guard) → exit 2
  it('Path 3 — substitutions null (gate-22 H-2 guard): exit 2 + stderr rule=h2_manifest_schema_invalid', async () => {
    const stderr: string[] = [];
    // {"substitutions":null} — passes Array.isArray(null) → false → guard fires
    const payload = 'BUILD_COMPLETE "deviationManifest": {"substitutions":null}';
    const deps: HandleDeps = {
      stdinReader: async () => payload,
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
    expect(parsed.rule).toBe('h2_manifest_schema_invalid');
    expect(parsed.resolution).toBeTruthy();
    expect(parsed.detail).toContain('non-null array');
  });

  // Path 4: handler error (stdin read throws) → exit 2
  it('Path 4 — handler error (stdin read): exit 2 + stderr rule=h2_handler_error', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () => {
        throw new Error('EPIPE: broken pipe');
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
    expect(parsed.rule).toBe('h2_handler_error');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detail).toBe('string');
  });
});
