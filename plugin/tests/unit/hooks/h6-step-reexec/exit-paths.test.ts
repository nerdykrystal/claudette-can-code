// Stage 08b — H6 Fail-Closed: 2 exit-2 path assertions.
// Each test verifies process.exit(2) is invoked + stderr JSON matches schema.
// Per §3.08b spec + PRD-AR-NV-01 + PRD-AR-04.

import { describe, it, expect } from 'vitest';
import { handleImpl, type HandleDeps } from '../../../../src/hooks/h6-step-reexec/index.js';
import { computeStepIdentity } from '../../../../src/hooks/h6-step-reexec/step-identity.js';
import type { AuditLogger } from '../../../../src/core/audit/index.js';

function noopLogger(): AuditLogger {
  return {
    log: async () => undefined,
  } as unknown as AuditLogger;
}

function makeDeps(overrides: Partial<HandleDeps>): HandleDeps {
  return {
    readFile: async () => {
      throw new Error('ENOENT');
    },
    appendFile: async () => undefined,
    mkdir: async () => undefined,
    stdinReader: async () => '{}',
    auditLogger: noopLogger(),
    exit: () => {
      throw new Error('exit');
    },
    stderrWrite: () => {
      // no-op
    },
    planDir: '/fake/plan',
    ...overrides,
  };
}

describe('H6 exit-paths — Stage 08b fail-closed (2 paths each exit 2)', () => {
  // Path 1: re-execution without authorization → exit 2
  it('Path 1 — re-execution without authorization: exit 2 + stderr rule=h6_step_reexec_unauthorized', async () => {
    const stderr: string[] = [];
    const ident = computeStepIdentity('Write', { file_path: 'src/foo.ts', content: 'hello' });
    const priorRecord = {
      ts: '2026-04-26T10:00:00Z',
      step_id: ident.step_id,
      hash_of_inputs: ident.hash_of_inputs,
      tool: 'Write',
      agent_persona: null,
      authorized_by: null,
      gate_ref: null,
    };

    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({ tool: 'Write', args: { file_path: 'src/foo.ts', content: 'hello' } }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          return JSON.stringify(priorRecord) + '\n';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      stderrWrite: (msg) => stderr.push(msg),
    });

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h6_step_reexec_unauthorized');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.step_id).toBe('string');
    expect(typeof parsed.hash_of_inputs).toBe('string');
  });

  // Path 2: handler error (malformed stdin JSON) → exit 2
  it('Path 2 — handler error (malformed stdin): exit 2 + stderr rule=h6_handler_error', async () => {
    const stderr: string[] = [];

    const deps = makeDeps({
      stdinReader: async () => 'not-json {{{',
      stderrWrite: (msg) => stderr.push(msg),
    });

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('halt');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h6_handler_error');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detail).toBe('string');
  });
});
