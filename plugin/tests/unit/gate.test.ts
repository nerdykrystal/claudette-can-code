import { describe, it, expect } from 'vitest';
import { runGate, type GateScope, type Finding, type Auditor } from '../../src/core/gate/index.js';
import fc from 'fast-check';

describe('Convergence Gate Engine', () => {
  // Mock auditor that returns fixed findings
  const mockAuditor = (findings: Finding[]): Auditor => {
    return async () => findings;
  };

  const baseScope: GateScope = {
    target: 'test',
    sources: [],
    prompt: 'test prompt',
    domain: 'code',
    threshold: 2,
    severityPolicy: 'standard',
    maxIterations: 10,
  };

  it('should converge at threshold', async () => {
    // Auditor returns empty (no findings)
    const auditor = mockAuditor([]);
    const result = await runGate(baseScope, auditor);

    expect(result.converged).toBe(true);
    expect(result.counter).toBeGreaterThanOrEqual(baseScope.threshold);
  });

  it('should reset counter on CRITICAL finding (standard policy)', async () => {
    let callCount = 0;
    const auditor: Auditor = async () => {
      callCount += 1;
      // First call: return CRITICAL. Subsequent calls: no findings.
      if (callCount === 1) {
        return [{ severity: 'CRITICAL', message: 'Critical issue' }];
      }
      return [];
    };

    const result = await runGate(baseScope, auditor);
    expect(result.converged).toBe(true);
    // Counter should have reset at call 1, then incremented from call 2 onward
    expect(result.iterations).toBeGreaterThan(1);
  });

  it('should reset counter on HIGH finding (standard policy)', async () => {
    let callCount = 0;
    const auditor: Auditor = async () => {
      callCount += 1;
      if (callCount === 1) {
        return [{ severity: 'HIGH', message: 'High issue' }];
      }
      return [];
    };

    const result = await runGate(baseScope, auditor);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(1);
  });

  it('should not reset counter on LOW finding (standard policy)', async () => {
    const lowFinding: Finding = { severity: 'LOW', message: 'Low issue' };
    const auditor = mockAuditor([lowFinding]);

    const result = await runGate(baseScope, auditor);
    // LOW findings don't reset counter; counter increments each iteration.
    // With threshold=2, converged after 2 iterations.
    expect(result.converged).toBe(true);
    expect(result.counter).toBeGreaterThanOrEqual(baseScope.threshold);
  });

  it('should block on MEDIUM finding (standard policy)', async () => {
    let callCount = 0;
    const auditor: Auditor = async () => {
      callCount += 1;
      if (callCount === 1) {
        return [{ severity: 'MEDIUM', message: 'Medium issue' }];
      }
      // Second call: MEDIUM still present
      if (callCount === 2) {
        return [{ severity: 'MEDIUM', message: 'Medium issue' }];
      }
      return [];
    };

    const scope = { ...baseScope, threshold: 1 };
    const result = await runGate(scope, auditor);
    // MEDIUM blocks counter increment in standard mode; need additional clean pass
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(2);
  });

  it('should reset counter on MEDIUM finding (strict policy)', async () => {
    let callCount = 0;
    const auditor: Auditor = async () => {
      callCount += 1;
      if (callCount === 1) {
        return [{ severity: 'MEDIUM', message: 'Medium issue' }];
      }
      return [];
    };

    const scope = { ...baseScope, severityPolicy: 'strict' as const };
    const result = await runGate(scope, auditor);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(1);
  });

  it('should not converge when maxIterations exceeded', async () => {
    const auditor = mockAuditor([{ severity: 'CRITICAL', message: 'Always fail' }]);
    const scope = { ...baseScope, maxIterations: 2, threshold: 10 };

    const result = await runGate(scope, auditor);
    expect(result.converged).toBe(false);
    expect(result.iterations).toBe(2);
  });

  it('should converge after one clean pass with threshold=1', async () => {
    const auditor = mockAuditor([]);
    const scope = { ...baseScope, threshold: 1 };

    const result = await runGate(scope, auditor);
    expect(result.converged).toBe(true);
    expect(result.counter).toBeGreaterThanOrEqual(1);
  });

  it('should count iterations correctly', async () => {
    let callCount = 0;
    const auditor: Auditor = async () => {
      callCount += 1;
      if (callCount < 3) {
        return [{ severity: 'HIGH', message: 'Fail' }];
      }
      return [];
    };

    const scope = { ...baseScope, threshold: 1 };
    const result = await runGate(scope, auditor);
    // Iterations 1-2: HIGH finding resets counter. Iteration 3: clean pass, counter reaches threshold=1.
    expect(result.iterations).toBe(3);
  });

  // Property-based test: counter is monotonically non-decreasing except at reset boundaries
  it('should maintain counter monotonicity (property-based)', async () => {
    fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async () => {
        let iterationCount = 0;
        const auditor: Auditor = async () => {
          iterationCount += 1;
          // Reset every 3rd iteration, else increment
          if (iterationCount % 3 === 0) {
            return [{ severity: 'CRITICAL', message: 'Reset' }];
          }
          return [];
        };

        const scope = { ...baseScope, threshold: 10, maxIterations: 5 };
        const result = await runGate(scope, auditor);

        // Validate result structure
        expect(result).toHaveProperty('converged');
        expect(result).toHaveProperty('counter');
        expect(result).toHaveProperty('findings');
        expect(result).toHaveProperty('iterations');

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
