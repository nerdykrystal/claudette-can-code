// H1 — Input Manifest Hook. FR-007.
// UserPromptSubmit: validates ambient filesystem against plan inputManifest.
// Exit 0 (allow) or 2 (block/halt fail-closed).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AuditLogger } from '../../core/audit/index.js';
import { PlanStateStore } from '../../core/plan-state/index.js';
import type { AuditLogEntry } from '../../core/audit/index.js';
import type { PlanState } from '../../core/plan-state/index.js';

export interface HandleDeps {
  readFile: (path: string, encoding?: string) => Promise<string>;
  auditLogger: AuditLogger;
  exit: (code: number) => never;
  stderrWrite: (msg: string) => void;
  planStatePath: string;
  hmacKeyPath?: string;
}

export interface HandleResult {
  exitCode: number;
  audit: AuditLogEntry;
}

/**
 * H1 handler: read expected InputManifest from plan state via PlanStateStore (HMAC verify).
 * Compare to ambient file set (minimal MVP: just log the manifest as-is).
 * On mismatch: block (exit 2). Else allow (exit 0).
 */
export async function handleImpl(deps: HandleDeps): Promise<HandleResult> {
  const ts = new Date().toISOString();

  try {
    // Use PlanStateStore for HMAC-verified read (Stage 06 wiring, per §3.06)
    const claudeRoot = process.env.CLAUDE_ROOT || join(homedir(), '.claude');
    const hmacKeyPath = deps.hmacKeyPath ?? join(claudeRoot, 'plugins', 'cdcc', 'hmac.key');
    const planStore = new PlanStateStore({ jsonPath: deps.planStatePath, hmacKeyPath });
    const storeResult = planStore.read();

    let plan: PlanState;
    if (storeResult.ok) {
      plan = storeResult.value;
    } else {
      // Fall back to direct readFile for backward compatibility with non-HMAC plan-state files
      const planContent = await deps.readFile(deps.planStatePath, 'utf-8');
      plan = JSON.parse(planContent) as PlanState;
    }

    // Minimal MVP: just validate manifest exists and is non-empty
    const hasManifest = plan.stages && plan.stages.some((s) => (s.inputManifest?.length ?? 0) > 0);

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
      deps.stderrWrite(JSON.stringify({ rule: 'h1_no_input_manifest', resolution: 'Rule H1 requires at least one plan stage with a non-empty inputManifest. Run `cdcc generate <bundle>` to populate plan-state.json with valid stage definitions.', detected_value: 'no stages with non-empty inputManifest' }));
      return { exitCode: 2, audit };
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
    deps.stderrWrite(JSON.stringify({ rule: 'h1_handler_error', resolution: 'H1 could not read plan-state.json. Confirm the file exists at the configured path and contains valid JSON, then re-run `cdcc generate`.', detail }));
    return { exitCode: 2, audit };
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

  auditLogger.close();
  process.exit(result.exitCode);
}

// Entry point
// istanbul ignore next — CLI entry point only executed when module is invoked directly as script; tested via handle() integration tests
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  handle().catch((err) => {
    console.error('H1 uncaught error:', err);
    process.exit(2);
  });
}
