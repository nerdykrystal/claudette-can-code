import { describe, it, expect } from 'vitest';
import { fc } from 'fast-check';
import { planBackwards, type ExcellenceSpec } from '../../src/core/backwards-planning/index.js';

describe('Backwards-Planning Engine (FR-002)', () => {
  it('empty spec produces minimum stage set', () => {
    const spec: ExcellenceSpec = {
      excellentEndState: '',
      qaCriteria: [],
      constraints: [],
    };

    const stages = planBackwards(spec);

    // Minimum: plan-skeleton, plan-full, scaffold, qa (no impl stages)
    expect(stages.length).toBeGreaterThanOrEqual(4);
    expect(stages.some((s) => s.id === 'plan-skeleton')).toBe(true);
    expect(stages.some((s) => s.id === 'plan-full')).toBe(true);
    expect(stages.some((s) => s.id === 'scaffold')).toBe(true);
    expect(stages.some((s) => s.id === 'qa')).toBe(true);
  });

  it('multi-criterion spec produces N implementation stages', () => {
    const spec: ExcellenceSpec = {
      excellentEndState: 'End state',
      qaCriteria: ['Criterion 1', 'Criterion 2', 'Criterion 3'],
      constraints: [],
    };

    const stages = planBackwards(spec);

    const implStages = stages.filter((s) => s.id.startsWith('impl-'));
    expect(implStages.length).toBe(3);
    expect(implStages.map((s) => s.id)).toEqual(['impl-0', 'impl-1', 'impl-2']);
  });

  it('determinism: same input produces identical output', () => {
    const spec: ExcellenceSpec = {
      excellentEndState: 'End state',
      qaCriteria: ['A', 'B', 'C'],
      constraints: ['Constraint 1'],
    };

    const output1 = planBackwards(spec);
    const output2 = planBackwards(spec);
    const output3 = planBackwards(spec);

    expect(JSON.stringify(output1)).toEqual(JSON.stringify(output2));
    expect(JSON.stringify(output2)).toEqual(JSON.stringify(output3));
  });

  it('dependency ordering invariant: all deps precede dependent', () => {
    const spec: ExcellenceSpec = {
      excellentEndState: 'End',
      qaCriteria: ['A', 'B'],
      constraints: [],
    };

    const stages = planBackwards(spec);

    // Check invariant: for each stage, all its dependsOn stages appear before it
    stages.forEach((stage, idx) => {
      stage.dependsOn.forEach((depId) => {
        const depIdx = stages.findIndex((s) => s.id === depId);
        expect(depIdx).toBeLessThan(idx);
      });
    });
  });

  it('property-based: determinism + dep-order across 100 random specs', () => {
    const specArb = fc.record({
      excellentEndState: fc.string({ maxLength: 100 }),
      qaCriteria: fc.array(fc.string({ maxLength: 50 }), { maxLength: 10 }),
      constraints: fc.array(fc.string({ maxLength: 50 }), { maxLength: 5 }),
    });

    fc.assert(
      fc.property(specArb, (spec) => {
        const output1 = planBackwards(spec);
        const output2 = planBackwards(spec);

        // Determinism
        expect(JSON.stringify(output1)).toEqual(JSON.stringify(output2));

        // Dependency order
        output1.forEach((stage, idx) => {
          stage.dependsOn.forEach((depId) => {
            const depIdx = output1.findIndex((s) => s.id === depId);
            expect(depIdx).toBeLessThan(idx);
          });
        });
      }),
      { numRuns: 100 }
    );
  });

  it('QA stage depends on all impl stages', () => {
    const spec: ExcellenceSpec = {
      excellentEndState: 'End',
      qaCriteria: ['A', 'B', 'C'],
      constraints: [],
    };

    const stages = planBackwards(spec);
    const qaStage = stages.find((s) => s.id === 'qa');

    expect(qaStage).toBeDefined();
    if (qaStage) {
      expect(qaStage.dependsOn).toContain('impl-0');
      expect(qaStage.dependsOn).toContain('impl-1');
      expect(qaStage.dependsOn).toContain('impl-2');
      expect(qaStage.dependsOn.length).toBe(3);
    }
  });

  it('impl stages depend on scaffold', () => {
    const spec: ExcellenceSpec = {
      excellentEndState: 'End',
      qaCriteria: ['A'],
      constraints: [],
    };

    const stages = planBackwards(spec);
    const implStage = stages.find((s) => s.id === 'impl-0');

    expect(implStage).toBeDefined();
    if (implStage) {
      expect(implStage.dependsOn).toContain('scaffold');
    }
  });

  it('scaffold depends on plan-full', () => {
    const spec: ExcellenceSpec = {
      excellentEndState: 'End',
      qaCriteria: [],
      constraints: [],
    };

    const stages = planBackwards(spec);
    const scaffoldStage = stages.find((s) => s.id === 'scaffold');

    expect(scaffoldStage).toBeDefined();
    if (scaffoldStage) {
      expect(scaffoldStage.dependsOn).toContain('plan-full');
    }
  });

  it('plan-full depends on plan-skeleton', () => {
    const spec: ExcellenceSpec = {
      excellentEndState: 'End',
      qaCriteria: [],
      constraints: [],
    };

    const stages = planBackwards(spec);
    const planFullStage = stages.find((s) => s.id === 'plan-full');

    expect(planFullStage).toBeDefined();
    if (planFullStage) {
      expect(planFullStage.dependsOn).toContain('plan-skeleton');
    }
  });
});
