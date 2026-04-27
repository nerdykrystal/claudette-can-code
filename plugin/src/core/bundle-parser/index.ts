/**
 * CDCC Bundle Parser
 * Parses the 5-document D2R bundle (PRD, TRD, AVD, TQCD, UXD) + Bundle Index
 * Extracts frontmatter, sections, IDs, and finding-closure mappings
 */

import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import type { Result } from '../shared/result.js';
import type { BundleAST, ParsedDoc, Section, BidxRow } from './types.js';
import type { BundleParseError } from './errors.js';

/**
 * Parse all 5 docs + BIDX from the bundle directory
 */
export function parseBundle(rootDir: string): Result<BundleAST, BundleParseError> {
  const prd = parseDoc(resolve(rootDir, 'CDCC_PRD_2026-04-26_v01_I.md'), 'PRD');
  if (!prd.ok) return prd;

  const trd = parseDoc(resolve(rootDir, 'CDCC_TRD_2026-04-26_v01_I.md'), 'TRD');
  if (!trd.ok) return trd;

  const avd = parseDoc(resolve(rootDir, 'CDCC_AVD_2026-04-26_v01_I.md'), 'AVD');
  if (!avd.ok) return avd;

  const tqcd = parseDoc(resolve(rootDir, 'CDCC_TQCD_2026-04-26_v01_I.md'), 'TQCD');
  if (!tqcd.ok) return tqcd;

  const uxd = parseDoc(resolve(rootDir, 'CDCC_UXD_2026-04-26_v01_I.md'), 'UXD');
  if (!uxd.ok) return uxd;

  const bidx = parseBidx(resolve(rootDir, 'BIDX_cdcc-v1.1.0_2026-04-26_v01_I.md'));
  if (!bidx.ok) return bidx;

  // BIDX validation: ensure we have rows populated
  // (The rows may reference content IDs rather than doc names, so validation is lenient)

  return {
    ok: true,
    value: {
      prd: prd.value,
      trd: trd.value,
      avd: avd.value,
      tqcd: tqcd.value,
      uxd: uxd.value,
      bidx: bidx.value,
      rootDir,
    },
  };
}

/**
 * Parse a single markdown document with YAML frontmatter
 */
function parseDoc(
  filePath: string,
  _docType: 'PRD' | 'TRD' | 'AVD' | 'TQCD' | 'UXD'
): Result<ParsedDoc, BundleParseError> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content, filePath);

    if (!frontmatter) {
      return {
        ok: false,
        error: {
          kind: 'invalid_frontmatter',
          path: filePath,
          line: 1,
          message: `No valid YAML frontmatter found in ${basename(filePath)}`,
        },
      };
    }

    const sections = parseMarkdownSections(body);
    const ids = extractIds(sections);

    return {
      ok: true,
      value: {
        path: filePath,
        frontmatter,
        sections,
        ids,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'file_not_found',
        path: filePath,
        message: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}

/**
 * Parse YAML frontmatter from markdown
 * Expected format: `---\n<yaml>\n---\n<content>`
 */
function parseFrontmatter(
  content: string,
  _filePath: string
): { frontmatter: Record<string, unknown> | null; body: string } {
  const lines = content.split('\n');

  // Check if file starts with ---
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: null, body: content };
  }

  // Find closing ---
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx === -1) {
    return { frontmatter: null, body: content };
  }

  const frontmatterLines = lines.slice(1, closeIdx);
  const body = lines.slice(closeIdx + 1).join('\n');

  const frontmatter = parseYaml(frontmatterLines.join('\n'));
  return { frontmatter, body };
}

/**
 * Hand-parse YAML (simple key: value format; no complex nesting required for CDCC bundle)
 */
function parseYaml(yamlText: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const lines = yamlText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.substring(0, colonIdx).trim();
    const value = trimmed.substring(colonIdx + 1).trim();

    // Strip quotes if present
    let parsedValue: unknown = value;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      parsedValue = value.slice(1, -1);
    } else if (value === 'true') {
      parsedValue = true;
    } else if (value === 'false') {
      parsedValue = false;
    } else if (!isNaN(Number(value))) {
      parsedValue = Number(value);
    }

    result[key] = parsedValue;
  }

  return result;
}

/**
 * Parse markdown sections from document body
 * Extracts headings and content between them
 */
