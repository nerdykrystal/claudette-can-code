// H4 — Model Assignment Hook. FR-010.
// PreToolUse on Write/Edit: compares executing model to plan stage assignedModel.
// On mismatch: emits Sub-Agent Redirector directive and exits 1.
// Else: allow (exit 0).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditLogger } from '../../core/audit/index.js';
import { redirect, emit } from '../../core/sub-agent-redirector/index.js';
import type { ModelAssignment } from '../../core/types/index.js';

const claudeRoot = process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude');
const planStatePath = join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json');
const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));

interface PlanState {
  currentStageId?: string;
  stages: Array<{ id: string; assignedModel: ModelAssignment }>;
}

/**
 * H4 handler: read stdin for hook payload with tool, args, executingModel.
 * Read current stage from plan state. Compare executingModel to assignedModel.
 * On mismatch: emit redirect directive and exit 1.
 * Else: exit 0.
 */
export async function handle(): Promise<void> {
  const ts = new Date().toISOString();

  try {
    // Read stdin
    let payload = '';
    for await (const chunk of process.stdin) {
      payload += chunk.toString();
    }

    const hookPayload = JSON.parse(payload);
    const { tool, args, executingModel } = hookPayload as {
      tool?: string;
      args?: Record<string, unknown>;
      executingModel?: string;
    };

    // H4 only applies to Write/Edit
    if (tool !== 'Write' && tool !== 'Edit') {
      await auditLogger.log({
        ts,
        hookId: 'H4',
        stage: null,
        decision: 'allow',
        rationale: `H4 only applies to Write/Edit; tool is ${tool}`,
        payload: { tool },
      });
      process.exit(0);
    }

    // Read plan state
    const planContent = await readFile(planStatePath, 'utf-8');
    const plan = JSON.parse(planContent) as PlanState;

    // Find current stage
    const currentStageId = plan.currentStageId || plan.stages?.[0]?.id;
    const currentStage = plan.stages?.find((s) => s.id === currentStageId);

    if (!currentStage) {
      await auditLogger.log({
        ts,
        hookId: 'H4',
        stage: currentStageId ?? null,
        decision: 'allow',
        rationale: 'No current stage found; allow',
        payload: { currentStageId },
      });
      process.exit(0);
    }

    // Compare models
    if (executingModel === currentStage.assignedModel) {
      await auditLogger.log({
        ts,
        hookId: 'H4',
        stage: currentStage.id,
        decision: 'allow',
        rationale: `Executing model matches assigned model: ${executingModel}`,
        payload: { executingModel, assignedModel: currentStage.assignedModel },
      });
      process.exit(0);
    }

    // Mismatch: emit redirect
    const blocked = {
      tool: tool as 'Write' | 'Edit',
      args: args ?? {},
      executingModel: executingModel ?? 'unknown',
      stageId: currentStage.id,
    };
    const directive = redirect(blocked, currentStage.assignedModel, currentStage.id);
    emit(directive);

    await auditLogger.log({
      ts,
      hookId: 'H4',
      stage: currentStage.id,
      decision: 'block',
      rationale: `Model mismatch: executing ${executingModel} but assigned ${currentStage.assignedModel}`,
      payload: { executingModel, assignedModel: currentStage.assignedModel, directive },
    });
    process.exit(1);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await auditLogger.log({
      ts,
      hookId: 'H4',
      stage: null,
      decision: 'halt',
      rationale: `H4 handler error: ${detail}`,
      payload: { error: detail },
    });
    console.error(`H4 HALT: ${detail}`);
    process.exit(1);
  }
}

// Entry point
handle().catch((err) => {
  console.error('H4 uncaught error:', err);
  process.exit(1);
});
