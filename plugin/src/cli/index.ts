#!/usr/bin/env node
// CLI entry point for the cdcc plugin. Thin wrapper (excluded from coverage).
// Stage 03: generate, dry-run. Stage 04: audit + hook installer.

import { join, resolve } from 'node:path';

const USAGE = `cdcc — Claudette Can Code (Pro) Plugin MVP

Usage:
  cdcc generate <planning-dir>    Read 4-doc bundle; write plan.json; install hooks
  cdcc dry-run  <planning-dir>    Validate bundle + preview plan; no disk writes
  cdcc audit   [--since=ISO8601]  Query audit log
  cdcc --help                     Show this message
`;

// Extract helper functions to reduce main() complexity
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

  const bundleResult = await coreModules.consume(resolve(planningDir));
  if (!bundleResult.ok) {
    console.error(JSON.stringify({ error: bundleResult.error }));
    return 3;
  }

  const catalog = await coreModules.buildCatalog(claudeRoot);
  const planResult = await coreModules.generatePlan({ bundle: bundleResult.value, catalog });
  if (!planResult.ok) {
    console.error(JSON.stringify({ error: planResult.error }));
    return 4;
  }

  const planPath = resolve('plan.json');
  const writeResult = await coreModules.writePlan(planResult.value, planPath);
  if (!writeResult.ok) {
    console.error(JSON.stringify({ error: writeResult.error }));
    return 5;
  }

  const settingsPath = join(claudeRoot, 'settings.json');
  const hookEntries = [
    { id: 'H1' as const, event: 'UserPromptSubmit', handler: 'dist/hooks/h1-input-manifest/index.js' },
    { id: 'H2' as const, event: 'Stop',             handler: 'dist/hooks/h2-deviation-manifest/index.js' },
    { id: 'H3' as const, event: 'PreToolUse',       handler: 'dist/hooks/h3-sandbox-hygiene/index.js' },
    { id: 'H4' as const, event: 'PreToolUse',       handler: 'dist/hooks/h4-model-assignment/index.js' },
    { id: 'H5' as const, event: 'Stop',             handler: 'dist/hooks/h5-gate-result/index.js' },
  ];
  const installResult = await coreModules.installHooks(settingsPath, hookEntries);
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

  const bundleResult = await coreModules.consume(resolve(planningDir));
  if (!bundleResult.ok) {
    console.error(JSON.stringify({ error: bundleResult.error }));
    return 3;
  }

  const catalog = await coreModules.buildCatalog(claudeRoot);
  const planResult = await coreModules.generatePlan({ bundle: bundleResult.value, catalog });
  if (!planResult.ok) {
    console.error(JSON.stringify({ error: planResult.error }));
    return 4;
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

async function main(): Promise<number> {
  // Parse command and args at runtime (not module load time) to support testing
  const [, , command, ...args] = process.argv;

  // Lazy load core modules to avoid ESM/CommonJS interop issues at load time
  const { consume } = await import('../core/bundle/index.js');
  const { buildCatalog } = await import('../core/catalog/index.js');
  const { generate: generatePlan } = await import('../core/plan-generator/index.js');
  const { write: writePlan } = await import('../core/plan-writer/index.js');
  const { installHooks } = await import('../core/hook-installer/index.js');
  const { AuditLogger } = await import('../core/audit/index.js');

  const claudeRoot = process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude');
  const coreModules = { consume, buildCatalog, generatePlan, writePlan, installHooks };

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

    default:
      console.error(`cdcc: unknown command "${command ?? '(none)'}".\n\n${USAGE}`);
      return 1;
  }
}

// Export main for testing
export { main };

// Only call main if we're running as CLI (not imported as a module in tests)
const isRunningDirectly = import.meta.url.includes(process.argv[1].replace(/\\/g, '/')) ||
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1].endsWith('cli/index.js') ||
  process.argv[1].includes('cli/index.ts');

if (isRunningDirectly) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(99);
  });
}
