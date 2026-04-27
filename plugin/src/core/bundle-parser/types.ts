/**
 * Type definitions for the CDCC bundle parser
 * Represents parsed documentation bundle (PRD, TRD, AVD, TQCD, UXD) + Bundle Index
 */

export interface BundleAST {
  prd: ParsedDoc;
  trd: ParsedDoc;
  avd: ParsedDoc;
  tqcd: ParsedDoc;
  uxd: ParsedDoc;
  bidx: ParsedBidx;
  rootDir: string;
}

export interface ParsedDoc {
  path: string;
  frontmatter: Record<string, unknown>;
  sections: Section[];  // §-numbered sections
  ids: string[];        // extracted heading-prefix IDs (PRD-FR-NN, TRD-NFR-NN, etc.)
}

export interface Section {
  id: string;           // heading-prefix ID (e.g., 'PRD-1.4.5', 'PRD-AR-01', 'TRD-FR-01')
  level: number;        // markdown heading level (1-6)
  title: string;        // heading text
  body: string;         // section body content
}

export interface ParsedBidx {
  rows: BidxRow[];
}

export interface BidxRow {
  closesFinding: string;  // gate-22 finding code (e.g., 'C-1', 'M-9', 'H-5')
  via: string;            // mechanism that closes it
  doc: string;            // which doc (PRD, TRD, AVD, TQCD, UXD)
  sectionId: string;      // section ID in that doc (e.g., 'AVD-AC-01')
}
