// Convergence Gate Engine — Stage 04. FR-012. ASAE methodology (Martinez Methods).
// Pure logic engine (no I/O). Injected auditor for testability + mutation-testing.

import type { SeverityPolicy, GateDomain } from '../types/index.js';

export interface Finding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  source?: string;
}

export interface GateScope {
  target: string | string[];
  sources: string[];
  prompt: string;
  domain: GateDomain;
  threshold: number;
  severityPolicy: SeverityPolicy;
  maxIterations?: number;
}

export interface ConvergenceGateResult {
  converged: boolean;
  counter: number;
  findings: Finding[];
  iterations: number;
}

export type Auditor = (scope: GateScope, iteration: number) => Promise<Finding[]>;

/**
 * Run the Convergence Gate Engine.
 * Iterates up to maxIterations (default 10).
 * Each iteration calls auditor(scope, i) → Finding[].
 * Applies severity policy:
 *   - 'standard': CRITICAL/HIGH resets counter to 0. MEDIUM blocks exit until cleared. LOW is logged.
 *   - 'strict': CRITICAL/HIGH/MEDIUM resets counter to 0. LOW does not reset.
 *
 * Increments counter when: no reset AND (for standard: no MEDIUM) AND (for strict: true).
 * Exits when counter >= threshold (converged=true) or iterations exhausted (converged=false).
 */
export async function runGate(scope: GateScope, auditor: Auditor): Promise<ConvergenceGateResult> {
  const maxIterations = scope.maxIterations ?? 10;
  let counter = 0;
  const allFindings: Finding[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const findings = await auditor(scope, iteration);
    allFindings.push(...findings);

    let resetCounter = false;
    let hasMedium = false;

    // Classify findings
    for (const f of findings) {
      if (f.severity === 'CRITICAL' || f.severity === 'HIGH') {
        resetCounter = true;
      }
      if (f.severity === 'MEDIUM') {
        hasMedium = true;
        if (scope.severityPolicy === 'strict') {
          resetCounter = true;
        }
      }
    }

    // Update counter
    if (resetCounter) {
      counter = 0;
    } else {
      // For standard: don't increment if MEDIUM is present
      // For strict: increment (MEDIUM already reset above)
      if (scope.severityPolicy === 'standard' && hasMedium) {
        // Don't increment but also don't reset; just stay at current
      } else {
        counter += 1;
      }
    }

    // Check exit condition
    if (counter >= scope.threshold) {
      return {
        converged: true,
        counter,
        findings: allFindings,
        iterations: iteration + 1,
      };
    }
  }

  // Iterations exhausted
  return {
    converged: false,
    counter,
    findings: allFindings,
    iterations: maxIterations,
  };
}

// ─── Stage 04: runGateEvaluation ─────────────────────────────────────────────

export interface GateEvaluationInput {
  /** Flat list of stage IDs in the plan */
  stageIds: string[];
  /** Exit-criteria IDs the plan must collectively cover */
  requiredExitCriteriaIds: string[];
  /** Mapping: stageId → exitCriteriaIds that stage covers */
  stageCoverageMap: Record<string, string[]>;
}

export interface GateEvaluationResult {
  passed: boolean;
  coveredIds: string[];
  missingIds: string[];
}

/**
 * Evaluate whether a plan covers all required exit-criteria.
 * Called from plan-generator's exit path (Surprise #6 gate wired).
 * Pure function — no async, no I/O.
 *
 * Closes gate-22 Surprise #6 (gate module wired into plan generation).
 */
export function runGateEvaluation(input: GateEvaluationInput): GateEvaluationResult {
  const covered = new Set<string>();

  for (const stageId of input.stageIds) {
    const stageCoverage = input.stageCoverageMap[stageId] ?? [];
    for (const ecId of stageCoverage) {
      covered.add(ecId);
    }
  }

  const missingIds = input.requiredExitCriteriaIds.filter((id) => !covered.has(id));

  return {
    passed: missingIds.length === 0,
    coveredIds: Array.from(covered),
    missingIds,
  };
}
