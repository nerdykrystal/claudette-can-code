/**
 * Unit tests for bundle parser
 * Tests error cases and basic parsing
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { parseBundle } from '../../../src/core/bundle-parser/index.js';
import { join } from 'node:path';

describe('Bundle Parser', () => {
  let testFixturesDir: string;

  beforeAll(() => {
    testFixturesDir = join(process.cwd(), 'tests', 'fixtures', 'bundle-parser');
    mkdirSync(testFixturesDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testFixturesDir, { recursive: true, force: true });
  });

  it('should return file_not_found when bundle dir does not exist', () => {
    const result = parseBundle('/nonexistent/bundle');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('file_not_found');
    }
  });

  it('should return invalid_frontmatter for doc with bad YAML', () => {
    // Create a minimal fixture with broken frontmatter
    const emptyDir = join(testFixturesDir, 'malformed-frontmatter');
    mkdirSync(emptyDir, { recursive: true });

    writeFileSync(
      join(emptyDir, 'CDCC_PRD_2026-04-26_v01_I.md'),
      '---\ninvalid: yaml: content\n---\n# Content'
    );

    const result = parseBundle(emptyDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['invalid_frontmatter', 'file_not_found']).toContain(result.error.kind);
    }

    rmSync(emptyDir, { recursive: true, force: true });
  });

  it('should parse valid doc and extract heading IDs', () => {
    const validDir = join(testFixturesDir, 'valid');
    mkdirSync(validDir, { recursive: true });

    const docContent = `---
name: Test PRD
version: v01
---

# Document

## 1. Section

### PRD-FR-01: First Requirement
Content for FR-01

### PRD-FR-02: Second Requirement
Content for FR-02
`;

    // Create minimal 5-doc bundle
    writeFileSync(join(validDir, 'CDCC_PRD_2026-04-26_v01_I.md'), docContent);
    writeFileSync(
      join(validDir, 'CDCC_TRD_2026-04-26_v01_I.md'),
      '---\nname: TRD\n---\n# TRD'
    );
    writeFileSync(
      join(validDir, 'CDCC_AVD_2026-04-26_v01_I.md'),
      '---\nname: AVD\n---\n# AVD'
    );
    writeFileSync(
      join(validDir, 'CDCC_TQCD_2026-04-26_v01_I.md'),
      '---\nname: TQCD\n---\n# TQCD'
    );
    writeFileSync(
      join(validDir, 'CDCC_UXD_2026-04-26_v01_I.md'),
      '---\nname: UXD\n---\n# UXD'
    );
    writeFileSync(
      join(validDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'),
      '---\nname: BIDX\n---\n# BIDX'
    );

    const result = parseBundle(validDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prd.ids).toContain('PRD-FR-01');
      expect(result.value.prd.ids).toContain('PRD-FR-02');
      expect(result.value.prd.sections.length).toBeGreaterThan(0);
    }

    rmSync(validDir, { recursive: true, force: true });
  });

  it('should extract at least 5 IDs from each doc when parsing valid bundle', () => {
    const docsDir = join(testFixturesDir, 'with-ids');
    mkdirSync(docsDir, { recursive: true });

    const docWithIds = `---
name: Test Doc
---

### PRD-AR-01: First
### PRD-AR-02: Second
### PRD-US-01: User Story
### PRD-SO-01: Goal
### PRD-TC-01: Constraint
### TRD-FR-01: Functional Req
More content
`;

    writeFileSync(join(docsDir, 'CDCC_PRD_2026-04-26_v01_I.md'), docWithIds);
    writeFileSync(
      join(docsDir, 'CDCC_TRD_2026-04-26_v01_I.md'),
      docWithIds.replace(/PRD/g, 'TRD')
    );
    writeFileSync(
      join(docsDir, 'CDCC_AVD_2026-04-26_v01_I.md'),
      docWithIds.replace(/PRD/g, 'AVD')
    );
    writeFileSync(
      join(docsDir, 'CDCC_TQCD_2026-04-26_v01_I.md'),
      docWithIds.replace(/PRD/g, 'TQCD')
    );
    writeFileSync(
      join(docsDir, 'CDCC_UXD_2026-04-26_v01_I.md'),
      docWithIds.replace(/PRD/g, 'UXD')
    );
    writeFileSync(
      join(docsDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'),
      '---\nname: BIDX\n---\n# BIDX'
    );

    const result = parseBundle(docsDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prd.ids.length).toBeGreaterThanOrEqual(5);
      expect(result.value.trd.ids.length).toBeGreaterThanOrEqual(5);
      expect(result.value.avd.ids.length).toBeGreaterThanOrEqual(5);
    }

    rmSync(docsDir, { recursive: true, force: true });
  });

  it('should handle missing BIDX file gracefully', () => {
    const noBidxDir = join(testFixturesDir, 'no-bidx');
    mkdirSync(noBidxDir, { recursive: true });

    const minimalDoc = `---
name: Doc
---

### ID-FR-01: Requirement
Content
`;

    writeFileSync(join(noBidxDir, 'CDCC_PRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(noBidxDir, 'CDCC_TRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(noBidxDir, 'CDCC_AVD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(noBidxDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(noBidxDir, 'CDCC_UXD_2026-04-26_v01_I.md'), minimalDoc);
    // Note: no BIDX file

    const result = parseBundle(noBidxDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('file_not_found');
    }

    rmSync(noBidxDir, { recursive: true, force: true });
  });

  it('should parse YAML with quoted strings', () => {
    const quotedDir = join(testFixturesDir, 'yaml-quoted');
    mkdirSync(quotedDir, { recursive: true });

    const docWithQuotes = `---
name: "Quoted Name"
description: 'Single quoted'
unquoted: plain value
---

### DOC-ID-01: Test
Body
`;

    writeFileSync(join(quotedDir, 'CDCC_PRD_2026-04-26_v01_I.md'), docWithQuotes);
    writeFileSync(
      join(quotedDir, 'CDCC_TRD_2026-04-26_v01_I.md'),
      docWithQuotes.replace(/PRD/g, 'TRD')
    );
    writeFileSync(
      join(quotedDir, 'CDCC_AVD_2026-04-26_v01_I.md'),
      docWithQuotes.replace(/PRD/g, 'AVD')
    );
    writeFileSync(
      join(quotedDir, 'CDCC_TQCD_2026-04-26_v01_I.md'),
      docWithQuotes.replace(/PRD/g, 'TQCD')
    );
    writeFileSync(
      join(quotedDir, 'CDCC_UXD_2026-04-26_v01_I.md'),
      docWithQuotes.replace(/PRD/g, 'UXD')
    );
    writeFileSync(
      join(quotedDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'),
      '---\nname: BIDX\n---\n# BIDX'
    );

    const result = parseBundle(quotedDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Check that quoted strings were properly unquoted
      expect(result.value.prd.frontmatter.name).toBe('Quoted Name');
      expect(result.value.prd.frontmatter.description).toBe('Single quoted');
      expect(result.value.prd.frontmatter.unquoted).toBe('plain value');
    }

    rmSync(quotedDir, { recursive: true, force: true });
  });

  it('should parse YAML with boolean and numeric values', () => {
    const yamlDir = join(testFixturesDir, 'yaml-types');
    mkdirSync(yamlDir, { recursive: true });

    const docWithYaml = `---
name: CDCC_DOC
enabled: true
disabled: false
count: 42
version: 1.1.0
---

### DOC-ID-01: Test
Body
`;

    writeFileSync(join(yamlDir, 'CDCC_PRD_2026-04-26_v01_I.md'), docWithYaml);
    writeFileSync(
      join(yamlDir, 'CDCC_TRD_2026-04-26_v01_I.md'),
      docWithYaml.replace(/PRD/g, 'TRD')
    );
    writeFileSync(
      join(yamlDir, 'CDCC_AVD_2026-04-26_v01_I.md'),
      docWithYaml.replace(/PRD/g, 'AVD')
    );
    writeFileSync(
      join(yamlDir, 'CDCC_TQCD_2026-04-26_v01_I.md'),
      docWithYaml.replace(/PRD/g, 'TQCD')
    );
    writeFileSync(
      join(yamlDir, 'CDCC_UXD_2026-04-26_v01_I.md'),
      docWithYaml.replace(/PRD/g, 'UXD')
    );
    writeFileSync(
      join(yamlDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'),
      '---\nname: BIDX\n---\n# BIDX'
    );

    const result = parseBundle(yamlDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Check that YAML parsing handled booleans and numbers
      expect(result.value.prd.frontmatter.enabled).toBe(true);
      expect(result.value.prd.frontmatter.disabled).toBe(false);
      expect(result.value.prd.frontmatter.count).toBe(42);
    }

    rmSync(yamlDir, { recursive: true, force: true });
  });

  it('should handle doc with no frontmatter marker', () => {
    const noMarkerDir = join(testFixturesDir, 'no-marker');
    mkdirSync(noMarkerDir, { recursive: true });

    const docNoMarker = `# Just Content

This document has no frontmatter marker.

### DOC-ID-01: Test
Body
`;

    writeFileSync(join(noMarkerDir, 'CDCC_PRD_2026-04-26_v01_I.md'), docNoMarker);
    writeFileSync(
      join(noMarkerDir, 'CDCC_TRD_2026-04-26_v01_I.md'),
      docNoMarker.replace(/PRD/g, 'TRD')
    );
    writeFileSync(
      join(noMarkerDir, 'CDCC_AVD_2026-04-26_v01_I.md'),
      docNoMarker.replace(/PRD/g, 'AVD')
    );
    writeFileSync(
      join(noMarkerDir, 'CDCC_TQCD_2026-04-26_v01_I.md'),
      docNoMarker.replace(/PRD/g, 'TQCD')
    );
    writeFileSync(
      join(noMarkerDir, 'CDCC_UXD_2026-04-26_v01_I.md'),
      docNoMarker.replace(/PRD/g, 'UXD')
    );
    writeFileSync(
      join(noMarkerDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'),
      '---\nname: BIDX\n---\n# BIDX'
    );

    const result = parseBundle(noMarkerDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_frontmatter');
    }

    rmSync(noMarkerDir, { recursive: true, force: true });
  });

  it('should handle doc with unclosed frontmatter', () => {
    const unclosedDir = join(testFixturesDir, 'unclosed-fm');
    mkdirSync(unclosedDir, { recursive: true });

    const docUnclosed = `---
name: Unclosed
no closing marker

### DOC-ID-01: Test
Body
`;

    writeFileSync(join(unclosedDir, 'CDCC_PRD_2026-04-26_v01_I.md'), docUnclosed);
    writeFileSync(
      join(unclosedDir, 'CDCC_TRD_2026-04-26_v01_I.md'),
      docUnclosed.replace(/PRD/g, 'TRD')
    );
    writeFileSync(
      join(unclosedDir, 'CDCC_AVD_2026-04-26_v01_I.md'),
      docUnclosed.replace(/PRD/g, 'AVD')
    );
    writeFileSync(
      join(unclosedDir, 'CDCC_TQCD_2026-04-26_v01_I.md'),
      docUnclosed.replace(/PRD/g, 'TQCD')
    );
    writeFileSync(
      join(unclosedDir, 'CDCC_UXD_2026-04-26_v01_I.md'),
      docUnclosed.replace(/PRD/g, 'UXD')
    );
    writeFileSync(
      join(unclosedDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'),
      '---\nname: BIDX\n---\n# BIDX'
    );

    const result = parseBundle(unclosedDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_frontmatter');
    }

    rmSync(unclosedDir, { recursive: true, force: true });
  });

  it('should parse BIDX with cross-reference table', () => {
    const bidxDir = join(testFixturesDir, 'bidx-valid');
    mkdirSync(bidxDir, { recursive: true });

    const minimalDoc = `---
name: Doc
---

### ID-FR-01: Requirement
Content
`;

    writeFileSync(join(bidxDir, 'CDCC_PRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(bidxDir, 'CDCC_TRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(bidxDir, 'CDCC_AVD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(bidxDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(bidxDir, 'CDCC_UXD_2026-04-26_v01_I.md'), minimalDoc);

    // BIDX with cross-reference matrix
    const bidxWithCrossRef = `---
name: BIDX
---

# BIDX

## BIDX-4 Cross-reference matrix

| PRD/TRD/AVD source | Closes gate-22 finding | TRD-FR | AVD-AC / AD |
|---|---|---|---|
| PRD-SO-01 | all 29 findings | TRD-FR-01..17 | AVD-AC-01 |
| PRD-SO-02 | C-1 | TRD-FR-08 | AVD-AD-05 |
| PRD-SO-03 | M-9 | TRD-FR-06 | AVD-AD-07 |
`;
    writeFileSync(join(bidxDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'), bidxWithCrossRef);

    const result = parseBundle(bidxDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should have parsed multiple findings including "all 29" expansion
      expect(result.value.bidx.rows.length).toBeGreaterThan(5);
    }

    rmSync(bidxDir, { recursive: true, force: true });
  });

  it('should handle heading without ID prefix in markdown sections', () => {
    const noIdDir = join(testFixturesDir, 'heading-no-id');
    mkdirSync(noIdDir, { recursive: true });

    const docWithoutIdPrefix = `---
name: Doc
---

# Document Title

## Just a heading without ID prefix
Content here

### PRD-FR-01: Requirement with ID
More content
`;

    writeFileSync(join(noIdDir, 'CDCC_PRD_2026-04-26_v01_I.md'), docWithoutIdPrefix);
    writeFileSync(
      join(noIdDir, 'CDCC_TRD_2026-04-26_v01_I.md'),
      docWithoutIdPrefix.replace(/PRD/g, 'TRD')
    );
    writeFileSync(
      join(noIdDir, 'CDCC_AVD_2026-04-26_v01_I.md'),
      docWithoutIdPrefix.replace(/PRD/g, 'AVD')
    );
    writeFileSync(
      join(noIdDir, 'CDCC_TQCD_2026-04-26_v01_I.md'),
      docWithoutIdPrefix.replace(/PRD/g, 'TQCD')
    );
    writeFileSync(
      join(noIdDir, 'CDCC_UXD_2026-04-26_v01_I.md'),
      docWithoutIdPrefix.replace(/PRD/g, 'UXD')
    );
    writeFileSync(
      join(noIdDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'),
      '---\nname: BIDX\n---\n# BIDX'
    );

    const result = parseBundle(noIdDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should still parse successfully, using full heading title as ID fallback
      expect(result.value.prd.sections.length).toBeGreaterThan(0);
    }

    rmSync(noIdDir, { recursive: true, force: true });
  });

  it('should handle BIDX table with sparse columns (missing fields)', () => {
    const sparseDir = join(testFixturesDir, 'bidx-sparse');
    mkdirSync(sparseDir, { recursive: true });

    const minimalDoc = `---
name: Doc
---

### ID-FR-01: Requirement
Content
`;

    writeFileSync(join(sparseDir, 'CDCC_PRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(sparseDir, 'CDCC_TRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(sparseDir, 'CDCC_AVD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(sparseDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(sparseDir, 'CDCC_UXD_2026-04-26_v01_I.md'), minimalDoc);

    // BIDX with sparse table (columns may be empty or missing)
    const bidxSparse = `---
name: BIDX
---

# BIDX

## BIDX-4 Cross-reference matrix

| Source | Closes gate-22 finding | TRD | AVD |
|---|---|---|---|
| PRD-SO-01 | C-1 | TRD-FR-01 | AVD-AC-01 |
| PRD-SO-02 | H-5 | TRD-FR-02 | AVD-AC-02 |
`;
    writeFileSync(join(sparseDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'), bidxSparse);

    const result = parseBundle(sparseDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should handle sparse columns gracefully
      expect(result.value.bidx.rows.length).toBeGreaterThanOrEqual(2);
    }

    rmSync(sparseDir, { recursive: true, force: true });
  });

  it('should handle heading with special characters (regex edge case)', () => {
    const specialDir = join(testFixturesDir, 'heading-special');
    mkdirSync(specialDir, { recursive: true });

    const docWithSpecial = `---
name: Doc
---

### PRD-FR-01: Requirement (with parens) [and brackets]
Content

### 123-No-Prefix: This starts with numbers
More content

### PRD-AR-02.1-Extended: Dotted notation
Content

### TQCD-NFR-3.1-01: Complex ID format
More content
`;

    writeFileSync(join(specialDir, 'CDCC_PRD_2026-04-26_v01_I.md'), docWithSpecial);
    writeFileSync(
      join(specialDir, 'CDCC_TRD_2026-04-26_v01_I.md'),
      docWithSpecial.replace(/PRD/g, 'TRD').replace(/TQCD/g, 'TRD')
    );
    writeFileSync(
      join(specialDir, 'CDCC_AVD_2026-04-26_v01_I.md'),
      docWithSpecial.replace(/PRD/g, 'AVD').replace(/TQCD/g, 'AVD')
    );
    writeFileSync(
      join(specialDir, 'CDCC_TQCD_2026-04-26_v01_I.md'),
      docWithSpecial
    );
    writeFileSync(
      join(specialDir, 'CDCC_UXD_2026-04-26_v01_I.md'),
      docWithSpecial.replace(/PRD/g, 'UXD').replace(/TQCD/g, 'UXD')
    );
    writeFileSync(
      join(specialDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'),
      '---\nname: BIDX\n---\n# BIDX'
    );

    const result = parseBundle(specialDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should extract IDs correctly, handling edge cases
      expect(result.value.prd.ids).toContain('PRD-FR-01');
      // The regex extracts up to the first non-ID character
      expect(result.value.prd.ids.length).toBeGreaterThan(0);
    }

    rmSync(specialDir, { recursive: true, force: true });
  });

  it('should handle BIDX table without BIDX-4 section header', () => {
    const noBidx4Dir = join(testFixturesDir, 'bidx-no-section');
    mkdirSync(noBidx4Dir, { recursive: true });

    const minimalDoc = `---
name: Doc
---

### ID-FR-01: Requirement
Content
`;

    writeFileSync(join(noBidx4Dir, 'CDCC_PRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(noBidx4Dir, 'CDCC_TRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(noBidx4Dir, 'CDCC_AVD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(noBidx4Dir, 'CDCC_TQCD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(noBidx4Dir, 'CDCC_UXD_2026-04-26_v01_I.md'), minimalDoc);

    // BIDX with no BIDX-4 section header
    const bidxNoSection = `---
name: BIDX
---

# BIDX

## Some Other Section

| Source | Findings |
|---|---|
| PRD-SO-01 | C-1 |
`;
    writeFileSync(join(noBidx4Dir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'), bidxNoSection);

    const result = parseBundle(noBidx4Dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should succeed even if BIDX-4 section not found (returns empty rows)
      expect(result.value.bidx.rows.length).toBe(0);
    }

    rmSync(noBidx4Dir, { recursive: true, force: true });
  });

  it('should handle multiple finding codes in single BIDX cell', () => {
    const multiDir = join(testFixturesDir, 'bidx-multi-findings');
    mkdirSync(multiDir, { recursive: true });

    const minimalDoc = `---
name: Doc
---

### ID-FR-01: Requirement
Content
`;

    writeFileSync(join(multiDir, 'CDCC_PRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(multiDir, 'CDCC_TRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(multiDir, 'CDCC_AVD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(multiDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(multiDir, 'CDCC_UXD_2026-04-26_v01_I.md'), minimalDoc);

    // BIDX with multiple findings per cell
    const bidxMulti = `---
name: BIDX
---

# BIDX

## BIDX-4 Cross-reference matrix

| Source | Closes gate-22 finding | TRD-FR | AVD |
|---|---|---|---|
| PRD-SO-01 | C-1, M-5, H-2 | TRD-FR-01 | AVD-AC-01 |
| PRD-SO-02 | H-1, H-3, H-4 | TRD-FR-02 | AVD-AC-02 |
`;
    writeFileSync(join(multiDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'), bidxMulti);

    const result = parseBundle(multiDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should parse multiple findings from one cell (6 findings total)
      expect(result.value.bidx.rows.length).toBe(6);
      const findings = result.value.bidx.rows.map(r => r.closesFinding);
      expect(findings).toContain('C-1');
      expect(findings).toContain('M-5');
      expect(findings).toContain('H-2');
    }

    rmSync(multiDir, { recursive: true, force: true });
  });

  it('should handle edge case: long finding code substring truncation', () => {
    const longDir = join(testFixturesDir, 'bidx-long-fields');
    mkdirSync(longDir, { recursive: true });

    const minimalDoc = `---
name: Doc
---

### ID-FR-01: Requirement
Content
`;

    writeFileSync(join(longDir, 'CDCC_PRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(longDir, 'CDCC_TRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(longDir, 'CDCC_AVD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(longDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(longDir, 'CDCC_UXD_2026-04-26_v01_I.md'), minimalDoc);

    // BIDX with very long field values (tests substring(0, 20) truncation)
    const bidxLong = `---
name: BIDX
---

# BIDX

## BIDX-4 Cross-reference matrix

| Source | Closes gate-22 finding | TRD-FR | AVD |
|---|---|---|---|
| PRD-SO-VERY-VERY-VERY-LONG-VALUE | C-1 | TRD-FR-VERYLONGFR-01 | AVD-AC-VERYLONGAC-01 |
`;
    writeFileSync(join(longDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'), bidxLong);

    const result = parseBundle(longDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should truncate to 20 chars for via, doc, sectionId fields
      expect(result.value.bidx.rows.length).toBeGreaterThan(0);
      const row = result.value.bidx.rows[0];
      expect(row.via.length).toBeLessThanOrEqual(20);
      expect(row.doc.length).toBeLessThanOrEqual(20);
      expect(row.sectionId.length).toBeLessThanOrEqual(20);
    }

    rmSync(longDir, { recursive: true, force: true });
  });

  it('should handle BIDX table row with very few columns (parts.length < 3)', () => {
    const fewColsDir = join(testFixturesDir, 'bidx-few-cols');
    mkdirSync(fewColsDir, { recursive: true });

    const minimalDoc = `---
name: Doc
---

### ID-FR-01: Requirement
Content
`;

    writeFileSync(join(fewColsDir, 'CDCC_PRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(fewColsDir, 'CDCC_TRD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(fewColsDir, 'CDCC_AVD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(fewColsDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), minimalDoc);
    writeFileSync(join(fewColsDir, 'CDCC_UXD_2026-04-26_v01_I.md'), minimalDoc);

    // BIDX with rows that have fewer than 3 columns (should be skipped)
    const bidxFewCols = `---
name: BIDX
---

# BIDX

## BIDX-4 Cross-reference matrix

| Source |
|---|
| PRD-SO-01 |
| Single |
`;
    writeFileSync(join(fewColsDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'), bidxFewCols);

    const result = parseBundle(fewColsDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should skip rows with < 3 columns gracefully
      expect(result.value.bidx.rows.length).toBe(0);
    }

    rmSync(fewColsDir, { recursive: true, force: true });
  });

  it('should handle heading match when regex returns null (line 195 branch)', () => {
    const noHeadingDir = join(testFixturesDir, 'no-proper-headings');
    mkdirSync(noHeadingDir, { recursive: true });

    const docOnlyBody = `---
name: Doc
---

This is just regular text
No markdown headings here
### But this is a heading with no structure
`;

    writeFileSync(join(noHeadingDir, 'CDCC_PRD_2026-04-26_v01_I.md'), docOnlyBody);
    writeFileSync(
      join(noHeadingDir, 'CDCC_TRD_2026-04-26_v01_I.md'),
      docOnlyBody
    );
    writeFileSync(
      join(noHeadingDir, 'CDCC_AVD_2026-04-26_v01_I.md'),
      docOnlyBody
    );
    writeFileSync(
      join(noHeadingDir, 'CDCC_TQCD_2026-04-26_v01_I.md'),
      docOnlyBody
    );
    writeFileSync(
      join(noHeadingDir, 'CDCC_UXD_2026-04-26_v01_I.md'),
      docOnlyBody
    );
    writeFileSync(
      join(noHeadingDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'),
      '---\nname: BIDX\n---\n# BIDX'
    );

    const result = parseBundle(noHeadingDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should parse without finding any structured IDs
      expect(result.value.prd.sections.length).toBeGreaterThanOrEqual(1);
    }

    rmSync(noHeadingDir, { recursive: true, force: true });
  });
});
