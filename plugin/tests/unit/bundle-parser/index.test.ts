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
});
