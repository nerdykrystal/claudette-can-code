import { describe, it, expect, beforeEach } from 'vitest';
import { handleImpl, type HandleDeps } from '../../src/hooks/h4-model-assignment/index.js';
import { AuditLogger } from '../../src/core/audit/index.js';

/** Helper: inject a successful plan-state parse result without touching the filesystem. */
function makePlanStateReader(planState: object): () => { ok: true; value: typeof planState } {
  return () => ({ ok: true as const, value: planState as never });
}

describe('H4 Model Assignment Hook (FR-010)', () => {
  let stderrOutput: string[] = [];
  let mockAuditLogger: AuditLogger;
  let emitCalled = false;
  let _emittedDirective: unknown = null;

  beforeEach(() => {
    stderrOutput = [];
    emitCalled = false;
    _emittedDirective = null;
    mockAuditLogger = {
      log: async () => {
        // Mock
      },
    } as unknown as AuditLogger;
  });

  it('allow when tool is not Write or Edit', async () => {
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({ stages: [] }),
      stdinReader: async () => JSON.stringify({ tool: 'Read', executingModel: 'model-a' }),
      auditLogger: mockAuditLogger,
      emit: (directive) => {
        emitCalled = true;
        _emittedDirective = directive;
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(emitCalled).toBe(false);
  });

  it('allow when executingModel matches assignedModel', async () => {
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: makePlanStateReader({
        currentStageId: 'stage-1',
        stages: [{ id: 'stage-1', assignedModel: 'claude-haiku' }],
      }),
      stdinReader: async () => JSON.stringify({
        tool: 'Write',
        executingModel: 'claude-haiku',
        args: { filePath: 'test.ts' },
      }),
      auditLogger: mockAuditLogger,
      emit: (directive) => {
        emitCalled = true;
        _emittedDirective = directive;
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(emitCalled).toBe(false);
  });

  it('block and emit directive on model mismatch', async () => {
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: makePlanStateReader({
        currentStageId: 'stage-1',
        stages: [{ id: 'stage-1', assignedModel: 'claude-opus' }],
      }),
      stdinReader: async () => JSON.stringify({
        tool: 'Write',
        executingModel: 'claude-haiku',
        args: { filePath: 'test.ts' },
      }),
      auditLogger: mockAuditLogger,
      emit: (directive) => {
        emitCalled = true;
        _emittedDirective = directive;
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    // Stage 08a: model mismatch is fail-closed → exit 2
    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(emitCalled).toBe(true);
  });

  it('block when no current stage found (fail-closed per stage-08a)', async () => {
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: makePlanStateReader({
        currentStageId: 'nonexistent',
        stages: [{ id: 'stage-1', assignedModel: 'claude-opus' }],
      }),
      stdinReader: async () => JSON.stringify({
        tool: 'Write',
        executingModel: 'claude-haiku',
      }),
      auditLogger: mockAuditLogger,
      emit: (directive) => {
        emitCalled = true;
        _emittedDirective = directive;
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    // Stage 08a: stage-not-found is now fail-closed (closes gate-22 C-3)
    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
  });

  it('halt on malformed stdin', async () => {
    const deps: HandleDeps = {
      readFile: async () => '{}',
      stdinReader: async () => 'invalid json {',
      auditLogger: mockAuditLogger,
      emit: () => {
        // Mock
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
  });

  it('block on plan state not found (stage-08a: exit 2 fail-closed)', async () => {
    // Stage 08a: plan-state missing is now fail-closed (exit 2, block) not halt.
    // planStateReader returns not_found → structured stderr + exit 2.
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: () => ({
        ok: false,
        error: { kind: 'not_found' as const, path: '/fake/plan-state.json', message: 'plan-state.json not found at /fake/plan-state.json' },
      }),
      stdinReader: async () => JSON.stringify({
        tool: 'Write',
        executingModel: 'model-a',
      }),
      auditLogger: mockAuditLogger,
      emit: () => {
        // Mock
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderrOutput.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderrOutput[0]) as { rule: string };
    expect(parsed.rule).toBe('h4_plan_state_missing');
  });

  it('audit on allow path', async () => {
    let auditLogged = false;

    const deps: HandleDeps = {
      readFile: async () => '{}',
      stdinReader: async () => JSON.stringify({
        tool: 'Read',
      }),
      auditLogger: {
        log: async (entry) => {
          auditLogged = true;
          expect(entry.hookId).toBe('H4');
          expect(entry.decision).toBe('allow');
        },
      } as unknown as AuditLogger,
      emit: () => {
        // Mock
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    await handleImpl(deps);

    expect(auditLogged).toBe(true);
  });

  it('audit on block path includes directive', async () => {
    let auditLogged = false;

    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: makePlanStateReader({
        currentStageId: 'stage-1',
        stages: [{ id: 'stage-1', assignedModel: 'claude-opus' }],
      }),
      stdinReader: async () => JSON.stringify({
        tool: 'Write',
        executingModel: 'claude-haiku',
        args: {},
      }),
      auditLogger: {
        log: async (entry) => {
          auditLogged = true;
          expect(entry.hookId).toBe('H4');
          expect(entry.decision).toBe('block');
          expect(entry.payload).toHaveProperty('directive');
        },
      } as unknown as AuditLogger,
      emit: () => {
        // Mock
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    await handleImpl(deps);

    expect(auditLogged).toBe(true);
  });

  it('include executingModel and assignedModel in payload', async () => {
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: makePlanStateReader({
        currentStageId: 'stage-1',
        stages: [{ id: 'stage-1', assignedModel: 'opus' }],
      }),
      stdinReader: async () => JSON.stringify({
        tool: 'Edit',
        executingModel: 'haiku',
        args: {},
      }),
      auditLogger: mockAuditLogger,
      emit: () => {
        // Mock
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.audit.payload).toHaveProperty('executingModel', 'haiku');
    expect(result.audit.payload).toHaveProperty('assignedModel', 'opus');
  });

  it('use first stage when currentStageId not set', async () => {
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: makePlanStateReader({
        stages: [{ id: 'first-stage', assignedModel: 'model-a' }],
      }),
      stdinReader: async () => JSON.stringify({
        tool: 'Write',
        executingModel: 'model-a',
      }),
      auditLogger: mockAuditLogger,
      emit: () => {
        // Mock
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(0);
    expect(result.audit.stage).toBe('first-stage');
  });

  it('error handling on outer exception with audit log and stderr (halt path)', async () => {
    // Throws from stdinReader to exercise the outer catch block (halt path).
    const deps: HandleDeps = {
      readFile: async () => '{}',
      stdinReader: async () => {
        throw new Error('stdinReader failed');
      },
      auditLogger: mockAuditLogger,
      emit: () => {
        // Mock
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
    expect(stderrOutput.length).toBeGreaterThan(0);
    expect(stderrOutput[0]).toContain('H4 HALT:');
  });

  it('handle missing executingModel field in payload (mismatch path)', async () => {
    const deps: HandleDeps = {
      readFile: async () => '{}',
      planStateReader: makePlanStateReader({
        currentStageId: 'stage-1',
        stages: [{ id: 'stage-1', assignedModel: 'model-a' }],
      }),
      stdinReader: async () => JSON.stringify({
        tool: 'Write',
        // executingModel is missing, so it will be undefined
      }),
      auditLogger: mockAuditLogger,
      emit: (directive) => {
        emitCalled = true;
        _emittedDirective = directive;
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    // When executingModel is undefined, the comparison fails (undefined !== 'model-a')
    // This triggers the mismatch block path → exit 2 (fail-closed, stage-08a)
    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(emitCalled).toBe(true);
    // The audit payload uses the original executingModel variable, which is undefined
    expect(result.audit.payload.executingModel).toBeUndefined();
    // But the blocked object passed to redirect() uses 'unknown'
    expect(result.audit.payload.directive).toBeDefined();
  });
});
