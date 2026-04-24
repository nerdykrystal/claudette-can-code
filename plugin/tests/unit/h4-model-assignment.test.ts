import { describe, it, expect, beforeEach } from 'vitest';
import { handleImpl, type HandleDeps } from '../../src/hooks/h4-model-assignment/index.js';
import { AuditLogger } from '../../src/core/audit/index.js';

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
      readFile: async () => JSON.stringify({
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
      readFile: async () => JSON.stringify({
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

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
    expect(emitCalled).toBe(true);
  });

  it('allow when no current stage found', async () => {
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({
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

    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
  });

  it('halt on malformed stdin', async () => {
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({ stages: [] }),
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

  it('halt on malformed plan state', async () => {
    const deps: HandleDeps = {
      readFile: async () => 'invalid json {',
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

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
  });

  it('audit on allow path', async () => {
    let auditLogged = false;

    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({
        stages: [{ id: 'stage-1', assignedModel: 'model-a' }],
      }),
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
      readFile: async () => JSON.stringify({
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
      readFile: async () => JSON.stringify({
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
      readFile: async () => JSON.stringify({
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
});
