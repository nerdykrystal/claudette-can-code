// cdcc migrate-audit-log subcommand module — Stage 12.
// Thin re-export: the actual implementation lives in cli/index.ts handleMigrateAuditLog().
// This module exposes a standalone handler for testing + subcommand dispatch.

import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface MigrateOptions {
  claudeRoot?: string;
  source?: string;
  target?: string;
  resume?: boolean;
}

/**
 * Handle `cdcc migrate-audit-log` as a standalone async function.
 * Returns exit code: 0=ok, 1=partial (some files failed), 5=I/O.
 */
export async function handleMigrateAuditLog(
  args: string[],
  opts: MigrateOptions = {},
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { migrateJsonlToSqlite } = await import('../../core/audit/index.js') as any;
  const fg = await import('fast-glob');

  const claudeRoot = opts.claudeRoot ?? join(homedir(), '.claude');

  let sourcePath = opts.source;
  let targetPath = opts.target;
  let resume = opts.resume ?? false;

  // Parse args array (for direct CLI passthrough)
  for (const arg of args) {
    if (arg.startsWith('--source=')) sourcePath = arg.slice('--source='.length);
    else if (arg.startsWith('--target=')) targetPath = arg.slice('--target='.length);
    else if (arg === '--resume') resume = true;
  }

  const auditDir = join(claudeRoot, 'cdcc-audit');
  const defaultTarget = join(auditDir, 'audit.sqlite');
  const resolvedTarget = targetPath ? resolve(targetPath) : defaultTarget;

  // Collect JSONL source files
  const sources: string[] = sourcePath
    ? [resolve(sourcePath)]
    : await fg.default(join(auditDir, '*.jsonl').replace(/\\/g, '/'));

  if (sources.length === 0) {
    console.log(JSON.stringify({ ok: true, message: 'No JSONL source files found', rowsImported: 0 }));
    return 0;
  }

  let totalRows = 0;
  const errors: string[] = [];

  for (const src of sources) {
    const result = await migrateJsonlToSqlite({
      jsonlPath: src,
      dbPath: resolvedTarget,
      resumeFrom: resume ? undefined : 0,
    });
    if (result.ok) {
      totalRows += result.value.rowsImported;
      console.log(JSON.stringify({ source: src, ...result.value }));
    } else {
      errors.push(`${src}: ${result.error.message}`);
      console.error(JSON.stringify({ source: src, error: result.error }));
    }
  }

  if (errors.length > 0) {
    console.error(JSON.stringify({ errors }));
    return 1;
  }

  console.log(JSON.stringify({ ok: true, totalRows, target: resolvedTarget }));
  return 0;
}
