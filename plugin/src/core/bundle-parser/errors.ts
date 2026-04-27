/**
 * Error types for bundle parsing
 * Discriminated union of specific error conditions
 */

export type BundleParseError =
  | { kind: 'file_not_found'; path: string; message: string }
  | { kind: 'invalid_frontmatter'; path: string; line: number; message: string }
  | { kind: 'missing_section'; doc: string; expectedSection: string; message: string }
  | { kind: 'bidx_orphan_finding'; finding: string; message: string };
