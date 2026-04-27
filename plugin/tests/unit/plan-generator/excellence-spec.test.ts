// tests/unit/plan-generator/excellence-spec.test.ts
// Stage 04 §3.04: ≥4 tests for extractExcellenceSpec per plan spec.
// Tests: (1) real-like bundle → ok + qaCriteria.length ≥ 5 + exitCriteria present
//        (2) bundle without TQCD §3 (sections present but no match) → tqcd_missing_section_3
//        (3) minimal bundle (no sections) → fallback defaults, ok=true
//        (4) bundle with structured TQCD table → exitCriteria rows extracted

import { describe, it, expect } from 'vitest';
import { extractExcellenceSpec } from '../../../src/core/plan-generator/excellence-spec.js';
import type { BundleAST, ParsedDoc, Section } from '../../../src/core/bundle-parser/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEmptyDoc(prefix: string): ParsedDoc {
  return {
    path: `/fake/${prefix}.md`,
    frontmatter: {},
    sections: [],
    ids: [],
  };
}

function makeSection(id: string, level: number, title: string, body: string): Section {
  return { id, level, title, body };
}

/**
 * Minimal valid BundleAST — all docs empty (no sections, no IDs).
 * extractExcellenceSpec should use fallback defaults and succeed.
 */
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

/**
 * Bundle with a TQCD that has §3 coverage section with list items.
 * This should produce structured qaCriteria + exitCriteria.
 */
function makeRichBundle(): BundleAST {
  const tqcdSections: Section[] = [
    makeSection('TQCD-1', 1, 'Quality Overview', 'Introduction to QA methodology.'),
    makeSection(
      'TQCD-3',
      2,
      'Test Coverage Gates',
      `Coverage requirements for CDCC:
- All FR-001…FR-019 have functional tests
- All BR-001…BR-006 have behavioral tests
- Hook enforcement exits non-zero on violation
- Audit logs are append-only and fsync'd
- 100% line + branch coverage on testable surface
- Mutation score ≥80% on critical files`,
    ),
    makeSection(
      'TQCD-5',
      2,
      'Quality Acceptance Criteria',
      `Acceptance:
- Zero outstanding CRITICAL/HIGH findings at QA convergence
- All hooks pass integration tests`,
    ),
    makeSection(
      'TQCD-6',
      2,
      'Performance Metrics',
      `| Gate | Threshold | Tooling | Stage |
|---|---|---|---|
| Line coverage | 100% | vitest --coverage | Stage QA |
| Branch coverage | 100% | vitest --coverage | Stage QA |
| Mutation score | ≥80% | Stryker | Stage QA |`,
    ),
  ];

  const prdSections: Section[] = [
    makeSection(
      'PRD-6',
      2,
      'Non-Functional Requirements',
      `- No silent substitution (F3) possible
- No skill-skipping (F6) possible
- All enforcement non-bypassable`,
    ),
  ];

  return {
    prd: { path: '/fake/PRD.md', frontmatter: {}, sections: prdSections, ids: ['PRD-FR-01', 'PRD-FR-02'] },
    trd: makeEmptyDoc('TRD'),
    avd: makeEmptyDoc('AVD'),
    tqcd: {
      path: '/fake/TQCD.md',
      frontmatter: {},
      sections: tqcdSections,
      ids: ['TQCD-FR-01', 'TQCD-NFR-01', 'TQCD-QA-01'],
    },
    uxd: makeEmptyDoc('UXD'),
    bidx: {
      rows: [
        { closesFinding: 'C-1', via: 'plan-generator rewrite', doc: 'TRD', sectionId: 'TRD-FR-01' },
        { closesFinding: 'M-9', via: 'bundle-parser implementation', doc: 'TRD', sectionId: 'TRD-FR-02' },
      ],
    },
    rootDir: '/fake',
  };
}

/**
 * Bundle where TQCD has sections but none match the §3 coverage pattern
 * (all section IDs/titles are unrelated to coverage/qa/exit).
 * extractExcellenceSpec should return tqcd_missing_section_3.
 */
function makeBundleWithoutTqcdSection3(): BundleAST {
  const tqcdSections: Section[] = [
    makeSection('TQCD-X', 2, 'Introduction', 'Some intro text that is non-empty.'),
    makeSection('TQCD-Y', 2, 'Methodology Overview', 'More content here that is also not coverage.'),
    makeSection('TQCD-Z', 2, 'Glossary', 'Terms and definitions for this document.'),
  ];

  return {
    prd: makeEmptyDoc('PRD'),
    trd: makeEmptyDoc('TRD'),
    avd: makeEmptyDoc('AVD'),
    tqcd: {
      path: '/fake/TQCD.md',
      frontmatter: {},
      sections: tqcdSections,
      ids: [],
    },
    uxd: makeEmptyDoc('UXD'),
    bidx: { rows: [] },
    rootDir: '/fake',
  };
}

/**
 * Bundle with TQCD containing a markdown table with metrics.
 */
