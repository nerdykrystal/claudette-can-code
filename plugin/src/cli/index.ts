#!/usr/bin/env node
// CLI entry point for the cdcc plugin. Thin wrapper (excluded from coverage).
// Stage 03: generate, dry-run. Stage 04: audit + hook installer.

import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';

const USAGE = `cdcc — Claudette Can Code (Pro) Plugin MVP

Usage:
  cdcc generate <planning-dir>                   Read 4-doc bundle; write plan.json; install hooks
  cdcc dry-run  <planning-dir>                   Validate bundle + preview plan; no disk writes
  cdcc audit   [--since=ISO8601]                 Query audit log
  cdcc migrate-audit-log [--source=<path>]       Migrate JSONL audit logs to sqlite
                         [--target=<path>]
                         [--resume]
  cdcc --help                                    Show this message
`;

// Extract helper functions to reduce main() complexity

/**
 * Resolve a plan from a planningDir.
 * Stage 04c live path: try parseBundle + generateFromBundleAST first.
 * Falls back to legacy consume + generate for old-format bundles (backward compat).
 * Closes gate-22 C-1 / M-2 / M-10 / H-4 on production CLI path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolvePlan(planningDir: string, catalog: any, coreModules: any) {
  const resolvedDir = resolve(planningDir);

  // Live path: try parseBundle (v1.1.0 bundles with CDCC_*_2026-04-26_v01_I.md filenames)
  const parseBundleResult = coreModules.parseBundle(resolvedDir);
  if (parseBundleResult.ok) {
    return coreModules.generateFromBundleAST({ bundle: parseBundleResult.value, catalog });
  }

  // Legacy fallback: consume (PRD*.md / TRD*.md glob, status=PASS required) + generate
  const bundleResult = await coreModules.consume(resolvedDir);
  if (!bundleResult.ok) {
    return { ok: false as const, error: bundleResult.error, _fromConsume: true };
  }
  return coreModules.generateLegacy({ bundle: bundleResult.value, catalog });
}

async function handleGenerate(
  planningDir: string | undefined,
  args: string[],
  claudeRoot: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  coreModules: any,
): Promise<number> {
  if (!planningDir) {
    console.error('Usage: cdcc generate <planning-dir>');
    return 2;
  }

  const catalog = await coreModules.buildCatalog(claudeRoot);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planResult = await resolvePlan(planningDir, catalog, coreModules) as any;
  if (!planResult.ok) {
    // Distinguish bundle-load failure (exit 3) from plan-generation failure (exit 4)
    const exitCode = planResult._fromConsume ? 3 : 4;
    console.error(JSON.stringify({ error: planResult.error }));
    return exitCode;
  }

  const planPath = resolve('plan.json');
  const writeResult = await coreModules.writePlan(planResult.value, planPath);
  if (!writeResult.ok) {
    console.error(JSON.stringify({ error: writeResult.error }));
    return 5;
  }

  const settingsPath = join(claudeRoot, 'settings.json');
  // H-3 systemic closure (Insight B): hardcoded hook list DELETED.
  // installAllHooks() reads plugin.json at runtime — single source of truth.
  const installResult = await coreModules.installAllHooks({
    pluginJsonPath: coreModules.pluginJsonPath,
    settingsJsonPath: settingsPath,
  });
  if (!installResult.ok) {
    console.error(JSON.stringify({ error: installResult.error }));
    return 6;
  }

  console.log(JSON.stringify({
    ok: true,
    plan: planPath,
    settings: settingsPath,
    stages: planResult.value.stages.length,
  }));
  return 0;
}

async function handleDryRun(
  planningDir: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  coreModules: any,
  claudeRoot: string,
): Promise<number> {
  if (!planningDir) {
    console.error('Usage: cdcc dry-run <planning-dir>');
    return 2;
  }

  const catalog = await coreModules.buildCatalog(claudeRoot);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planResult = await resolvePlan(planningDir, catalog, coreModules) as any;
  if (!planResult.ok) {
    const exitCode = planResult._fromConsume ? 3 : 4;
    console.error(JSON.stringify({ error: planResult.error }));
    return exitCode;
  }

  console.log(JSON.stringify({ dryRun: true, plan: planResult.value }, null, 2));
  return 0;
}

async function handleAudit(
  args: string[],
  claudeRoot: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AuditLogger: any,
): Promise<number> {
  let since: string | undefined;
  for (const arg of args) {
    if (arg.startsWith('--since=')) {
      since = arg.slice('--since='.length);
    }
  }

  const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));
  const entries = await auditLogger.query(since ? { since } : undefined);
  console.log(JSON.stringify(entries, null, 2));
  return 0;
}

/**
 * Handle `cdcc migrate-audit-log` subcommand.
 * Migrates JSONL audit logs to sqlite with byte-offset checkpointing.
 * Per §3.05: default source glob <claudeRoot>/cdcc-audit/*.jsonl; default target audit.sqlite.
 */
