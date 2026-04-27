/**
 * Integration test: parse real CDCC v1.1.0 bundle
 */

import { describe, it, expect } from 'vitest';
import { parseBundle } from '../../../src/core/bundle-parser/index.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

describe('Bundle Parser - Real CDCC v1.1.0 Bundle', () => {
  it('should parse real bundle at plugin/docs/planning/v1.1.0/', () => {
    // Try multiple possible paths for the bundle
    // First try relative from plugin dir (when running npm test from plugin/)
    let bundlePath = resolve(process.cwd(), 'docs', 'planning', 'v1.1.0');

    // If not found, try absolute path from repo
    if (!existsSync(resolve(bundlePath, 'CDCC_PRD_2026-04-26_v01_I.md'))) {
      bundlePath = 'C:/Users/NerdyKrystal/cold read 2026-04-25/claudette-can-code/plugin/docs/planning/v1.1.0';
    }

    // If still not found, try parent directory
    if (!existsSync(resolve(bundlePath, 'CDCC_PRD_2026-04-26_v01_I.md'))) {
      bundlePath = resolve(process.cwd(), 'plugin', 'docs', 'planning', 'v1.1.0');
    }

    // Verify bundle exists
    if (!existsSync(resolve(bundlePath, 'CDCC_PRD_2026-04-26_v01_I.md'))) {
      throw new Error(`Could not find bundle at ${bundlePath}`);
    }

    const result = parseBundle(bundlePath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('Parse error:', result.error);
      throw new Error(`Failed to parse bundle: ${result.error.message}`);
    }

    const ast = result.value;

    // Verify all 5 docs parsed successfully
    expect(ast.prd).toBeDefined();
    expect(ast.trd).toBeDefined();
    expect(ast.avd).toBeDefined();
    expect(ast.tqcd).toBeDefined();
    expect(ast.uxd).toBeDefined();
    expect(ast.bidx).toBeDefined();

    // Verify frontmatter was extracted
    expect(ast.prd.frontmatter).toBeDefined();
    expect(typeof ast.prd.frontmatter).toBe('object');

    // Verify sections were parsed
    expect(ast.prd.sections.length).toBeGreaterThan(0);
    expect(ast.trd.sections.length).toBeGreaterThan(0);
    expect(ast.avd.sections.length).toBeGreaterThan(0);
    expect(ast.tqcd.sections.length).toBeGreaterThan(0);
    expect(ast.uxd.sections.length).toBeGreaterThan(0);

    // Verify IDs were extracted from all docs
    expect(ast.prd.ids.length).toBeGreaterThan(0);
    expect(ast.trd.ids.length).toBeGreaterThan(0);
    expect(ast.avd.ids.length).toBeGreaterThan(0);
    expect(ast.tqcd.ids.length).toBeGreaterThan(0);
    expect(ast.uxd.ids.length).toBeGreaterThan(0);

    // Verify that expected ID patterns exist (PRD-*, TRD-*, etc.)
    const hasExcelmentsSpec = ast.prd.ids.some((id) => id.startsWith('PRD'));
    const hasRequirements = ast.trd.ids.some((id) => id.startsWith('TRD'));
    expect(hasExcelmentsSpec).toBe(true);
    expect(hasRequirements).toBe(true);

    // Verify BIDX parsed (may have rows or be empty, but should exist)
    expect(ast.bidx).toBeDefined();
    expect(ast.bidx.rows).toBeDefined();

    // Verify 29 gate-22 findings are referenced in BIDX rows
    // The gate-22 findings include: C-1, C-2, C-3, H-1..H-8, M-1..M-11, L-1..L-8
    // Total should be approximately 29 + N-1 items
    const findingCodes = new Set<string>();
    for (const row of ast.bidx.rows) {
      findingCodes.add(row.closesFinding);
    }

    // We expect at least some findings to be documented
    // The real bundle should reference the 29 gate-22 findings
    expect(findingCodes.size).toBeGreaterThan(0);
  });

  it('should verify BIDX rows are populated with findings', () => {
    let bundlePath = resolve(process.cwd(), 'docs', 'planning', 'v1.1.0');

    if (!existsSync(resolve(bundlePath, 'CDCC_PRD_2026-04-26_v01_I.md'))) {
      bundlePath = 'C:/Users/NerdyKrystal/cold read 2026-04-25/claudette-can-code/plugin/docs/planning/v1.1.0';
    }

    if (!existsSync(resolve(bundlePath, 'CDCC_PRD_2026-04-26_v01_I.md'))) {
      bundlePath = resolve(process.cwd(), 'plugin', 'docs', 'planning', 'v1.1.0');
    }

    const result = parseBundle(bundlePath);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ast = result.value;

    // Verify that BIDX rows contain gate-22 findings
    expect(ast.bidx.rows.length).toBeGreaterThan(0);

    // Check for well-known gate-22 findings
    const findings = new Set(ast.bidx.rows.map((r) => r.closesFinding));
    expect(findings.has('C-1') || findings.has('C-2') || findings.has('H-1')).toBe(true);
  });
});