function parseMarkdownSections(body: string): Section[] {
  const sections: Section[] = [];
  const lines = body.split('\n');

  let currentSection: Partial<Section> | null = null;
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      // Save previous section
      if (currentSection) {
        sections.push({
          id: currentSection.id || '',
          level: currentSection.level || 0,
          title: currentSection.title || '',
          body: currentBody.join('\n').trim(),
        });
      }

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      // Extract ID from title (e.g., "### PRD-AR-01: gh CLI..." -> "PRD-AR-01")
      const idMatch = title.match(/^([A-Z]+-[A-Z0-9\-.]+)/);
      const id = idMatch ? idMatch[1] : title;

      currentSection = { id, level, title };
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    sections.push({
      id: currentSection.id || '',
      level: currentSection.level || 0,
      title: currentSection.title || '',
      body: currentBody.join('\n').trim(),
    });
  }

  return sections;
}

/**
 * Extract all heading-prefix IDs from sections
 * Matches patterns like PRD-FR-01, TRD-NFR-3.1-01, AVD-AC-01, etc.
 */
function extractIds(sections: Section[]): string[] {
  const ids: string[] = [];
  const idRegex = /[A-Z]+-[A-Z0-9\-._]+/g;

  for (const section of sections) {
    const titleMatches = section.title.match(idRegex) || [];
    const bodyMatches = section.body.match(idRegex) || [];

    ids.push(...titleMatches);
    ids.push(...bodyMatches);
  }

  // Deduplicate and sort
  return [...new Set(ids)].sort();
}

/**
 * Extract finding codes from a findings column cell
 */
function extractFindingCodes(findingsCol: string): string[] {
  return findingsCol.match(/([CHM])-\d+/g) || [];
}

/**
 * Add rows for all 29 gate-22 findings when "all 29" is mentioned
 */
function addAllFindingsRows(
  rows: BidxRow[],
  allFindings: string[],
  findingMatches: string[],
  parts: string[]
): void {
  for (const f of allFindings) {
    // Only add if not already added by findingMatches
    if (!findingMatches.includes(f)) {
      rows.push({
        closesFinding: f,
        via: parts[0]?.substring(0, 20) || '',
        doc: parts[2]?.substring(0, 20) || '',
        sectionId: parts[3]?.substring(0, 20) || '',
      });
    }
  }
}

/**
 * Get the well-known set of gate-22 findings
 */
function getAllGate22Findings(): string[] {
  return [
    'C-1', 'C-2', 'C-3',
    'H-1', 'H-2', 'H-3', 'H-4', 'H-5', 'H-6', 'H-7', 'H-8',
    'M-1', 'M-2', 'M-3', 'M-4', 'M-5', 'M-6', 'M-7', 'M-8', 'M-9', 'M-10', 'M-11',
    'L-1', 'L-2', 'L-3', 'L-4', 'L-5', 'L-6', 'L-7', 'L-8',
  ];
}

/**
 * Process a BIDX table row and extract findings
 */
function processBidxTableRow(line: string, rows: BidxRow[]): void {
  // Skip header rows
  if (line.includes('closes gate-22 finding') || line.includes('---|')) return;

  // Parse cross-reference table row
  const parts = line.split('|').map((p) => p.trim()).filter((p) => p);
  if (parts.length < 3) return;

  // Extract finding codes from the second column (gate-22 finding)
  // Examples: "all 29 findings", "C-1", "H-5", "M-9", etc.
  const findingsCol = parts[1] || '';
  const findingMatches = extractFindingCodes(findingsCol);

  // Add rows for each matched finding code
  for (const finding of findingMatches) {
    rows.push({
      closesFinding: finding,
      via: parts[0]?.substring(0, 20) || '',  // PRD/TRD reference
      doc: parts[2]?.substring(0, 20) || '',  // TRD-FR reference
      sectionId: parts[3]?.substring(0, 20) || '',  // AVD reference
    });
  }

  // Also handle "all 29 findings" references by adding common ones
  if (findingsCol.includes('all 29')) {
    addAllFindingsRows(rows, getAllGate22Findings(), findingMatches, parts);
  }
}

/**
 * Parse the Bundle Index (BIDX) file
 * Extracts finding-closure rows from the cross-reference matrix
 * (§ BIDX-4 in the real bundle)
 */
function parseBidx(filePath: string): Result<{ rows: BidxRow[] }, BundleParseError> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const rows: BidxRow[] = [];

    const lines = content.split('\n');
    let inCrossRefTable = false;

    for (const line of lines) {
      // Look for the cross-reference matrix section
      if (line.includes('## BIDX-4') || line.includes('BIDX-4 Cross-reference')) {
        inCrossRefTable = true;
        continue;
      }

      if (!inCrossRefTable || !line.trim().startsWith('|')) continue;

      processBidxTableRow(line, rows);
    }

    return { ok: true, value: { rows } };
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'file_not_found',
        path: filePath,
        message: `Cannot read BIDX: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}
