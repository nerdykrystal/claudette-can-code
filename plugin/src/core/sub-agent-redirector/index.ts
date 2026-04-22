// Sub-Agent Redirector — Stage 04. AD-009.
// Emits redirect directives for Claude Code hook layer to redirect Write/Edit to assigned model.

import type { ModelAssignment } from '../types/index.js';

export interface BlockedToolCall {
  tool: 'Write' | 'Edit';
  args: Record<string, unknown>;
  executingModel: string;
  stageId: string;
}

export interface RedirectDirective {
  action: 'redirect';
  assignedModel: ModelAssignment;
  stageId: string;
  originalTool: string;
  originalArgs: Record<string, unknown>;
  rationale: string;
}

/**
 * Produce a RedirectDirective from a blocked tool call.
 * Pure function — no I/O.
 */
export function redirect(
  blocked: BlockedToolCall,
  assignedModel: ModelAssignment,
  stageId: string,
): RedirectDirective {
  return {
    action: 'redirect',
    assignedModel,
    stageId,
    originalTool: blocked.tool,
    originalArgs: blocked.args,
    rationale: `Assigned model for stage ${stageId} is ${assignedModel}; executing model is ${blocked.executingModel}`,
  };
}

/**
 * Emit a RedirectDirective to stdout as JSON + newline.
 * Claude Code hook harness reads this for Agent-tool invocation.
 */
export function emit(directive: RedirectDirective): void {
  console.log(JSON.stringify(directive));
}
