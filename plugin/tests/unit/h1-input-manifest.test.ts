import { describe, it, expect, beforeEach } from 'vitest';
import { handleImpl, type HandleDeps } from '../../src/hooks/h1-input-manifest/index.js';
import { AuditLogger } from '../../src/core/audit/index.js';

describe('H1 Input Manifest Hook (FR-007)', () => {
  let mockAuditLogger: AuditLogger;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let exitCodeCaptured: number | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let stderrOutput: string[] = [];

  beforeEach(() => {
    exitCodeCaptured = null;
    stderrOutput = [];
    mockAuditLogger = {
      log: async (_entry) => {
        // Mock implementation
      },
    } as unknown as AuditLogger;
  });

  it('allow when input manifest exists and is non-empty', async () => {
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({
        stages: [
          { id: 'stage-1', inputManifest: ['file1.ts', 'file2.ts'] },
        ],
      }),
      auditLogger: mockAuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.hookId).toBe('H1');
  });

  it('block when no input manifest declared', async () => {
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({
        stages: [{ id: 'stage-1' }],
      }),
      auditLogger: mockAuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
    expect(stderrOutput).toContain('H1 BLOCK: No input manifest in plan state');
  });

  it('block when manifest is empty array', async () => {
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({
        stages: [{ id: 'stage-1', inputManifest: [] }],
      }),
      auditLogger: mockAuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
  });

  it('halt and block on malformed plan state', async () => {
    const deps: HandleDeps = {
      readFile: async () => 'invalid json {',
      auditLogger: mockAuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
    expect(result.audit.rationale).toContain('H1 handler error');
  });

  it('block when plan-state file missing', async () => {
    const deps: HandleDeps = {
      readFile: async () => {
        throw new Error('ENOENT: no such file');
      },
      auditLogger: mockAuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
  });

  it('log audit entry on allow', async () => {
    let auditLogged = false;
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({
        stages: [{ id: 'stage-1', inputManifest: ['file.ts'] }],
      }),
      auditLogger: {
        log: async (entry) => {
          auditLogged = true;
          expect(entry.hookId).toBe('H1');
          expect(entry.decision).toBe('allow');
        },
      } as unknown as AuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    await handleImpl(deps);

    expect(auditLogged).toBe(true);
  });

  it('log audit entry on block', async () => {
    let auditLogged = false;
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({
        stages: [],
      }),
      auditLogger: {
        log: async (entry) => {
          auditLogged = true;
          expect(entry.hookId).toBe('H1');
          expect(entry.decision).toBe('block');
        },
      } as unknown as AuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    await handleImpl(deps);

    expect(auditLogged).toBe(true);
  });

  it('include stage ID in audit payload when present', async () => {
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({
        stages: [{ id: 'my-stage', inputManifest: ['file.ts'] }],
      }),
      auditLogger: mockAuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.audit.stage).toBe('my-stage');
  });

  it('handle empty stages array gracefully (lines 107-111)', async () => {
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({
        stages: [],
      }),
      auditLogger: mockAuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
    expect(result.audit.rationale).toBe('No input manifest declared in plan');
  });

  it('handle plan state with null stages property', async () => {
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({
        stages: null,
      }),
      auditLogger: mockAuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
  });

  it('handle plan state with undefined stages property', async () => {
    const deps: HandleDeps = {
      readFile: async () => JSON.stringify({}),
      auditLogger: mockAuditLogger,
      exit: (code) => {
        exitCodeCaptured = code;
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planStatePath: '/fake/plan-state.json',
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
  });
});
