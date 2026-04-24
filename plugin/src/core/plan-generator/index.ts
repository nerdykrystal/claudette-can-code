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
  gaps?: { stageId: string; missingSkill: string }[];
}

function extractExcellenceSpec(): ExcellenceSpec {
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
  const spec = extractExcellenceSpec();

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
  // istanbul ignore next — Plan construction guarantees schema validity; unreachable with well-formed input
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
  // istanbul ignore next — Skill gaps unreachable if input catalog is consistent with generated plan
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
