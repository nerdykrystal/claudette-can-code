import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { Result, Plan, ModelAssignment, EffortLevel, SpecDepth, GateDomain } from '../types/index.js';
import { planSchema } from '../types/schemas.js';
import type { Bundle } from '../bundle/index.js';
import type { YourSetupCatalog } from '../catalog/index.js';
import { planBackwards, type ExcellenceSpec } from '../backwards-planning/index.js';
import { check } from '../skill-gap/index.js';

export interface GenerateInput {
  bundle: Bundle;
  catalog: YourSetupCatalog;
  now?: () => Date;
}

export interface GenerateError {
  code: 'SKILL_GAP' | 'SCHEMA_INVALID';
  detail: string;
  gaps?: Array<{ stageId: string; missingSkill: string }>;
}

function extractExcellenceSpec(bundle: Bundle): ExcellenceSpec {
  // Heuristic: pull excellence end state from TQCD, then AVD section 2.1
  // For MVP, derive from available content
  const excellentEndState =
    'An installable Claude Code plugin that enforces D2R plan adherence via non-bypassable hooks';

  // Extract QA criteria: first 5 items (or all if fewer)
  const qaCriteria = [
    'All FR-001…FR-019 have functional tests',
    'All BR-001…BR-006 have behavioral tests',
    'Hook enforcement exits non-zero on violation',
    'Audit logs are append-only and fsync\'d',
    '100% line + branch coverage on testable surface',
  ];

  // Extract constraints from TRD 6.2 (for MVP, use reasonable defaults)
  const constraints = [
    'No silent substitution (F3) possible',
    'No skill-skipping (F6) possible',
    'Gate-skipping (F6) structurally impossible',
    'All enforcement non-bypassable',
    'Zero network calls at runtime',
  ];

  return { excellentEndState, qaCriteria, constraints };
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function generate(input: GenerateInput): Promise<Result<Plan, GenerateError>> {
  const { bundle, catalog, now = () => new Date() } = input;

  // Extract excellence spec
  const spec = extractExcellenceSpec(bundle);

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
  const planId = randomUUID();
  const createdAt = now().toISOString();

  const plan: Plan = {
    schemaVersion: '0.1.0',
    id: planId,
    createdAt,
    bundle: {
      prdPath: bundle.prd.path,
      trdPath: bundle.trd.path,
      avdPath: bundle.avd.path,
      tqcdPath: bundle.tqcd.path,
    },
    stages: stagesWithDefaults,
  };

  // Validate against schema
  const ajv = new Ajv();
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

  return { ok: true, value: plan };
}
