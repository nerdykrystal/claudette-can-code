// tests/unit/plan-generator/generate-from-bundle-ast.test.ts
// Stage 04b: Tests for generateFromBundleAST — live path that uses extractExcellenceSpec
// (bundle-derived), planStages (bundle-aware), and blocking runGateEvaluation.
// Closes gate-22 C-1 / M-2 / M-10 / H-4 FUNCTIONALLY (not just structurally).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateFromBundleAST, type GenerateFromBundleASTInput } from '../../../src/core/plan-generator/index.js';
import type { BundleAST, ParsedDoc, Section } from '../../../src/core/bundle-parser/types.js';
import type { YourSetupCatalog } from '../../../src/core/catalog/index.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEmptyDoc(prefix: string): ParsedDoc {
  return {
    path: `/fake/${prefix}.md`,
    frontmatter: {},
    sections: [] as Section[],
    ids: [],
  };
}

function makeMinimalBundle(): BundleAST {
  return {
    prd: makeEmptyDoc('PRD'),
    trd: makeEmptyDoc('TRD'),
    avd: makeEmptyDoc('AVD'),
    tqcd: makeEmptyDoc('TQCD'),
    uxd: makeEmptyDoc('UXD'),
    bidx: { rows: [] },
    rootDir: '/fake',
  };
}

function makeRichBundle(): BundleAST {
  const tqcdSections: Section[] = [
    {
      id: 'TQCD-3',
      level: 2,
      title: 'Test Coverage Gates',
      body: `Coverage requirements:
- All FR-001 have functional tests
- All BR-001 have behavioral tests
- Hook enforcement exits non-zero
- 100% line coverage on testable surface`,
    },
    {
      id: 'TQCD-6',
      level: 2,
      title: 'Performance Metrics',
      body: `| Line coverage | 100% | vitest | Stage QA |
| Branch coverage | 100% | vitest | Stage QA |
| Mutation score | ≥80% | Stryker | Stage QA |`,
    },
  ];

  const prdSections: Section[] = [
    {
      id: 'PRD-6',
      level: 2,
      title: 'Non-Functional Requirements',
      body: `- No silent substitution possible
- All enforcement non-bypassable`,
    },
  ];

  return {
    prd: {
      path: '/fake/PRD.md',
      frontmatter: { description: 'A plugin that enforces D2R plan adherence' },
      sections: prdSections,
      ids: ['PRD-FR-01'],
    },
    trd: makeEmptyDoc('TRD'),
    avd: makeEmptyDoc('AVD'),
    tqcd: {
      path: '/fake/TQCD.md',
      frontmatter: {},
      sections: tqcdSections,
      ids: ['TQCD-FR-01', 'TQCD-QA-01'],
    },
    uxd: makeEmptyDoc('UXD'),
    bidx: { rows: [] },
    rootDir: '/fake',
  };
}

