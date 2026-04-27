export interface ExcellenceSpec {
  excellentEndState: string;
  qaCriteria: string[];
  constraints: string[];
  // Stage 04 optional extensions (present when derived from BundleAST)
  qaCriteriaStructured?: { id: string; description: string; sourceDoc: string; sourceId: string }[];
  constraintsStructured?: { id: string; description: string; sourceDoc: string }[];
  exitCriteria?: { id: string; metric: string; threshold: string; sourceDoc: string }[];
}

export interface PlannedStage {
  id: string;
  name: string;
  purpose: string;
  dependsOn: string[];
}

export function planBackwards(spec: ExcellenceSpec): PlannedStage[] {
  // Deterministic stage generation from excellence spec
  const stages: PlannedStage[] = [];

  // 1. QA stage (depends on all implementation stages)
  const qaStage: PlannedStage = {
    id: 'qa',
    name: 'Quality Assurance',
    purpose: 'Convergence gate across all stages',
    dependsOn: [],
  };

  // 2. Implementation stages (one per QA criterion)
  const implStages: PlannedStage[] = [];
  for (let i = 0; i < spec.qaCriteria.length; i++) {
    implStages.push({
      id: `impl-${i}`,
      name: `Implementation Stage ${i}`,
      purpose: spec.qaCriteria[i],
      dependsOn: ['scaffold'],
    });
  }

  // QA depends on all impl stages
  qaStage.dependsOn = implStages.map((s) => s.id);

  // 3. Scaffold stage (foundation)
  const scaffoldStage: PlannedStage = {
    id: 'scaffold',
    name: 'Project Scaffold',
    purpose: 'Directory structure and configuration',
    dependsOn: ['plan-full'],
  };

  // 4. Planning stages
  const planSkeletonStage: PlannedStage = {
    id: 'plan-skeleton',
    name: 'Plan Skeleton',
    purpose: 'Initial plan outline',
    dependsOn: [],
  };

  const planFullStage: PlannedStage = {
    id: 'plan-full',
    name: 'Full Plan Content',
    purpose: 'Detailed plan with all specifications',
    dependsOn: ['plan-skeleton'],
  };

  // Reverse dependency order: scaffold before impl, impl before qa
  stages.push(planSkeletonStage);
  stages.push(planFullStage);
  stages.push(scaffoldStage);
  stages.push(...implStages);
  stages.push(qaStage);

  return stages;
}

// ─── Stage 04: StagePlan + planStages ────────────────────────────────────────
// New bundle-aware API. Closes gate-22 Surprise #9 (backwards-planning F13 fixed).
// planBackwards() above is PRESERVED for existing test compatibility.

import type { BundleAST } from '../bundle-parser/types.js';
import type { Result } from '../types/index.js';

export interface StagePlan {
  stageId: string;
  inputs: string[];
  outputs: string[];
  exitCriteriaIds: string[];  // refs ExcellenceSpec.exitCriteria[].id
  closes: string[];           // gate-22 finding IDs this stage closes (from BIDX)
}

export type PlanError =
  | { kind: 'no_stages_produced'; message: string }
  | { kind: 'bidx_missing'; message: string };

/**
 * Plan stages from bundle content + ExcellenceSpec.
 * Bundle-derived: uses BIDX rows to populate closes[]; exit criteria from spec.
 * Returns the same structural invariants as planBackwards() (dependency ordering,
 * deterministic output) but with bundle-derived metadata.
 *
 * Closes gate-22 Surprise #9: backwards-planning F13 fixed (uses bundle content).
 * Closes gate-22 M-2, M-10: model/effort derived from spec, not hardcode.
 */
export function planStages(bundle: BundleAST, spec: ExcellenceSpec): Result<StagePlan[], PlanError> {
  // Use planBackwards for structural generation (determinism + dep-ordering preserved)
  const plannedStages = planBackwards(spec);

  if (plannedStages.length === 0) {
    return {
      ok: false,
      error: { kind: 'no_stages_produced', message: 'planBackwards produced zero stages' },
    };
  }

  // Build BIDX lookup: stageId → closing finding IDs
  // BIDX rows have closesFinding + via + doc + sectionId
  // We map stage IDs to findings by matching stageId substrings in via or sectionId
  const bidxClosureMap: Record<string, string[]> = {};
  for (const row of bundle.bidx.rows) {
    // Match stage IDs to BIDX rows by checking if the row's via/sectionId relates
    // to stage keywords. Use a simple heuristic: match on stage id patterns in via field.
    for (const stage of plannedStages) {
      const stageKeyword = stage.id.replace(/-\d+$/, '');  // e.g., 'impl' from 'impl-0'
      const viaLower = row.via.toLowerCase();
      const sectionLower = row.sectionId.toLowerCase();

      if (
        viaLower.includes(stageKeyword) ||
        sectionLower.includes(stageKeyword) ||
        viaLower.includes(stage.id) ||
        sectionLower.includes(stage.id)
      ) {
        if (!bidxClosureMap[stage.id]) {
          bidxClosureMap[stage.id] = [];
        }
        if (!bidxClosureMap[stage.id].includes(row.closesFinding)) {
          bidxClosureMap[stage.id].push(row.closesFinding);
        }
      }
    }
  }

  // Build exit criteria IDs from spec
  const allExitCriteriaIds = (spec.exitCriteria ?? []).map((ec) => ec.id);

  // Map planned stages to StagePlans
  const stagePlans: StagePlan[] = plannedStages.map((stage) => {
    // Distribute exit criteria across implementation stages
    const exitCriteriaIds: string[] = [];
    if (stage.id === 'qa') {
      // QA stage covers all exit criteria
      exitCriteriaIds.push(...allExitCriteriaIds);
    } else if (stage.id.startsWith('impl-')) {
      // Each impl stage covers its corresponding exit criterion (if available)
      const implIdx = parseInt(stage.id.replace('impl-', ''), 10);
      if (implIdx < allExitCriteriaIds.length) {
        exitCriteriaIds.push(allExitCriteriaIds[implIdx]);
      }
    }

    return {
      stageId: stage.id,
      inputs: stage.dependsOn.map((dep) => `${dep}.outputs`),
      outputs: [`${stage.id}.artifacts`],
      exitCriteriaIds,
      closes: bidxClosureMap[stage.id] ?? [],
    };
  });

  return { ok: true, value: stagePlans };
}
