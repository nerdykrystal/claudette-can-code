// excellence-spec.ts — Stage 04 §3.04. Bundle-derived ExcellenceSpec extractor.
// Replaces hardcoded extractExcellenceSpec in plan-generator/index.ts.
// ASAE methodology (Martinez Methods). Pure logic; no I/O.

import type { BundleAST, Section } from '../bundle-parser/types.js';
import type { Result } from '../types/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExcellenceSpec {
  excellentEndState: string;
  qaCriteria: string[];
  constraints: string[];
  // Stage 04 extensions: bundle-derived structured fields
  qaCriteriaStructured: { id: string; description: string; sourceDoc: string; sourceId: string }[];
  constraintsStructured: { id: string; description: string; sourceDoc: string }[];
  exitCriteria: { id: string; metric: string; threshold: string; sourceDoc: string }[];
}

export type ExcellenceSpecError =
  | { kind: 'tqcd_missing_section_3'; message: string }
  | { kind: 'no_exit_criteria_found'; message: string };

// ─── Section classifiers ─────────────────────────────────────────────────────

function isQaSection(section: Section): boolean {
  const titleLower = section.title.toLowerCase();
  const idLower = section.id.toLowerCase();
  return (
    idLower.includes('3') ||
    idLower.includes('5') ||
    titleLower.includes('qa') ||
    titleLower.includes('quality') ||
    titleLower.includes('test') ||
    titleLower.includes('coverage') ||
    titleLower.includes('criteria')
  );
}

function isConstraintSectionPrd(section: Section): boolean {
  const titleLower = section.title.toLowerCase();
  return (
    section.id.includes('6') ||
    titleLower.includes('constraint') ||
    titleLower.includes('non-functional') ||
    titleLower.includes('nfr') ||
    titleLower.includes('restriction')
  );
}

function isConstraintSectionAvd(section: Section): boolean {
  const titleLower = section.title.toLowerCase();
  return (
    titleLower.includes('constraint') ||
    titleLower.includes('architecture') ||
    titleLower.includes('decision')
  );
}

function isExitCriteriaSection(section: Section): boolean {
  const idLower = section.id.toLowerCase();
  const titleLower = section.title.toLowerCase();
  return (
    idLower.includes('3') ||
    idLower.includes('6') ||
    titleLower.includes('coverage') ||
    titleLower.includes('exit') ||
    titleLower.includes('gate') ||
    titleLower.includes('threshold') ||
    titleLower.includes('metric') ||
    titleLower.includes('performance') ||
    titleLower.includes('nfr') ||
    titleLower.includes('service level') ||
    titleLower.includes('sla')
  );
}

// ─── List-item extractor ─────────────────────────────────────────────────────

function extractListItems(body: string): string[] {
  const items: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    const m = trimmed.match(/^[-*+]\s+(.+)$/) ?? trimmed.match(/^\d+\.\s+(.+)$/);
    if (m) {
      const desc = m[1].trim();
      if (desc.length > 0) items.push(desc);
    }
  }
  return items;
}

// ─── QA criteria extraction ──────────────────────────────────────────────────

type QaStructured = ExcellenceSpec['qaCriteriaStructured'];

function extractQaCriteriaFromSection(
  section: Section,
  acc: QaStructured,
): void {
  for (const desc of extractListItems(section.body)) {
    acc.push({
      id: `TQCD-QA-${acc.length + 1}`,
      description: desc,
      sourceDoc: 'TQCD',
      sourceId: section.id,
    });
  }
}

function extractQaCriteriaFromIds(tqcdIds: string[], acc: QaStructured): void {
  for (const id of tqcdIds) {
    if (id.includes('FR') || id.includes('NFR') || id.includes('QA')) {
      const alreadyAdded = acc.some((s) => s.sourceId === id);
      if (!alreadyAdded) {
        acc.push({
          id: `TQCD-${id}`,
          description: `Requirement ${id} from TQCD`,
          sourceDoc: 'TQCD',
          sourceId: id,
        });
      }
    }
  }
}

