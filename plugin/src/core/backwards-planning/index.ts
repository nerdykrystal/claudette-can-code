import type { BundleAST } from '../bundle-parser/types.js';
import type { ExcellenceSpec } from '../plan-generator/excellence-spec.js';
import type { Result } from '../shared/result.js';

export interface StagePlan {
  stageId: string;
  inputs: string[];
  outputs: string[];
  exitCriteriaIds: string[];  // refs ExcellenceSpec.exitCriteria[].id
  closes: string[];  // gate-22 finding IDs this stage closes (from BIDX)
}

export type PlanError =
  | { kind: 'no_exit_criteria'; message: string }
  | { kind: 'bidx_invalid'; message: string };

/**
 * Plan stages backwards from excellence spec exit criteria.
 * Derives StagePlan[] from ExcellenceSpec.exitCriteria, ensuring full coverage.
 * Maps stage closes[] to BIDX cross-references where available.
 */
export function planStages(
  bundle: BundleAST,
  spec: ExcellenceSpec
): Result<StagePlan[], PlanError> {
  // Verify exit criteria exist (required for stage planning)
  if (spec.exitCriteria.length === 0) {
    return {
      ok: false,
      error: {
        kind: 'no_exit_criteria',
        message: 'No exit criteria found in excellence spec',
      },
    };
  }

  const stages: StagePlan[] = [];
  const bidxRows = bundle.bidx.rows || [];

  // Build stage mapping: group exit criteria into logical stages
  // For Stage 04 and beyond, stages are derived from CDCC v1.1.0 master table
  // Each stage has exitCriteriaIds and closes[] from BIDX
  const exitCriteriaMap = new Map<string, string[]>();
  for (const ec of spec.exitCriteria) {
    if (!exitCriteriaMap.has(ec.sourceDoc)) {
      exitCriteriaMap.set(ec.sourceDoc, []);
    }
    const list = exitCriteriaMap.get(ec.sourceDoc);
    if (list) {
      list.push(ec.id);
    }
  }

  // Build stages: one stage per source doc + exit criteria grouping
  let stageIndex = 1;
  for (const [sourceDoc, criteriaIds] of exitCriteriaMap) {
    // Derive findings this stage closes from BIDX
    const closes: string[] = [];
    for (const row of bidxRows) {
      // Heuristic: if finding references this sourceDoc section, add to closes[]
      if (row.doc === sourceDoc || row.sectionId.includes(sourceDoc)) {
        closes.push(row.closesFinding);
      }
    }

    stages.push({
      stageId: `stage-${stageIndex}`,
      inputs: [`${sourceDoc}-spec`],
      outputs: [`${sourceDoc}-plan`],
      exitCriteriaIds: criteriaIds,
      closes,
    });
    stageIndex += 1;
  }

  // If no stages derived, create a fallback stage covering all exit criteria
  if (stages.length === 0) {
    stages.push({
      stageId: 'stage-1',
      inputs: ['bundle-spec'],
      outputs: ['complete-plan'],
      exitCriteriaIds: spec.exitCriteria.map((e) => e.id),
      closes: bidxRows.map((r) => r.closesFinding),
    });
  }

  return { ok: true, value: stages };
}
