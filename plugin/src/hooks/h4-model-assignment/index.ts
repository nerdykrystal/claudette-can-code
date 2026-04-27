// H4 — Model Assignment Hook. FR-010.
// PreToolUse on Write/Edit: compares executing model to plan stage assignedModel.
// On mismatch: emits Sub-Agent Redirector directive and exits 2 (fail-closed).
// Else: allow (exit 0).
// Stage 08a: all 5 fail paths exit 2 with structured JSON stderr per PRD-AR-NV-01 + PRD-AR-04.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AuditLogger } from '../../core/audit/index.js';
import { redirect, emit } from '../../core/sub-agent-redirector/index.js';
import { PlanStateStore } from '../../core/plan-state/index.js';
import type { ModelAssignment } from '../../core/types/index.js';
import type { AuditLogEntry } from '../../core/audit/index.js';
import type { PlanState, PlanStateError } from '../../core/plan-state/index.js';

export interface HandleDeps {
  readFile: (path: string, encoding?: string) => Promise<string>;
  stdinReader: () => Promise<string>;
  auditLogger: AuditLogger;
  emit: (directive: object) => void;
  exit: (code: number) => never;
  stderrWrite: (msg: string) => void;
  planStatePath: string;
  hmacKeyPath?: string;
  /**
   * Optional injectable plan-state reader for testing.
   * When provided, bypasses PlanStateStore entirely.
   * Production path always uses PlanStateStore.read().
   */
  planStateReader?: () => PlanStateResult;
}

export interface HandleResult {
  exitCode: number;
  audit: AuditLogEntry;
}

/** Discriminated result for readPlanState — separates structured failures from success. */
type PlanStateResult =
  | { ok: true; value: PlanState }
  | { ok: false; error: PlanStateError };

/**
 * Read plan state with HMAC verify.
 * Returns a discriminated Result — callers must handle all error kinds explicitly.
 * Fail-closed: HMAC failures do NOT fall back to raw read.
 * Uses deps.planStateReader when injected (for testing); PlanStateStore in production.
 */
function readPlanStateResult(deps: HandleDeps): PlanStateResult {
  if (deps.planStateReader) {
    return deps.planStateReader();
  }
  const claudeRoot = process.env.CLAUDE_ROOT || join(homedir(), '.claude');
  const hmacKeyPath = deps.hmacKeyPath ?? join(claudeRoot, 'plugins', 'cdcc', 'hmac.key');
  const planStore = new PlanStateStore({ jsonPath: deps.planStatePath, hmacKeyPath });
  return planStore.read();
}

/** Build structured JSON stderr payload for plan-state errors per PRD-AR-NV-01. */
function buildPlanStateErrorStderr(err: PlanStateError): Record<string, unknown> {
  if (err.kind === 'not_found') {
    return {
      rule: 'h4_plan_state_missing',
      resolution: 'H4 requires plan-state.json to enforce model assignment. Run `cdcc generate <bundle>` to create it, then retry.',
      detected_path: err.path,
    };
  }
  if (err.kind === 'malformed_json') {
    return {
      rule: 'h4_plan_state_malformed',
      resolution: 'H4 found plan-state.json but could not parse it. Run `cdcc generate <bundle>` to regenerate a valid plan-state.json, then retry.',
      detail: err.message,
    };
  }
  // hmac_missing or hmac_mismatch
  return {
    rule: 'h4_hmac_fail',
    resolution: 'H4 HMAC verification failed — plan-state.json may have been tampered with or regenerated without a key. Run `cdcc rebuild-plan-state` to recreate plan-state.json with a valid HMAC signature.',
    detail: err.message,
    kind: err.kind,
  };
}

/** Handle plan-state read errors (paths 2, 3, 4) — emit stderr + audit + return exit 2. */
async function handlePlanStateError(
  ts: string,
  err: PlanStateError,
  deps: HandleDeps,
): Promise<HandleResult> {
  const stderrPayload = buildPlanStateErrorStderr(err);
  deps.stderrWrite(JSON.stringify(stderrPayload) + '\n');
  const audit: AuditLogEntry = {
    ts,
    hookId: 'H4',
    stage: null,
    decision: 'block',
    rationale: `H4 plan-state error: ${err.kind} — ${err.message}`,
    payload: { error: err },
  };
  await deps.auditLogger.log(audit);
  return { exitCode: 2, audit };
}

