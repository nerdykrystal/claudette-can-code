// Stage 08a — H4 Fail-Closed: 5 exit-2 path assertions.
// Each test verifies process.exit(2) is invoked + stderr JSON matches schema.
// Per §3.08a spec + PRD-AR-NV-01 + PRD-AR-04.

import { describe, it, expect } from 'vitest';
import { handleImpl, type HandleDeps } from '../../../../src/hooks/h4-model-assignment/index.js';
import type { AuditLogger } from '../../../../src/core/audit/index.js';

function noopLogger(): AuditLogger {
  return {
    log: async () => undefined,
  } as unknown as AuditLogger;
}

function noopExit(): never {
  throw new Error('exit');
}

describe('H4 exit-paths — Stage 08a fail-closed (5 paths each exit 2)', () => {
  // Path 1: stage-not-found → exit 2 with h4_stage_not_found stderr (closes gate-22 C-3)
  it('Path 1 — stage-not-found: exit 2 + stderr rule=h4_stage_not_found', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: () => ({
        ok: true as const,
        value: {
          currentStageId: 'missing-stage',
          stages: [{ id: 'stage-a', assignedModel: 'haiku-4-5' }],
        } as never,
      }),
      stdinReader: async () =>
        JSON.stringify({ tool: 'Write', executingModel: 'opus-4-7', args: {} }),
      auditLogger: noopLogger(),
      emit: () => undefined,
      exit: noopExit,
      stderrWrite: (msg) => stderr.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h4_stage_not_found');
    expect(parsed.resolution).toBeTruthy();
    expect(Array.isArray(parsed.available_stages)).toBe(true);
  });

  // Path 2: plan-state missing → exit 2 with h4_plan_state_missing stderr
  it('Path 2 — plan-state missing: exit 2 + stderr rule=h4_plan_state_missing', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: () => ({
        ok: false,
        error: {
          kind: 'not_found' as const,
          path: '/fake/plan-state.json',
          message: 'plan-state.json not found at /fake/plan-state.json',
        },
      }),
      stdinReader: async () =>
        JSON.stringify({ tool: 'Write', executingModel: 'opus-4-7', args: {} }),
      auditLogger: noopLogger(),
      emit: () => undefined,
      exit: noopExit,
      stderrWrite: (msg) => stderr.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h4_plan_state_missing');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detected_path).toBe('string');
  });

  // Path 3: plan-state malformed → exit 2 with h4_plan_state_malformed stderr
  it('Path 3 — plan-state malformed: exit 2 + stderr rule=h4_plan_state_malformed', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: () => ({
        ok: false,
        error: {
          kind: 'malformed_json' as const,
          message: 'Cannot parse plan-state.json: SyntaxError: Unexpected token',
        },
      }),
      stdinReader: async () =>
        JSON.stringify({ tool: 'Write', executingModel: 'opus-4-7', args: {} }),
      auditLogger: noopLogger(),
      emit: () => undefined,
      exit: noopExit,
      stderrWrite: (msg) => stderr.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h4_plan_state_malformed');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detail).toBe('string');
  });

  // Path 4: HMAC fail (hmac_mismatch) → exit 2 with h4_hmac_fail stderr
  it('Path 4 — HMAC fail (hmac_mismatch): exit 2 + stderr rule=h4_hmac_fail', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: () => ({
        ok: false,
        error: {
          kind: 'hmac_mismatch' as const,
          message: 'HMAC verification failed for /fake/plan-state.json; possible tampering',
        },
      }),
      stdinReader: async () =>
        JSON.stringify({ tool: 'Write', executingModel: 'opus-4-7', args: {} }),
      auditLogger: noopLogger(),
      emit: () => undefined,
      exit: noopExit,
      stderrWrite: (msg) => stderr.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h4_hmac_fail');
    expect(parsed.resolution).toBeTruthy();
    expect(typeof parsed.detail).toBe('string');
    expect(parsed.kind).toBe('hmac_mismatch');
  });

  // Path 5: model mismatch → exit 2 with h4_model_mismatch stderr
  it('Path 5 — model mismatch: exit 2 + stderr rule=h4_model_mismatch', async () => {
    const stderr: string[] = [];
    let emittedDirective: unknown = null;
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: () => ({
        ok: true as const,
        value: {
          currentStageId: 'stage-1',
          stages: [{ id: 'stage-1', assignedModel: 'claude-haiku-4-5' }],
        } as never,
      }),
      stdinReader: async () =>
        JSON.stringify({ tool: 'Write', executingModel: 'claude-opus-4-7', args: {} }),
      auditLogger: noopLogger(),
      emit: (d) => {
        emittedDirective = d;
      },
      exit: noopExit,
      stderrWrite: (msg) => stderr.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    // Redirect directive must be emitted
    expect(emittedDirective).toBeTruthy();
    // stderr schema per PRD-AR-NV-01 + PRD-AR-04
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h4_model_mismatch');
    expect(parsed.resolution).toBeTruthy();
    expect(parsed.required_model).toBe('claude-haiku-4-5');
    expect(parsed.actual_model).toBe('claude-opus-4-7');
    expect(typeof parsed.stage_id).toBe('string');
  });
});