function makeCatalog(): YourSetupCatalog {
  return {
    skills: [],
    plugins: [],
    mcpServers: [],
    source: { settingsPath: '/fake/settings.json', pluginsDir: '/fake/plugins' },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('generateFromBundleAST — Stage 04b live path', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('test-1: minimal bundle → ok=true; plan has stages, schemaVersion, id, createdAt', async () => {
    const input: GenerateFromBundleASTInput = {
      bundle: makeMinimalBundle(),
      catalog: makeCatalog(),
      now: () => new Date('2026-04-27T12:00:00Z'),
    };

    const result = await generateFromBundleAST(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    expect(result.value.schemaVersion).toBe('0.1.0');
    expect(result.value.stages.length).toBeGreaterThan(0);
    expect(typeof result.value.id).toBe('string');
    expect(result.value.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(() => new Date(result.value.createdAt)).not.toThrow();
  });

  it('test-2: rich bundle → ok=true; assignedModel from spec (not hardcode)', async () => {
    const input: GenerateFromBundleASTInput = {
      bundle: makeRichBundle(),
      catalog: makeCatalog(),
    };

    const result = await generateFromBundleAST(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    // All stages must have a valid assignedModel (M-2 / H-4 closure)
    for (const stage of result.value.stages) {
      expect(['opus-4-7', 'sonnet-4-6', 'haiku-4-5']).toContain(stage.assignedModel);
    }

    // QA stage must be assigned opus-4-7 (convergence model)
    const qaStage = result.value.stages.find((s) => s.id === 'qa');
    expect(qaStage).toBeDefined();
    if (qaStage) {
      expect(qaStage.assignedModel).toBe('opus-4-7');
    }
  });

  it('test-3: effortLevel derived from spec (M-10 closure)', async () => {
    const input: GenerateFromBundleASTInput = {
      bundle: makeMinimalBundle(),
      catalog: makeCatalog(),
    };

    const result = await generateFromBundleAST(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    // All stages must have a valid effortLevel
    for (const stage of result.value.stages) {
      expect(['low', 'medium', 'high']).toContain(stage.effortLevel);
    }

    // QA stage must be high effort
    const qaStage = result.value.stages.find((s) => s.id === 'qa');
    expect(qaStage?.effortLevel).toBe('high');

    // plan-skeleton must be low effort
    const planSkeleton = result.value.stages.find((s) => s.id === 'plan-skeleton');
    expect(planSkeleton?.effortLevel).toBe('low');
  });

  it('test-4: deterministic — same bundle + now → identical output', async () => {
    const fixedNow = () => new Date('2026-04-27T12:00:00Z');
    const input: GenerateFromBundleASTInput = {
      bundle: makeMinimalBundle(),
      catalog: makeCatalog(),
      now: fixedNow,
    };

    const r1 = await generateFromBundleAST(input);
    const r2 = await generateFromBundleAST(input);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(JSON.stringify(r1.value)).toBe(JSON.stringify(r2.value));
    }
  });

  it('test-5: TQCD with sections but no §3 → EXCELLENCE_SPEC_ERROR (tqcd_missing_section_3)', async () => {
    const bundle: BundleAST = {
      ...makeMinimalBundle(),
      tqcd: {
        path: '/fake/TQCD.md',
        frontmatter: {},
        sections: [
          { id: 'TQCD-X', level: 2, title: 'Introduction', body: 'Some intro text that is non-empty.' },
          { id: 'TQCD-Y', level: 2, title: 'Glossary', body: 'Terms and definitions.' },
        ],
        ids: [],
      },
    };

    const input: GenerateFromBundleASTInput = {
      bundle,
      catalog: makeCatalog(),
    };

    const result = await generateFromBundleAST(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected ok=false');

    expect(result.error.code).toBe('EXCELLENCE_SPEC_ERROR');
    expect(result.error.excellenceSpecError?.kind).toBe('tqcd_missing_section_3');
  });

  it('test-6: gate evaluation BLOCKS when stagePlans cover all exit criteria (passes)', async () => {
    // With a minimal bundle, extractExcellenceSpec uses defaults (5 exit criteria).
    // planStages maps qa stage to cover all of them. Gate should pass.
    const input: GenerateFromBundleASTInput = {
      bundle: makeMinimalBundle(),
      catalog: makeCatalog(),
    };

    const result = await generateFromBundleAST(input);

    // Gate should pass → overall result ok
    expect(result.ok).toBe(true);
  });

  it('test-7: GATE_CRITERIA_GAP returned when runGateEvaluation fails', async () => {
    // Mock runGateEvaluation to return passed=false with missing criteria
    vi.doMock('../../../src/core/gate/index.js', async (importOriginal) => {
      const orig = await importOriginal<typeof import('../../../src/core/gate/index.js')>();
      return {
        ...orig,
        runGateEvaluation: () => ({
          passed: false,
          coveredIds: [],
          missingIds: ['EC-1', 'EC-2'],
        }),
      };
    });
    vi.resetModules();

    const { generateFromBundleAST: gen } = await import('../../../src/core/plan-generator/index.js');
    const result = await gen({
      bundle: makeMinimalBundle(),
      catalog: makeCatalog(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected ok=false');
    expect(result.error.code).toBe('GATE_CRITERIA_GAP');
    expect(result.error.missingCriteriaIds).toEqual(['EC-1', 'EC-2']);
    expect(result.error.detail).toContain('EC-1');
  });

  it('test-8: SKILL_GAP returned when skill check reports gaps', async () => {
    vi.doMock('../../../src/core/skill-gap/index.js', () => ({
      check: () => ({
        ok: false,
        error: [{ stageId: 'impl-0', missingSkill: '/imaginary-skill' }],
      }),
    }));
    vi.resetModules();

    const { generateFromBundleAST: gen } = await import('../../../src/core/plan-generator/index.js');
    const result = await gen({
      bundle: makeMinimalBundle(),
      catalog: makeCatalog(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected ok=false');
    expect(result.error.code).toBe('SKILL_GAP');
    expect(result.error.gaps).toEqual([{ stageId: 'impl-0', missingSkill: '/imaginary-skill' }]);
  });
});
