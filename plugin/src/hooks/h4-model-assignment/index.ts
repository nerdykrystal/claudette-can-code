// H4 — Model Assignment Hook. FR-010.
// PreToolUse on Write/Edit: compares executing model to plan stage assignedModel.
// On mismatch: emits Sub-Agent Redirector directive and exits 1.
// Else: allow (exit 0).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditLogger } from '../../core/audit/index.js';
import { redirect, emit } from '../../core/sub-agent-redirector/index.js';
import type { ModelAssignment } from '../../core/types/index.js';
import type { AuditLogEntry } from '../../core/audit/index.js';

interface PlanState {
  currentStageId?: string;
  stages: { id: string; assignedModel: ModelAssignment }[];
}

export interface HandleDeps {
  readFile: (path: string, encoding?: string) => Promise<string>;
  stdinReader: () => Promise<string>;
  auditLogger: AuditLogger;
  emit: (directive: object) => void;
  exit: (code: number) => never;
  stderrWrite: (msg: string) => void;
  planStatePath: string;
}

export interface HandleResult {
  exitCode: number;
  audit: AuditLogEntry;
}

/**
 * H4 handler: read stdin for hook payload with tool, args, executingModel.
 * Read current stage from plan state. Compare executingModel to assignedModel.
 * On mismatch: emit redirect directive and exit 1.
 * Else: exit 0.
 */
export async function handleImpl(deps: HandleDeps): Promise<HandleResult> {
  const ts = new Date().toISOString();

  try {
    // Read stdin
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

    // Read plan state
    const planContent = await deps.readFile(deps.planStatePath, 'utf-8');
    const plan = JSON.parse(planContent) as PlanState;

    // Find current stage
    const currentStageId = plan.currentStageId || plan.stages?.[0]?.id;
    const currentStage = plan.stages?.find((s) => s.id === currentStageId);

    if (!currentStage) {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H4',
        stage: currentStageId ?? null,
        decision: 'allow',
        rationale: 'No current stage found; allow',
        payload: { currentStageId },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    }

    // Compare models
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

    // Mismatch: emit redirect
    const blocked = {
      tool: tool as 'Write' | 'Edit',
      args: args ?? {},
      executingModel: executingModel ?? 'unknown',
      stageId: currentStage.id,
    };
    const directive = redirect(blocked, currentStage.assignedModel, currentStage.id);
    deps.emit(directive);

    const audit: AuditLogEntry = {
      ts,
      hookId: 'H4',
      stage: currentStage.id,
      decision: 'block',
      rationale: `Model mismatch: executing ${executingModel} but assigned ${currentStage.assignedModel}`,
      payload: { executingModel, assignedModel: currentStage.assignedModel, directive },
    };
    await deps.auditLogger.log(audit);
    return { exitCode: 1, audit };
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
  const claudeRoot = process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude');
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

  process.exit(result.exitCode);
}

// Entry point
// istanbul ignore next — CLI entry point only executed when module is invoked directly as script; tested via handle() integration tests
if (import.meta.url === `file://${process.argv[1]}`) {
  handle().catch((err) => {
    console.error('H4 uncaught error:', err);
    process.exit(1);
  });
}
