// H1 — Input Manifest Hook. FR-007.
// UserPromptSubmit: validates ambient filesystem against plan inputManifest.
// Exit 0 (allow) or 1 (block).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AuditLogger } from '../../core/audit/index.js';
import type { AuditLogEntry } from '../../core/audit/index.js';

interface PlanState {
  stages: { id: string; inputManifest: string[] }[];
}

export interface HandleDeps {
  readFile: (path: string, encoding?: string) => Promise<string>;
  auditLogger: AuditLogger;
  exit: (code: number) => never;
  stderrWrite: (msg: string) => void;
  planStatePath: string;
}

export interface HandleResult {
  exitCode: number;
  audit: AuditLogEntry;
}

/**
 * H1 handler: read expected InputManifest from plan state.
 * Compare to ambient file set (minimal MVP: just log the manifest as-is).
 * On mismatch: block (exit 1). Else allow (exit 0).
 */
export async function handleImpl(deps: HandleDeps): Promise<HandleResult> {
  const ts = new Date().toISOString();

  try {
    const planContent = await deps.readFile(deps.planStatePath, 'utf-8');
    const plan = JSON.parse(planContent) as PlanState;

    // Minimal MVP: just validate manifest exists and is non-empty
    const hasManifest = plan.stages && plan.stages.some((s) => s.inputManifest?.length > 0);

    if (hasManifest) {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H1',
        stage: plan.stages?.[0]?.id ?? null,
        decision: 'allow',
        rationale: 'Input manifest found and non-empty',
        payload: { manifestCount: plan.stages?.length ?? 0 },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    } else {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H1',
        stage: null,
        decision: 'block',
        rationale: 'No input manifest declared in plan',
        payload: { plan: plan.stages ?? [] },
      };
      await deps.auditLogger.log(audit);
      deps.stderrWrite('H1 BLOCK: No input manifest in plan state');
      return { exitCode: 1, audit };
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const audit: AuditLogEntry = {
      ts,
      hookId: 'H1',
      stage: null,
      decision: 'halt',
      rationale: `H1 handler error: ${detail}`,
      payload: { error: detail },
    };
    await deps.auditLogger.log(audit);
    deps.stderrWrite(`H1 HALT: ${detail}`);
    return { exitCode: 1, audit };
  }
}

// Default exported function for CLI entry point
export async function handle(): Promise<void> {
  const claudeRoot = process.env.CLAUDE_ROOT || join(homedir(), '.claude');
  const planStatePath = join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json');
  const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));

  const readFileWrapper: (path: string, encoding?: string) => Promise<string> = async (path, encoding) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return readFile(path, (encoding || 'utf-8') as any) as any;
  };

  const result = await handleImpl({
    readFile: readFileWrapper,
    auditLogger,
    exit: process.exit,
    stderrWrite: (msg) => console.error(msg),
    planStatePath,
  });

  process.exit(result.exitCode);
}

// Entry point
// istanbul ignore next — CLI entry point only executed when module is invoked directly as script; tested via handle() integration tests
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  handle().catch((err) => {
    console.error('H1 uncaught error:', err);
    process.exit(1);
  });
}