async function handleMigrateAuditLog(
  args: string[],
  claudeRoot: string,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { migrateJsonlToSqlite } = await import('../core/audit/index.js') as any;
  const fg = await import('fast-glob');
  const { join: pathJoin, resolve: pathResolve } = await import('node:path');

  let sourcePath: string | undefined;
  let targetPath: string | undefined;
  let resume = false;

  for (const arg of args) {
    if (arg.startsWith('--source=')) sourcePath = arg.slice('--source='.length);
    else if (arg.startsWith('--target=')) targetPath = arg.slice('--target='.length);
    else if (arg === '--resume') resume = true;
  }

  const auditDir = pathJoin(claudeRoot, 'cdcc-audit');
  const defaultTarget = pathJoin(auditDir, 'audit.sqlite');
  const resolvedTarget = targetPath ? pathResolve(targetPath) : defaultTarget;

  // Collect JSONL source files
  const sources: string[] = sourcePath
    ? [pathResolve(sourcePath)]
    : await fg.default(pathJoin(auditDir, '*.jsonl').replace(/\\/g, '/'));

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

async function main(): Promise<number> {
  // Parse command and args at runtime (not module load time) to support testing
  const [, , command, ...args] = process.argv;

  // Lazy load core modules to avoid ESM/CommonJS interop issues at load time
  const { consume } = await import('../core/bundle/index.js');
  const { buildCatalog } = await import('../core/catalog/index.js');
  const { generate: generateLegacy, generateFromBundleAST } = await import('../core/plan-generator/index.js');
  const { write: writePlan } = await import('../core/plan-writer/index.js');
  const { installHooks, installAllHooks } = await import('../core/hook-installer/index.js');
  const { AuditLogger } = await import('../core/audit/index.js');
  const { parseBundle } = await import('../core/bundle-parser/index.js');

  const claudeRoot = process.env.CLAUDE_ROOT || join(homedir(), '.claude');

  // plugin.json path: resolve relative to this file's directory (dist/) → plugin root
  const { fileURLToPath } = await import('node:url');
  const pluginJsonPath = join(fileURLToPath(import.meta.url), '..', '..', '..', 'plugin.json');

  // Stage 04c: coreModules includes both live-path (parseBundle + generateFromBundleAST)
  // and legacy fallback (consume + generateLegacy). resolvePlan() picks the live path first.
  // Stage 07: installAllHooks replaces hardcoded hookEntries array (H-3 systemic closure).
  const coreModules = {
    consume,
    buildCatalog,
    generateLegacy,
    generateFromBundleAST,
    parseBundle,
    writePlan,
    installHooks,
    installAllHooks,
    pluginJsonPath,
  };

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE);
      return 0;

    case 'generate':
      return handleGenerate(args[0], args, claudeRoot, coreModules);

    case 'dry-run':
      return handleDryRun(args[0], coreModules, claudeRoot);

    case 'audit':
      return handleAudit(args, claudeRoot, AuditLogger);

    case 'migrate-audit-log':
      return handleMigrateAuditLog(args, claudeRoot);

    default:
      console.error(`cdcc: unknown command "${command ?? '(none)'}".\n\n${USAGE}`);
      return 1;
  }
}

// Export main for testing
export { main };

// Only call main if we're running as CLI (not imported as a module in tests).
// Uses realpathSync to handle npm-link symlinks/junctions on Windows where
// argv[1] is the npm-side path and import.meta.url resolves to the real
// (linked-target) path. Falls back to false on unresolvable paths.
// istanbul ignore next — entry-point IIFE; tested via npm-link CLI dogfood
let isRunningDirectly = false;
try {
  isRunningDirectly = import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
} catch {
  isRunningDirectly = false;
}

if (isRunningDirectly) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(99);
  });
}
