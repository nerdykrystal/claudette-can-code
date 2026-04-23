import { describe, it, expect, beforeEach } from 'vitest';
import { handleImpl, type HandleDeps } from '../../src/hooks/h5-gate-result/index.js';
import { AuditLogger } from '../../src/core/audit/index.js';

describe('H5 Gate Result Hook (FR-011)', () => {
  let stderrOutput: string[] = [];
  let mockAuditLogger: AuditLogger;

  beforeEach(() => {
    stderrOutput = [];
    mockAuditLogger = {
      log: async () => {
        // Mock
      },
    } as unknown as AuditLogger;
  });

  it('allow when converged: true', async () => {
    const gateResult = {
      converged: true,
      counter: 3,
      findings: [],
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
  });

  it('block when converged: false', async () => {
    const gateResult = {
      converged: false,
      counter: 1,
      findings: [
        { severity: 'CRITICAL', message: 'test failed' },
      ],
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
  });

  it('block when payload is invalid JSON', async () => {
    const deps: HandleDeps = {
      stdinReader: async () => 'not json {',
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
    expect(stderrOutput).toContain('H5 BLOCK: Could not parse gate result');
  });

  it('block when schema invalid (missing converged)', async () => {
    const gateResult = {
      counter: 1,
      findings: [],
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
    expect(stderrOutput).toContain('H5 BLOCK: Gate result schema invalid');
  });

  it('block when schema invalid (missing findings)', async () => {
    const gateResult = {
      converged: true,
      counter: 3,
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
  });

  it('block when schema invalid (invalid finding severity)', async () => {
    const gateResult = {
      converged: false,
      counter: 1,
      findings: [
        { severity: 'UNKNOWN', message: 'test' },
      ],
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
  });

  it('audit entry on allow', async () => {
    let auditLogged = false;

    const gateResult = {
      converged: true,
      counter: 2,
      findings: [],
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: {
        log: async (entry) => {
          auditLogged = true;
          expect(entry.hookId).toBe('H5');
          expect(entry.decision).toBe('allow');
        },
      } as unknown as AuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    await handleImpl(deps);

    expect(auditLogged).toBe(true);
  });

  it('audit entry on block includes findings', async () => {
    let auditLogged = false;

    const gateResult = {
      converged: false,
      counter: 1,
      findings: [
        { severity: 'HIGH', message: 'coverage low' },
      ],
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: {
        log: async (entry) => {
          auditLogged = true;
          expect(entry.hookId).toBe('H5');
          expect(entry.decision).toBe('block');
          expect(entry.payload).toHaveProperty('findingsSummary');
          expect(entry.payload.findingsSummary).toContain('coverage low');
        },
      } as unknown as AuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    await handleImpl(deps);

    expect(auditLogged).toBe(true);
  });

  it('emit findings summary to stderr', async () => {
    const gateResult = {
      converged: false,
      counter: 1,
      findings: [
        { severity: 'CRITICAL', message: 'test failed' },
        { severity: 'HIGH', message: 'coverage low' },
      ],
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    await handleImpl(deps);

    expect(stderrOutput.some((line) => line.includes('test failed'))).toBe(true);
    expect(stderrOutput.some((line) => line.includes('coverage low'))).toBe(true);
  });

  it('halt on unhandled error', async () => {
    const deps: HandleDeps = {
      stdinReader: async () => {
        throw new Error('stdin read error');
      },
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
  });

  it('include gate result in audit payload on convergence', async () => {
    const gateResult = {
      converged: true,
      counter: 3,
      findings: [],
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.audit.payload).toHaveProperty('gateResult');
    expect(result.audit.payload.gateResult).toHaveProperty('converged', true);
  });

  it('include gate result in audit payload on non-convergence', async () => {
    const gateResult = {
      converged: false,
      counter: 1,
      findings: [{ severity: 'MEDIUM', message: 'issue' }],
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    const result = await handleImpl(deps);

    expect(result.audit.payload).toHaveProperty('gateResult');
    expect(result.audit.payload.gateResult).toHaveProperty('converged', false);
  });

  it('format findings with severity labels', async () => {
    const gateResult = {
      converged: false,
      counter: 1,
      findings: [
        { severity: 'CRITICAL', message: 'error' },
        { severity: 'LOW', message: 'warning' },
      ],
    };

    const deps: HandleDeps = {
      stdinReader: async () => JSON.stringify(gateResult),
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
    };

    const result = await handleImpl(deps);

    const findingsSummary = result.audit.payload.findingsSummary as string;
    expect(findingsSummary).toContain('[CRITICAL]');
    expect(findingsSummary).toContain('[LOW]');
  });
});
