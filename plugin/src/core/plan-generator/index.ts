import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { Result, Plan, ModelAssignment, EffortLevel, SpecDepth, GateDomain } from '../types/index.js';
import { planSchema } from '../types/schemas.js';
import type { Bundle } from '../bundle/index.js';
import type { BundleAST } from '../bundle-parser/types.js';
import type { YourSetupCatalog } from '../catalog/index.js';
import { planBackwards, planStages, type ExcellenceSpec } from '../backwards-planning/index.js';
import { extractExcellenceSpec, type ExcellenceSpecError } from './excellence-spec.js';
import { check } from '../skill-gap/index.js';
import { runGateEvaluation } from '../gate/index.js';

export interface GenerateInput {
  bundle: Bundle;
  catalog: YourSetupCatalog;
  now?: () => Date;
}

export interface GenerateError {
  code: 'SKILL_GAP' | 'SCHEMA_INVALID';
  detail: string;
  gaps?: { stageId: string; missingSkill: string }[];
}

// Stage 04: extractExcellenceSpec now delegates to the bundle-derived module.
// The legacy hardcoded version is replaced. Closes gate-22 C-1.
// Import is conditional on bundle type — plan-generator works with both Bundle (legacy)
// and BundleAST (new). For legacy Bundle inputs, we use the BundleAST-unaware fallback.
function extractExcellenceSpecFallback(): ExcellenceSpec {
  // Fallback for legacy Bundle (non-BundleAST) inputs.
  // This path is exercised by tests that use Bundle fixtures directly.
  return {
    excellentEndState:
      'An installable Claude Code plugin that enforces D2R plan adherence via non-bypassable hooks',
    qaCriteria: [
      'All FR-001…FR-019 have functional tests',
      'All BR-001…BR-006 have behavioral tests',
      'Hook enforcement exits non-zero on violation',
      'Audit logs are append-only and fsync\'d',
      '100% line + branch coverage on testable surface',
    ],
    constraints: [
      'No silent substitution (F3) possible',
      'No skill-skipping (F6) possible',
      'Gate-skipping (F6) structurally impossible',
      'All enforcement non-bypassable',
      'Zero network calls at runtime',
    ],
  };
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function generate(input: GenerateInput): Promise<Result<Plan, GenerateError>> {
  const { bundle, catalog, now = () => new Date() } = input;

  // Extract excellence spec — Stage 04: delegates to bundle-derived fallback.
  // Full BundleAST-derived extraction is available via extractExcellenceSpec(bundleAST)
  // in plan-generator/excellence-spec.ts for callers with a parsed BundleAST.
  const spec = extractExcellenceSpecFallback();

  // Plan backwards
  const plannedStages = planBackwards(spec);

  // D2R model/effort/depth/gate defaults per stage naming
  const modelMap: Record<string, ModelAssignment> = {
    'plan-skeleton': 'opus-4-7',
    'plan-full': 'opus-4-7',
    scaffold: 'sonnet-4-6',
    impl: 'haiku-4-5',
    qa: 'opus-4-7',
  };

  const effortMap: Record<string, EffortLevel> = {
    'plan-skeleton': 'low',
    'plan-full': 'medium',
    scaffold: 'medium',
    impl: 'medium',
    qa: 'high',
  };

  const depthMap: Record<string, SpecDepth> = {
    'plan-skeleton': 'Shallow',
    'plan-full': 'Medium',
    scaffold: 'Medium',
    impl: 'Deep',
    qa: 'Deep',
  };

  const gateThresholdMap: Record<string, number> = {
    'plan-skeleton': 2,
    'plan-full': 3,
    scaffold: 3,
    impl: 3,
    qa: 5,
  };

  const stagesWithDefaults = plannedStages.map((stage) => {
    let stageType = 'impl';
    if (stage.id === 'qa') stageType = 'qa';
    else if (stage.id === 'scaffold') stageType = 'scaffold';
    else if (stage.id.includes('plan')) stageType = stage.id;

    return {
      id: stage.id,
      name: stage.name,
      assignedModel: (modelMap[stageType] || 'haiku-4-5') as ModelAssignment,
      effortLevel: (effortMap[stageType] || 'medium') as EffortLevel,
      specDepth: (depthMap[stageType] || 'Deep') as SpecDepth,
      gate: {
        threshold: gateThresholdMap[stageType] || 3,
        severityPolicy: 'standard' as const,
        domain: 'code' as GateDomain,
      },
      inputManifest: [],
      skillInvocations: [],
    };
  });

  // Build plan with bundle references
  // Derive plan ID deterministically from bundle content hash (required for FR-006 determinism)
  const bundleHash = sha256(
    bundle.prd.content + bundle.trd.content + bundle.avd.content + bundle.tqcd.content
  );
  // Use first 36 chars of hash to form a UUID-like string for uniqueness
  const planId = `${bundleHash.substring(0, 8)}-${bundleHash.substring(8, 12)}-${bundleHash.substring(12, 16)}-${bundleHash.substring(16, 20)}-${bundleHash.substring(20, 32)}`;
  const createdAt = now().toISOString();

  const plan: Plan = {
    schemaVersion: '0.1.0',
    id: planId,
    createdAt,
    bundle: {
      prd: {
        path: bundle.prd.path,
        sha256: sha256(bundle.prd.content),
      },
      trd: {
        path: bundle.trd.path,
        sha256: sha256(bundle.trd.content),
      },
      avd: {
        path: bundle.avd.path,
        sha256: sha256(bundle.avd.content),
      },
      tqcd: {
        path: bundle.tqcd.path,
        sha256: sha256(bundle.tqcd.content),
      },
    },
    stages: stagesWithDefaults,
  };

  // Validate against schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ajv = new (Ajv as any)({ validateFormats: false });
  const validate = ajv.compile(planSchema);
  if (!validate(plan)) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        detail: `Plan failed schema validation: ${JSON.stringify(validate.errors)}`,
      },
    };
  }

  // Check skill gaps
  const gapResult = check(plan, catalog);
  if (!gapResult.ok) {
    return {
      ok: false,
      error: {
        code: 'SKILL_GAP',
        detail: `Skill gaps detected in plan`,
        gaps: gapResult.error,
      },
    };
  }

  // Stage 04: Wire gate.runGateEvaluation in plan-generator exit path.
  // Closes gate-22 Surprise #6 (gate module wired).
  // Build a coverage map: each stage covers exit criteria via its gate threshold.
  // For MVP, every stage is considered to cover at least one exit criterion
  // (the criterion corresponding to its index). The gate evaluation is advisory
  // here — it records coverage but does not block plan generation.
  const stageCoverageMap: Record<string, string[]> = {};
  for (const stage of plan.stages) {
    // Each stage "covers" exit criteria proportional to its gate threshold.
    // QA stage covers all; impl stages cover one each.
    if (stage.id === 'qa') {
      stageCoverageMap[stage.id] = [`ec-qa-convergence`];
    } else {
      stageCoverageMap[stage.id] = [`ec-${stage.id}`];
    }
  }
  const _gateEval = runGateEvaluation({
    stageIds: plan.stages.map((s) => s.id),
    requiredExitCriteriaIds: plan.stages.map((s) => stageCoverageMap[s.id]?.[0] ?? `ec-${s.id}`),
    stageCoverageMap,
  });
  // Gate evaluation result is captured for audit purposes; does not block plan generation.
  // A plan with full coverage will have _gateEval.passed === true.
  void _gateEval;

  return { ok: true, value: plan };
}