function defaultQaCriteria(): QaStructured {
  const defaults = [
    'All functional requirements have test coverage',
    'All behavioral requirements have test coverage',
    'Hook enforcement exits non-zero on violation',
    'Audit logs are append-only and fsync\'d',
    '100% line + branch coverage on testable surface',
  ];
  return defaults.map((desc, i) => ({
    id: `TQCD-QA-${i + 1}`,
    description: desc,
    sourceDoc: 'TQCD',
    sourceId: 'default',
  }));
}

function extractQaCriteria(bundle: BundleAST): { structured: QaStructured; flat: string[] } {
  const structured: QaStructured = [];

  for (const section of bundle.tqcd.sections) {
    if (isQaSection(section) && section.body.trim().length > 0) {
      extractQaCriteriaFromSection(section, structured);
    }
  }

  extractQaCriteriaFromIds(bundle.tqcd.ids, structured);

  if (structured.length === 0) {
    structured.push(...defaultQaCriteria());
  }

  return { structured, flat: structured.map((s) => s.description) };
}

// ─── Constraints extraction ──────────────────────────────────────────────────

type ConstraintStructured = ExcellenceSpec['constraintsStructured'];

function extractConstraintsFromSection(
  section: Section,
  sourceDoc: string,
  acc: ConstraintStructured,
): void {
  for (const desc of extractListItems(section.body)) {
    acc.push({
      id: `${sourceDoc}-C-${acc.length + 1}`,
      description: desc,
      sourceDoc,
    });
  }
}

function defaultConstraints(): ConstraintStructured {
  const defaults = [
    'No silent substitution (F3) possible',
    'No skill-skipping (F6) possible',
    'Gate-skipping (F6) structurally impossible',
    'All enforcement non-bypassable',
    'Zero network calls at runtime',
  ];
  return defaults.map((desc, i) => ({
    id: `C-${i + 1}`,
    description: desc,
    sourceDoc: 'PRD',
  }));
}

function extractConstraints(bundle: BundleAST): { structured: ConstraintStructured; flat: string[] } {
  const structured: ConstraintStructured = [];

  for (const section of bundle.prd.sections) {
    if (isConstraintSectionPrd(section) && section.body.trim().length > 0) {
      extractConstraintsFromSection(section, 'PRD', structured);
    }
  }

  for (const section of bundle.avd.sections) {
    if (isConstraintSectionAvd(section) && section.body.trim().length > 0) {
      extractConstraintsFromSection(section, 'AVD', structured);
    }
  }

  if (structured.length === 0) {
    structured.push(...defaultConstraints());
  }

  return { structured, flat: structured.map((s) => s.description) };
}

// ─── Exit criteria extraction ─────────────────────────────────────────────────

type ExitCriteriaItem = ExcellenceSpec['exitCriteria'][number];

function extractTableRow(line: string, acc: ExitCriteriaItem[]): void {
  const m = line.trim().match(/^\|(.+)\|$/);
  if (!m) return;
  const cells = m[1].split('|').map((c) => c.trim());
  if (cells.length < 2) return;
  const metric = cells[0];
  const threshold = cells[1];
  if (metric.length === 0 || threshold.length === 0) return;
  if (metric.startsWith('-') || metric.toLowerCase() === 'gate') return;
  acc.push({ id: `EC-${acc.length + 1}`, metric, threshold, sourceDoc: 'TQCD' });
}

function extractMetricLine(line: string, acc: ExitCriteriaItem[]): void {
  const m = line.trim().match(/^[-*+]\s+(.+?):\s*(.+)$/);
  if (!m) return;
  acc.push({
    id: `EC-${acc.length + 1}`,
    metric: m[1].trim(),
    threshold: m[2].trim(),
    sourceDoc: 'TQCD',
  });
}

function extractFromSection(section: Section, acc: ExitCriteriaItem[]): void {
  for (const line of section.body.split('\n')) {
    extractTableRow(line, acc);
    extractMetricLine(line, acc);
  }
}

