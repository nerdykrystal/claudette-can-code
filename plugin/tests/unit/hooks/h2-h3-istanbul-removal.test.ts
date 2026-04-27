// Tests that exercise the two paths previously hidden behind istanbul-ignore
// comments at h2:114 and h3:76. Removing those comments forced these paths
// into normal coverage measurement.
//
// H2: BUILD_COMPLETE detected + deviationManifest substring present + regex
//     captures something + JSON.parse on the captured group throws → catch
//     fires → MUST return block (FR-008 anti-silent-substitution).
//     This was previously a defect: the catch swallowed the error and fell
//     through to the "no BUILD_COMPLETE" allow path. The source has been
//     amended to explicitly block + emit a structured audit entry. The test
//     below verifies the corrected behavior.
//
// H3: marker creation (mkdir + writeFile) wrapped in try/catch where the
//     catch is best-effort — failure to write the marker does not change the
//     allow decision. Tests verify both EACCES (permission denied) and ENOSPC
//     (disk full) paths via dependency-injected mkdir/writeFile that throw.

import { describe, it, expect } from 'vitest';
import { handleImpl as h2Impl } from '../../../src/hooks/h2-deviation-manifest/index.js';
import { handleImpl as h3Impl } from '../../../src/hooks/h3-sandbox-hygiene/index.js';
import type { AuditLogger } from '../../../src/core/audit/index.js';

function noopLogger(): AuditLogger {
  return {
    log: async () => ({ ok: true as const, value: undefined }),
  } as unknown as AuditLogger;
}

describe('H2 — deviationManifest parse-failure block path (was istanbul-ignored at line 114)', () => {
  it('blocks when BUILD_COMPLETE has a deviationManifest field with malformed JSON inside braces', async () => {
    // Payload:
    //  - contains 'BUILD_COMPLETE' (sets hasBuildComplete=true)
    //  - contains 'deviationManifest' (sets hasManifest=true)
    //  - regex /"deviationManifest"\s*:\s*({[^}]*})/ captures `{not valid json}`
    //  - JSON.parse('{not valid json}') throws SyntaxError → catch at 113 fires
    //  - per the corrected source, the catch returns a structured block decision
    const payload = 'BUILD_COMPLETE reached. {"deviationManifest":{not valid json}}';
    const stderr: string[] = [];
    const result = await h2Impl({
      stdinReader: async () => payload,
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: (m) => stderr.push(m),
    });

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(result.audit.rationale).toMatch(/^deviationManifest parse failed: /);
    expect(stderr).toEqual(expect.arrayContaining([expect.stringContaining('h2_manifest_parse_failed')]));
    // Audit payload includes the underlying error detail as a string.
    const auditPayload = result.audit.payload as { error: string };
    expect(typeof auditPayload.error).toBe('string');
    expect(auditPayload.error.length).toBeGreaterThan(0);
  });

  it('audit payload preserves the JSON.parse error detail (not blank)', async () => {
    const payload = 'BUILD_COMPLETE check: {"deviationManifest":{a:1,b:}}';
    const result = await h2Impl({
      stdinReader: async () => payload,
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: () => {
        // no-op
      },
    });
    expect(result.audit.decision).toBe('block');
    const auditPayload = result.audit.payload as { error: string };
    expect(auditPayload.error).toMatch(/(JSON|Unexpected|token|position|Expected)/i);
  });
});

describe('H3 — marker-creation I/O failure best-effort fallback (was istanbul-ignored at line 76)', () => {
  it('returns allow when mkdir throws EACCES (permission denied)', async () => {
    const result = await h3Impl({
      readFile: async () => {
        // marker does not exist → proceed to scan + create-marker branch
        throw new Error('ENOENT: no marker');
      },
      mkdir: async () => {
        const e = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        e.code = 'EACCES';
        throw e;
      },
      writeFile: async () => {
        // unreachable — mkdir throws first
      },
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: () => {
        // no-op
      },
      sandboxMarkerPath: '/fake/marker',
    });

    // Per the design: marker creation is best-effort. EACCES on the marker
    // directory does NOT change the audit decision, which was already 'allow'
    // before the marker creation attempt.
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.rationale).toBe('Initial sandbox scan passed (MVP: minimal checks)');
  });

  it('returns allow when writeFile throws ENOSPC (disk full)', async () => {
    const result = await h3Impl({
      readFile: async () => {
        throw new Error('ENOENT: no marker');
      },
      mkdir: async () => {
        // mkdir succeeds
      },
      writeFile: async () => {
        const e = new Error('ENOSPC: no space left on device') as NodeJS.ErrnoException;
        e.code = 'ENOSPC';
        throw e;
      },
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: () => {
        // no-op
      },
      sandboxMarkerPath: '/fake/marker',
    });

    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.rationale).toBe('Initial sandbox scan passed (MVP: minimal checks)');
  });

  it('returns allow when both mkdir and writeFile throw — catch absorbs both surfaces', async () => {
    const result = await h3Impl({
      readFile: async () => {
        throw new Error('ENOENT');
      },
      mkdir: async () => {
        throw new Error('EACCES');
      },
      writeFile: async () => {
        throw new Error('ENOSPC');
      },
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit invoked');
      },
      stderrWrite: () => {
        // no-op
      },
      sandboxMarkerPath: '/fake/marker',
    });
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
  });
});