function makeBundleWithTqcdTable(): BundleAST {
  const tqcdSections: Section[] = [
    makeSection(
      'TQCD-3',
      2,
      'Coverage Thresholds',
      `The following table defines exit criteria:
| Line coverage | 100% | vitest v8 | per-stage |
| Branch coverage | 100% | vitest v8 | per-stage |
| Function coverage | 100% | vitest v8 | per-stage |
| Statement coverage | 100% | vitest v8 | per-stage |
| Mutation score | ≥80% | Stryker | nightly |`,
    ),
  ];

  return {
    prd: makeEmptyDoc('PRD'),
    trd: makeEmptyDoc('TRD'),
    avd: makeEmptyDoc('AVD'),
    tqcd: {
      path: '/fake/TQCD.md',
      frontmatter: {},
      sections: tqcdSections,
      ids: [],
    },
    uxd: makeEmptyDoc('UXD'),
    bidx: { rows: [] },
    rootDir: '/fake',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extractExcellenceSpec — Stage 04 §3.04', () => {
  it('test-1: rich bundle → ok=true; qaCriteria.length ≥ 5; exitCriteria present', () => {
    const bundle = makeRichBundle();
    const result = extractExcellenceSpec(bundle);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    const spec = result.value;

    // §3.04 test-1: qaCriteria.length ≥ 5 (derived from TQCD §3 + §5)
    expect(spec.qaCriteria.length).toBeGreaterThanOrEqual(5);

    // exitCriteria contains all declared TQCD §6 metrics
    expect(spec.exitCriteria.length).toBeGreaterThan(0);

    // qaCriteriaStructured must have sourceDoc = 'TQCD'
    expect(spec.qaCriteriaStructured.length).toBeGreaterThan(0);
    expect(spec.qaCriteriaStructured.every((q) => q.sourceDoc === 'TQCD')).toBe(true);

    // excellentEndState is a non-empty string
    expect(typeof spec.excellentEndState).toBe('string');
    expect(spec.excellentEndState.length).toBeGreaterThan(0);
  });

  it('test-2: bundle without TQCD §3 (sections present, none match) → tqcd_missing_section_3', () => {
    const bundle = makeBundleWithoutTqcdSection3();
    const result = extractExcellenceSpec(bundle);

    // §3.04 test-2: must return error when TQCD has sections but no §3
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected ok=false');

    expect(result.error.kind).toBe('tqcd_missing_section_3');
    expect(result.error.message.length).toBeGreaterThan(0);
  });

  it('test-3: minimal bundle (no sections) → fallback defaults, ok=true', () => {
    const bundle = makeMinimalBundle();
    const result = extractExcellenceSpec(bundle);

    // §3.04 test-3: minimal fixture should succeed with fallback defaults
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    const spec = result.value;

    // qaCriteria from defaults: 5 items
    expect(spec.qaCriteria.length).toBeGreaterThanOrEqual(5);

    // exitCriteria from defaults: at least 1
    expect(spec.exitCriteria.length).toBeGreaterThanOrEqual(1);

    // constraints from defaults
    expect(spec.constraints.length).toBeGreaterThanOrEqual(1);

    // ExcellenceSpec interface invariants
    expect(typeof spec.excellentEndState).toBe('string');
    expect(Array.isArray(spec.qaCriteriaStructured)).toBe(true);
    expect(Array.isArray(spec.constraintsStructured)).toBe(true);
  });

  it('test-4: TQCD with table rows → exitCriteria rows extracted with metric + threshold', () => {
    const bundle = makeBundleWithTqcdTable();
    const result = extractExcellenceSpec(bundle);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    const spec = result.value;

    // §3.04 test-4: table-derived exit criteria should have id + metric + threshold + sourceDoc
    expect(spec.exitCriteria.length).toBeGreaterThanOrEqual(1);

    for (const ec of spec.exitCriteria) {
      expect(typeof ec.id).toBe('string');
      expect(typeof ec.metric).toBe('string');
      expect(typeof ec.threshold).toBe('string');
      expect(ec.sourceDoc).toBe('TQCD');
      expect(ec.metric.length).toBeGreaterThan(0);
      expect(ec.threshold.length).toBeGreaterThan(0);
    }
  });

  it('test-5: result is deterministic — same input produces identical output', () => {
    const bundle = makeRichBundle();

    const r1 = extractExcellenceSpec(bundle);
    const r2 = extractExcellenceSpec(bundle);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    if (r1.ok && r2.ok) {
      expect(JSON.stringify(r1.value)).toBe(JSON.stringify(r2.value));
    }
  });

  it('test-6: constraints from PRD §6 are populated in constraintsStructured', () => {
    const bundle = makeRichBundle();
    const result = extractExcellenceSpec(bundle);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok=true');

    // PRD has a §6 section with 3 constraint items
    const spec = result.value;
    expect(spec.constraintsStructured.length).toBeGreaterThanOrEqual(1);

    // At least one constraint from PRD
    const prdConstraints = spec.constraintsStructured.filter((c) => c.sourceDoc === 'PRD');
    expect(prdConstraints.length).toBeGreaterThanOrEqual(1);
  });
});