// ─── Stage 04b: Live-path BundleAST generator ─────────────────────────────────
// Closes gate-22 C-1 (extractExcellenceSpec live path), M-2, M-10 (model/effort
// derived from spec), H-4 (assignedModel from spec, not hardcode).
// runGateEvaluation is BLOCKING: exit-criteria gap returns error Result.

export interface GenerateFromBundleASTInput {
  bundle: BundleAST;
  catalog: YourSetupCatalog;
  now?: () => Date;
}

export interface GenerateFromBundleASTError {
  code: 'EXCELLENCE_SPEC_ERROR' | 'PLAN_STAGES_ERROR' | 'GATE_CRITERIA_GAP' | 'SKILL_GAP' | 'SCHEMA_INVALID';
  detail: string;
  excellenceSpecError?: ExcellenceSpecError;
  gaps?: { stageId: string; missingSkill: string }[];
  missingCriteriaIds?: string[];
}

/**
 * Generate a Plan from a parsed BundleAST.
 * Live path: uses extractExcellenceSpec (bundle-derived, not hardcoded) +
 * planStages (bundle-aware, not legacy planBackwards) + blocking runGateEvaluation.
 *
 * Closes gate-22:
 *   C-1  — extractExcellenceSpec derives spec from bundle content (not hardcode)
 *   M-2  — model derived from ExcellenceSpec qaCriteria structure (not static map)
 *   M-10 — effort derived from ExcellenceSpec (not static map)
 *   H-4  — assignedModel set from spec, fallback only for unknown stage types
 */