/** Handle stage-not-found (path 1) — emit stderr + audit + return exit 2. */
async function handleStageNotFound(
  ts: string,
  plan: PlanState,
  currentStageId: string | undefined,
  deps: HandleDeps,
): Promise<HandleResult> {
  const availableStages = plan.stages?.map((s) => s.id) ?? [];
  deps.stderrWrite(
    JSON.stringify({
      rule: 'h4_stage_not_found',
      resolution: 'H4 could not locate the current stage in plan-state.json. Run `cdcc generate <bundle>` to repopulate plan-state.json with a valid currentStageId, then retry.',
      detected_stage: currentStageId ?? null,
      available_stages: availableStages,
    }) + '\n',
  );
  const audit: AuditLogEntry = {
    ts,
    hookId: 'H4',
    stage: currentStageId ?? null,
    decision: 'block',
    rationale: 'No current stage found; fail-closed',
    payload: { currentStageId, availableStages },
  };
  await deps.auditLogger.log(audit);
  return { exitCode: 2, audit };
}

/** Handle model mismatch (path 5) — emit directive + stderr + audit + return exit 2. */
async function handleMismatch(
  ts: string,
  tool: string,
  args: Record<string, unknown> | undefined,
  executingModel: string | undefined,
  currentStage: { id: string; assignedModel?: string },
  deps: HandleDeps,
): Promise<HandleResult> {
  const blocked = {
    tool: tool as 'Write' | 'Edit',
    args: args ?? {},
    executingModel: executingModel ?? 'unknown',
    stageId: currentStage.id,
  };
  const directive = redirect(blocked, currentStage.assignedModel as ModelAssignment, currentStage.id);
  deps.emit(directive);

  deps.stderrWrite(
    JSON.stringify({
      rule: 'h4_model_mismatch',
      resolution: 'H4 blocked a Write/Edit because the executing model does not match the stage assignment. Re-delegate this task to the required_model shown below for this stage.',
      required_model: currentStage.assignedModel,
      actual_model: executingModel ?? 'unknown',
      stage_id: currentStage.id,
    }) + '\n',
  );

  const audit: AuditLogEntry = {
    ts,
    hookId: 'H4',
    stage: currentStage.id,
    decision: 'block',
    rationale: `Model mismatch: executing ${executingModel} but assigned ${currentStage.assignedModel}`,
    payload: { executingModel, assignedModel: currentStage.assignedModel, directive },
  };
  await deps.auditLogger.log(audit);
  return { exitCode: 2, audit };
}

/**
 * H4 handler: read stdin for hook payload with tool, args, executingModel.
 * Read current stage from plan state. Compare executingModel to assignedModel.
 * On mismatch: emit redirect directive and exit 2 (fail-closed).
 * Else: exit 0.
 */
export async function handleImpl(deps: HandleDeps): Promise<HandleResult> {
  const ts = new Date().toISOString();

  try {
    const payload = await deps.stdinReader();
    const hookPayload = JSON.parse(payload);
    const { tool, args, executingModel } = hookPayload as {
      tool?: string;
      args?: Record<string, unknown>;
      executingModel?: string;
    };

    // H4 only applies to Write/Edit
    if (tool !== 'Write' && tool !== 'Edit') {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H4',
        stage: null,
        decision: 'allow',
        rationale: `H4 only applies to Write/Edit; tool is ${tool}`,
        payload: { tool },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    }

    // Paths 2 + 3 + 4: plan-state missing / malformed / HMAC fail — exit 2 (fail-closed)
    const planResult = readPlanStateResult(deps);
    if (!planResult.ok) {
      return await handlePlanStateError(ts, planResult.error, deps);
    }

    const plan = planResult.value;
    const currentStageId = plan.currentStageId || plan.stages?.[0]?.id;
    const currentStage = plan.stages?.find((s) => s.id === currentStageId);

    // Path 1: stage-not-found — exit 2 (fail-closed; closes gate-22 C-3)
    if (!currentStage) {
      return await handleStageNotFound(ts, plan, currentStageId, deps);
    }

    // Model match: allow
    if (executingModel === currentStage.assignedModel) {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H4',
        stage: currentStage.id,
        decision: 'allow',
        rationale: `Executing model matches assigned model: ${executingModel}`,
        payload: { executingModel, assignedModel: currentStage.assignedModel },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    }

    // Path 5: model mismatch — exit 2 (fail-closed)
    return await handleMismatch(ts, tool, args, executingModel, currentStage, deps);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const audit: AuditLogEntry = {
      ts,
      hookId: 'H4',
      stage: null,
      decision: 'halt',
      rationale: `H4 handler error: ${detail}`,
      payload: { error: detail },
    };
    await deps.auditLogger.log(audit);
    deps.stderrWrite(`H4 HALT: ${detail}`);
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
    stdinReader: async () => {
      let payload = '';
      for await (const chunk of process.stdin) {
        payload += chunk.toString();
      }
      return payload;
    },
    auditLogger,
    emit: (directive: object) => emit(directive as ReturnType<typeof redirect>),
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
    console.error('H4 uncaught error:', err);
    process.exit(1);
  });
}
