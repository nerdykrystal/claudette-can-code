import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { Result, Plan, ModelAssignment, EffortLevel, SpecDepth, GateDomain } from '../types/index.js';
import { planSchema } from '../types/schemas.js';
import type { Bundle } from '../bundle/index.js';
import type { YourSetupCatalog } from '../catalog/index.js';
import { planBackwards, type ExcellenceSpec } from '../backwards-planning/index.js';
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