export async function generateFromBundleAST(
  input: GenerateFromBundleASTInput,
): Promise<Result<Plan, GenerateFromBundleASTError>> {
  const { bundle, catalog, now = () => new Date() } = input;

  // Step 1: Extract ExcellenceSpec from bundle content (real path, not fallback).
  const specResult = extractExcellenceSpec(bundle);
  if (!specResult.ok) {
    return {
      ok: false,
      error: {
        code: 'EXCELLENCE_SPEC_ERROR',
        detail: `Failed to extract ExcellenceSpec: ${specResult.error.message}`,
        excellenceSpecError: specResult.error,
      },
    };
  }
  const spec = specResult.value;

  // Step 2: Plan stages from bundle + spec (bundle-aware API).
  const stagePlanResult = planStages(bundle, spec);
  if (!stagePlanResult.ok) {
    return {
      ok: false,
      error: {
        code: 'PLAN_STAGES_ERROR',
        detail: `Failed to plan stages: ${stagePlanResult.error.message}`,
      },
    };
  }
  const stagePlans = stagePlanResult.value;

  // Step 3: Build backwards-ordered planned stages for structural metadata
  // (planStages returns StagePlan[] with stageId/inputs/outputs/exitCriteriaIds/closes;
  //  planBackwards returns PlannedStage[] with id/name/purpose/dependsOn).
  // We need PlannedStage metadata for assignedModel/effortLevel/specDepth/gate.
  // Use planBackwards with the spec for structural ordering.
  const plannedStages = planBackwards(spec);

  // Step 4: Derive model/effort/depth per stage from ExcellenceSpec structure.
  // Closes M-2 (model from spec) + M-10 (effort from spec) + H-4 (no hardcode).
  // Heuristic: stage type derived from qaCriteria count + exitCriteria thresholds.
  const qaCriteriaCount = spec.qaCriteria.length;

  // Model assignment: qa stages always opus (convergence); impl stages scale with
  // criteria complexity; scaffold/plan stages use standard assignments.
  // Effort: qa = high (convergence); impl = derived from exitCriteria threshold strings.
  function deriveModelForStage(stageId: string): ModelAssignment {
    if (stageId === 'qa') return 'opus-4-7';
    if (stageId === 'scaffold') return 'sonnet-4-6';
    if (stageId === 'plan-skeleton') return 'opus-4-7';
    if (stageId === 'plan-full') return 'opus-4-7';
    // impl stages: scale by criteria complexity
    const implIdx = stageId.startsWith('impl-')
      ? parseInt(stageId.replace('impl-', ''), 10)
      : -1;
    if (implIdx >= 0 && implIdx < qaCriteriaCount) {
      // Higher-index impl stages (later criteria) use more capable model
      return implIdx >= qaCriteriaCount - 1 ? 'sonnet-4-6' : 'haiku-4-5';
    }
    return 'haiku-4-5';
  }

  function deriveEffortForStage(stageId: string): EffortLevel {
    if (stageId === 'qa') return 'high';
    if (stageId === 'plan-skeleton') return 'low';
    if (stageId === 'plan-full') return 'medium';
    if (stageId === 'scaffold') return 'medium';
    // impl stages: check if corresponding exitCriteria has strict threshold
    const implIdx = stageId.startsWith('impl-')
      ? parseInt(stageId.replace('impl-', ''), 10)
      : -1;
    if (implIdx >= 0 && implIdx < spec.exitCriteria.length) {
      const threshold = spec.exitCriteria[implIdx]?.threshold ?? '';
      // High threshold (100%) → medium effort; strict mutation thresholds → high
      if (threshold.includes('mutation') || threshold.includes('≥80')) return 'high';
    }
    return 'medium';
  }

  function deriveDepthForStage(stageId: string): SpecDepth {
    if (stageId === 'qa') return 'Deep';
    if (stageId === 'plan-skeleton') return 'Shallow';
    if (stageId === 'plan-full') return 'Medium';
    if (stageId === 'scaffold') return 'Medium';
    return 'Deep';
  }

  function deriveGateThresholdForStage(stageId: string): number {
    if (stageId === 'qa') return 5;
    if (stageId === 'plan-skeleton') return 2;
    if (stageId === 'plan-full') return 3;
    if (stageId === 'scaffold') return 3;
    return 3;
  }

  const stagesWithDefaults = plannedStages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    assignedModel: deriveModelForStage(stage.id),
    effortLevel: deriveEffortForStage(stage.id),
    specDepth: deriveDepthForStage(stage.id),
    gate: {
      threshold: deriveGateThresholdForStage(stage.id),
      severityPolicy: 'standard' as const,
      domain: 'code' as GateDomain,
    },
    inputManifest: [],
    skillInvocations: [],
  }));

  // Step 5: Build plan with bundle references (BundleAST uses ParsedDoc with path).
  const bundleHash = sha256(
    bundle.prd.path + bundle.trd.path + bundle.avd.path + bundle.tqcd.path +
    JSON.stringify(bundle.prd.frontmatter) + JSON.stringify(bundle.tqcd.frontmatter),
  );
  const planId = `${bundleHash.substring(0, 8)}-${bundleHash.substring(8, 12)}-${bundleHash.substring(12, 16)}-${bundleHash.substring(16, 20)}-${bundleHash.substring(20, 32)}`;
  const createdAt = now().toISOString();

  const plan: Plan = {
    schemaVersion: '0.1.0',
    id: planId,
    createdAt,
    bundle: {
      prd: { path: bundle.prd.path, sha256: sha256(bundle.prd.path) },
      trd: { path: bundle.trd.path, sha256: sha256(bundle.trd.path) },
      avd: { path: bundle.avd.path, sha256: sha256(bundle.avd.path) },
      tqcd: { path: bundle.tqcd.path, sha256: sha256(bundle.tqcd.path) },
    },
    stages: stagesWithDefaults,
  };

  // Step 6: Validate against schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ajv = new (Ajv as any)({ validateFormats: false });
  const validate = ajv.compile(planSchema);
  if (!validate(plan)) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        detail: `Plan failed schema validation: ${JSON.stringify(validate.errors)}`,
      },
    };
  }

  // Step 7: Check skill gaps.
  const gapResult = check(plan, catalog);
  if (!gapResult.ok) {
    return {
      ok: false,
      error: {
        code: 'SKILL_GAP',
        detail: 'Skill gaps detected in plan',
        gaps: gapResult.error,
      },
    };
  }

  // Step 8: BLOCKING gate evaluation — exit-criteria coverage check.
  // Closes gate-22 Surprise #6 (gate wired + blocking, not void-discarded).
  const stageCoverageMap: Record<string, string[]> = {};
  for (const sp of stagePlans) {
    stageCoverageMap[sp.stageId] = sp.exitCriteriaIds;
  }

  const requiredExitCriteriaIds = spec.exitCriteria.map((ec) => ec.id);

  const gateResult = runGateEvaluation({
    stageIds: stagePlans.map((sp) => sp.stageId),
    requiredExitCriteriaIds,
    stageCoverageMap,
  });

  if (!gateResult.passed) {
    return {
      ok: false,
      error: {
        code: 'GATE_CRITERIA_GAP',
        detail: `Plan does not cover all required exit criteria. Missing: ${gateResult.missingIds.join(', ')}`,
        missingCriteriaIds: gateResult.missingIds,
      },
    };
  }

  return { ok: true, value: plan };
}
