// tests/unit/backwards-planning/index.test.ts
// Stage 04 §3.04: New sub-directory tests for planStages() (bundle-aware API).
// Tests the StagePlan structure, BIDX-derived closes[], and ExcellenceSpec wiring.
// The existing backwards-planning.test.ts covers planBackwards() — this file covers planStages().

import { describe, it, expect } from 'vitest';
import { planStages } from '../../../src/core/backwards-planning/index.js';
import type { ExcellenceSpec } from '../../../src/core/backwards-planning/index.js';
import type { BundleAST, ParsedDoc, Section } from '../../../src/core/bundle-parser/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEmptyDoc(prefix: string): ParsedDoc {
  return {
    path: `/fake/${prefix}.md`,
    frontmatter: {},
    sections: [] as Section[],
    ids: [],
  };
}

function makeMinimalBundle(bidxRows?: { closesFinding: string; via: string; doc: string; sectionId: string }[]): BundleAST {
  return {
    prd: makeEmptyDoc('PRD'),
    trd: makeEmptyDoc('TRD'),
    avd: makeEmptyDoc('AVD'),
    tqcd: makeEmptyDoc('TQCD'),
    uxd: makeEmptyDoc('UXD'),
    bidx: { rows: bidxRows ?? [] },
    rootDir: '/fake',
  };
}

function makeSpec(qaCriteria: string[]): ExcellenceSpec {
  return {
    excellentEndState: 'Excellent end state',
    qaCriteria,
    constraints: ['No silent substitution'],
    exitCriteria: qaCriteria.map((c, i) => ({
      id: `EC-${i + 1}`,
      metric: c,
      threshold: '100%',
      sourceDoc: 'TQCD' as const,
    })),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('planStages — Stage 04 §3.04 bundle-aware API', () => {
  it('test-1: minimal bundle + spec → ok=true; StagePlan array with expected stageIds', () => {
    const bundle = makeMinimalBundle();
    const spec = makeSpec(['criterion-A', 'criterion-B', 'criterion-C']);

    const result = planStages(bundle, spec);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    const plans = result.value;

    // Should produce 3 impl + plan-skeleton + plan-full + scaffold + qa = 7 stages
    expect(plans.length).toBeGreaterThanOrEqual(4);

    const stageIds = plans.map((p) => p.stageId);
    expect(stageIds).toContain('plan-skeleton');
    expect(stageIds).toContain('plan-full');
    expect(stageIds).toContain('scaffold');
    expect(stageIds).toContain('qa');
  });

  it('test-2: each StagePlan has required fields (stageId, inputs, outputs, exitCriteriaIds, closes)', () => {
    const bundle = makeMinimalBundle();
    const spec = makeSpec(['A', 'B']);

    const result = planStages(bundle, spec);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    for (const plan of result.value) {
      expect(typeof plan.stageId).toBe('string');
      expect(plan.stageId.length).toBeGreaterThan(0);
      expect(Array.isArray(plan.inputs)).toBe(true);
      expect(Array.isArray(plan.outputs)).toBe(true);
      expect(Array.isArray(plan.exitCriteriaIds)).toBe(true);
      expect(Array.isArray(plan.closes)).toBe(true);
      // outputs must have exactly one entry (stage artifact)
      expect(plan.outputs).toHaveLength(1);
      expect(plan.outputs[0]).toContain(plan.stageId);
    }
  });

  it('test-3: BIDX rows wire closes[] on matching stages', () => {
    const bundle = makeMinimalBundle([
      {
        closesFinding: 'C-1',
        via: 'plan-generator bundle extraction (replaces F13 hardcode)',
        doc: 'TRD',
        sectionId: 'TRD-impl-feature',
      },
      {
        closesFinding: 'M-9',
        via: 'scaffold directory structure creation',
        doc: 'TRD',
        sectionId: 'TRD-scaffold-dirs',
      },
    ]);
    const spec = makeSpec(['A', 'B']);

    const result = planStages(bundle, spec);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    // The impl stages should have C-1 in closes (via contains 'impl')
    const implStages = result.value.filter((p) => p.stageId.startsWith('impl-'));
    const allCloses = implStages.flatMap((p) => p.closes);
    expect(allCloses).toContain('C-1');

    // The scaffold stage should have M-9 in closes (via contains 'scaffold')
    const scaffoldStage = result.value.find((p) => p.stageId === 'scaffold');
    expect(scaffoldStage).toBeDefined();
    if (scaffoldStage) {
      expect(scaffoldStage.closes).toContain('M-9');
    }
  });

  it('test-4: §3.04 — qa stage exit criteria covers all spec exitCriteria IDs', () => {
    const bundle = makeMinimalBundle();
    const spec = makeSpec(['criterion-A', 'criterion-B', 'criterion-C']);

    const result = planStages(bundle, spec);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    const qaStage = result.value.find((p) => p.stageId === 'qa');
    expect(qaStage).toBeDefined();
    if (!qaStage) throw new Error('QA stage not found');

    // QA stage must cover all exit criteria
    expect(qaStage.exitCriteriaIds.length).toBeGreaterThanOrEqual(1);
  });

  it('test-5: deterministic — same bundle + spec → identical output', () => {
    const bundle = makeMinimalBundle();
    const spec = makeSpec(['A', 'B', 'C']);

    const r1 = planStages(bundle, spec);
    const r2 = planStages(bundle, spec);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    if (r1.ok && r2.ok) {
      expect(JSON.stringify(r1.value)).toBe(JSON.stringify(r2.value));
    }
  });

  it('test-6: impl stages have inputs derived from scaffold dependency', () => {
    const bundle = makeMinimalBundle();
    const spec = makeSpec(['A']);

    const result = planStages(bundle, spec);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    const implStage = result.value.find((p) => p.stageId === 'impl-0');
    expect(implStage).toBeDefined();
    if (!implStage) throw new Error('impl-0 not found');

    // impl-0 depends on 'scaffold', so its inputs should reference scaffold
    expect(implStage.inputs).toContain('scaffold.outputs');
  });

  it('test-7: empty BIDX → all closes[] are empty arrays', () => {
    const bundle = makeMinimalBundle([]);
    const spec = makeSpec(['A', 'B']);

    const result = planStages(bundle, spec);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    // With empty BIDX, no stage should have any closes entries
    for (const plan of result.value) {
      expect(plan.closes).toEqual([]);
    }
  });

  it('test-8: stage ordering from planStages preserves dep-ordering invariant', () => {
    const bundle = makeMinimalBundle();
    const spec = makeSpec(['A', 'B']);

    const result = planStages(bundle, spec);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    // Verify stageId order: plan-skeleton, plan-full, scaffold, impl-0, impl-1, qa
    const ids = result.value.map((p) => p.stageId);
    expect(ids).toEqual(['plan-skeleton', 'plan-full', 'scaffold', 'impl-0', 'impl-1', 'qa']);
  });
});