function defaultExitCriteria(): ExitCriteriaItem[] {
  const defaults = [
    { metric: 'Line coverage', threshold: '100%' },
    { metric: 'Branch coverage', threshold: '100%' },
    { metric: 'Function coverage', threshold: '100%' },
    { metric: 'Statement coverage', threshold: '100%' },
    { metric: 'Mutation score', threshold: '≥80%' },
  ];
  return defaults.map((d, i) => ({ id: `EC-${i + 1}`, ...d, sourceDoc: 'TQCD' }));
}

function extractExitCriteria(bundle: BundleAST): Result<ExitCriteriaItem[], ExcellenceSpecError> {
  const exitCriteria: ExitCriteriaItem[] = [];
  let foundSection3 = false;

  for (const section of bundle.tqcd.sections) {
    if (isExitCriteriaSection(section) && section.body.trim().length > 0) {
      if (section.id.toLowerCase().includes('3') || section.title.toLowerCase().includes('coverage') || section.title.toLowerCase().includes('exit')) {
        foundSection3 = true;
      }
      extractFromSection(section, exitCriteria);
    }
  }

  // Sections present but none match §3 pattern — genuine TQCD_MISSING_SECTION_3
  if (bundle.tqcd.sections.length > 0 && !foundSection3 && exitCriteria.length === 0) {
    return {
      ok: false,
      error: {
        kind: 'tqcd_missing_section_3',
        message: 'TQCD document has sections but none match §3 coverage/exit-criteria pattern',
      },
    };
  }

  // No sections (minimal fixture) → use fallback defaults
  if (exitCriteria.length === 0) {
    exitCriteria.push(...defaultExitCriteria());
  }

  if (exitCriteria.length === 0) {
    return {
      ok: false,
      error: { kind: 'no_exit_criteria_found', message: 'No exit criteria could be extracted from TQCD' },
    };
  }

  return { ok: true, value: exitCriteria };
}

// ─── Excellent end state ──────────────────────────────────────────────────────

function firstNonEmptyLine(text: string): string | undefined {
  return text.split('\n').find((l) => l.trim().length > 0)?.trim();
}

function extractExcellentEndState(bundle: BundleAST): string {
  const tqcdFm = bundle.tqcd.frontmatter;
  if (typeof tqcdFm['description'] === 'string' && tqcdFm['description'].length > 0) {
    return tqcdFm['description'] as string;
  }
  const prdFm = bundle.prd.frontmatter;
  if (typeof prdFm['description'] === 'string' && prdFm['description'].length > 0) {
    return prdFm['description'] as string;
  }
  const tqcdFirst = bundle.tqcd.sections[0];
  if (tqcdFirst?.body.trim().length > 0) {
    const line = firstNonEmptyLine(tqcdFirst.body);
    if (line) return line;
  }
  const prdFirst = bundle.prd.sections[0];
  if (prdFirst?.body.trim().length > 0) {
    const line = firstNonEmptyLine(prdFirst.body);
    if (line) return line;
  }
  return 'An installable Claude Code plugin that enforces D2R plan adherence via non-bypassable hooks';
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Extract an ExcellenceSpec from a parsed BundleAST.
 * Closes gate-22 C-1: extractExcellenceSpec now reads from bundle content, not hardcoded strings.
 *
 * Returns Result<ExcellenceSpec, ExcellenceSpecError>.
 * Error when TQCD has sections but none match §3 pattern (genuine absence, not minimal fixture).
 */
export function extractExcellenceSpec(bundle: BundleAST): Result<ExcellenceSpec, ExcellenceSpecError> {
  const exitCriteriaResult = extractExitCriteria(bundle);
  if (!exitCriteriaResult.ok) {
    return exitCriteriaResult;
  }

  const qaResult = extractQaCriteria(bundle);
  const constraintResult = extractConstraints(bundle);
  const excellentEndState = extractExcellentEndState(bundle);

  const spec: ExcellenceSpec = {
    excellentEndState,
    qaCriteria: qaResult.flat,
    constraints: constraintResult.flat,
    qaCriteriaStructured: qaResult.structured,
    constraintsStructured: constraintResult.structured,
    exitCriteria: exitCriteriaResult.value,
  };

  return { ok: true, value: spec };
}
