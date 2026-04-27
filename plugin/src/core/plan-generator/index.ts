import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { Result, Plan, ModelAssignment, EffortLevel, SpecDepth, GateDomain } from '../types/index.js';
import { planSchema } from '../types/schemas.js';
import type { Bundle } from '../bundle/index.js';
import type { BundleAST } from '../bundle-parser/types.js';
import type { YourSetupCatalog } from '../catalog/index.js';
import { extractExcellenceSpec, type ExcellenceSpec } from '../plan-generator/excellence-spec.js';
import { planStages, type StagePlan } from '../backwards-planning/index.js';
import { check } from '../skill-gap/index.js';
import { runGate, type GateScope, type Auditor } from '../gate/index.js';

export interface GenerateInput {
  bundle: Bundle;
  bundleAST?: BundleAST;
  catalog: YourSetupCatalog;
  now?: () => Date;
}

export interface GenerateError {
  code: 'SKILL_GAP' | 'SCHEMA_INVALID' | 'EXCELLENCE_SPEC_INVALID';
  detail: string;
  gaps?: { stageId: string; missingSkill: string }[];
}


function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function generate(input: GenerateInput): Promise<Result<Plan, GenerateError>> {
  const { bundle, bundleAST, catalog, now = () => new Date() } = input;

  // Extract excellence spec from bundle AST (bundle-derived, not hardcoded)
  if (!bundleAST) {
    return {
      ok: false,
      error: {
        code: 'EXCELLENCE_SPEC_INVALID',
        detail: 'BundleAST required to extract excellence spec',
      },
    };
  }

  const specResult = extractExcellenceSpec(bundleAST);
  if (!specResult.ok) {
    return {
      ok: false,
      error: {
        code: 'EXCELLENCE_SPEC_INVALID',
        detail: `Failed to extract excellence spec: ${specResult.error.message}`,
      },
    };
  }

  const spec: ExcellenceSpec = specResult.value;

  // Plan backwards from excellence spec
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planStagesResult: Result<StagePlan[], any> = planStages(bundleAST, spec);
  if (!planStagesResult.ok) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        detail: `Failed to plan stages: ${planStagesResult.error.message}`,
      },
    };
  }

  const plannedStages = planStagesResult.value;

  // D2R model/effort/depth/gate defaults per stage naming
  const modelMap: Record<string, ModelAssignment> = {
    'stage-1': 'haiku-4-5',
    'stage-2': 'haiku-4-5',
    'stage-3': 'haiku-4-5',
    'stage-4': 'haiku-4-5',
    'stage-5': 'haiku-4-5',
    'qa': 'opus-4-7',
  };

  const effortMap: Record<string, EffortLevel> = {
    'stage-1': 'medium',
    'stage-2': 'medium',
    'stage-3': 'medium',
    'stage-4': 'medium',
    'stage-5': 'medium',
    'qa': 'high',
  };

  const depthMap: Record<string, SpecDepth> = {
    'stage-1': 'Deep',
    'stage-2': 'Deep',
    'stage-3': 'Deep',
    'stage-4': 'Deep',
    'stage-5': 'Deep',
    'qa': 'Deep',
  };

  const gateThresholdMap: Record<string, number> = {
    'stage-1': 3,
    'stage-2': 3,
    'stage-3': 3,
    'stage-4': 3,
    'stage-5': 3,
    'qa': 5,
  };

  const stagesWithDefaults = plannedStages.map((stage) => {
    const stageType = stage.stageId;

    return {
      id: stage.stageId,
      name: `Stage ${stage.stageId}`,
      assignedModel: (modelMap[stageType] || 'haiku-4-5') as ModelAssignment,
      effortLevel: (effortMap[stageType] || 'medium') as EffortLevel,
      specDepth: (depthMap[stageType] || 'Deep') as SpecDepth,
      gate: {
        threshold: gateThresholdMap[stageType] || 3,
        severityPolicy: 'standard' as const,
        domain: 'code' as GateDomain,
      },
      inputManifest: stage.inputs,
      skillInvocations: [],
      exitCriteriaIds: stage.exitCriteriaIds,
      closes: stage.closes,
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

  // Wire gate evaluation: verify all exit criteria are covered by stage plans
  const gateAuditor: Auditor = async (_scope, _iteration) => {
    const findings = [];

    // Verify all exit criteria covered by some stage's exitCriteriaIds
    const coveredCriteria = new Set<string>();
    for (const stage of plannedStages) {
      for (const id of stage.exitCriteriaIds) {
        coveredCriteria.add(id);
      }
    }

    for (const ec of spec.exitCriteria) {
      if (!coveredCriteria.has(ec.id)) {
        findings.push({
          severity: 'CRITICAL' as const,
          message: `Exit criterion ${ec.id} (${ec.metric}) not covered by any stage plan`,
          source: 'plan-generator-gate',
        });
      }
    }

    return findings;
  };

  const gateScope: GateScope = {
    target: plan.id,
    sources: [bundleAST.rootDir],
    prompt: `Verify plan ${plan.id} covers all excellence spec exit criteria`,
    domain: 'code',
    threshold: 3,
    severityPolicy: 'strict',
    maxIterations: 1,
  };

  const gateResult = await runGate(gateScope, gateAuditor);
  if (!gateResult.converged) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        detail: `Plan gate evaluation failed: ${gateResult.findings.map((f) => f.message).join('; ')}`,
      },
    };
  }

  return { ok: true, value: plan };
}
