import { readFile } from 'node:fs/promises';
import { glob } from 'fast-glob';
import { Result } from '../types/index.js';

export type BundleDocKind = 'PRD' | 'TRD' | 'AVD' | 'TQCD';

export interface BundleDoc {
  kind: BundleDocKind;
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface Bundle {
  prd: BundleDoc;
  trd: BundleDoc;
  avd: BundleDoc;
  tqcd: BundleDoc;
}

export type BundleError =
  | { code: 'MISSING_DOC'; detail: string; kind: BundleDocKind }
  | { code: 'NOT_APPROVED'; detail: string; kind: BundleDocKind }
  | { code: 'PARSE_FAIL'; detail: string; path: string };

// Minimal YAML frontmatter parser (key: value pairs, no nesting)
function parseFrontmatter(content: string): Record<string, unknown> {
  const lines = content.split('\n');
  const result: Record<string, unknown> = {};

  // Find opening ---
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) return result;

  // Find closing ---
  let endIdx = -1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    throw new Error('Unclosed YAML frontmatter (no closing ---)');
  }

  // Parse key: value pairs
  for (let i = startIdx + 1; i < endIdx; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();
    result[key] = value;
  }

  return result;
}

async function readBundleDoc(planningDir: string, kind: BundleDocKind): Promise<Result<BundleDoc, BundleError>> {
  const pattern = `${planningDir}/${kind}*.md`;
  const matches = await glob(pattern, { case: false });

  if (matches.length === 0) {
    return { ok: false, error: { code: 'MISSING_DOC', detail: `No ${kind} document found`, kind } };
  }

  const path = matches[0];

  try {
    const content = await readFile(path, 'utf-8');
    let frontmatter: Record<string, unknown>;

    try {
      frontmatter = parseFrontmatter(content);
    } catch (e) {
      return { ok: false, error: { code: 'PARSE_FAIL', detail: `Failed to parse frontmatter: ${String(e)}`, path } };
    }

    // Check approval status
    const status = frontmatter['status'];
    if (status === undefined) {
      return { ok: false, error: { code: 'NOT_APPROVED', detail: `Missing 'status' field in frontmatter`, kind } };
    }

    const statusStr = String(status).toUpperCase();
    if (!statusStr.includes('PASS') && !statusStr.includes('APPROVED')) {
      return {
        ok: false,
        error: { code: 'NOT_APPROVED', detail: `Document status is '${status}', must contain 'PASS' or 'Approved'`, kind },
      };
    }

    return {
      ok: true,
      value: {
        kind,
        path,
        content,
        frontmatter,
      },
    };
  } catch (e) {
    return { ok: false, error: { code: 'PARSE_FAIL', detail: `File read failed: ${String(e)}`, path } };
  }
}

export async function consume(planningDir: string): Promise<Result<Bundle, BundleError>> {
  const docs: Record<string, BundleDoc | null> = {
    PRD: null,
    TRD: null,
    AVD: null,
    TQCD: null,
  };

  for (const kind of ['PRD', 'TRD', 'AVD', 'TQCD'] as const) {
    const result = await readBundleDoc(planningDir, kind);
    if (!result.ok) {
      return result;
    }
    docs[kind] = result.value;
  }

  return {
    ok: true,
    value: {
      prd: docs.PRD!,
      trd: docs.TRD!,
      avd: docs.AVD!,
      tqcd: docs.TQCD!,
    },
  };
}
