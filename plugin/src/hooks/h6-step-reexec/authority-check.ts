// H6 — Authority Check. Parses the `Step-Re-Execution:` authorization sentinel.
//
// Per spec, the sentinel form is:
//   Step-Re-Execution: gate-NN reason "<rationale>"
//
// Per spec section "Authority interaction (escape valve)":
//  1. In-context state (preferred) — Claude Code's PreToolUse protocol does
//     not currently expose direct agent working-memory inspection. We resolve
//     this by reading a sidecar authorization file at
//     `<plan_dir>/cdcc-step-reexec-authorization.txt`. This file is authored
//     by the operator (or the agent under explicit operator authority) before
//     the re-executing tool invocation. A single file may contain multiple
//     authorization lines; H6 matches on the gate-NN token and the
//     {step_id, hash_of_inputs} reference if provided.
//  2. Pending commit-msg fallback — out of scope for the PreToolUse layer
//     (commit-msg hook v05 Tier 1c-extended mode-conditional handles that
//     surface; H6 does not duplicate that backstop).
//
// This module exposes only parsing logic; the handler (index.ts) is
// responsible for locating + reading the sidecar file.

export interface StepReExecAuthorization {
  gateRef: string;          // "gate-NN" or "gate-NN-..." token
  rationale: string;         // free-form rationale string
  stepIdMatch?: string;      // optional explicit step_id reference
  hashMatch?: string;        // optional explicit hash_of_inputs reference
  rawLine: string;           // verbatim trailer for audit logging
}

/**
 * Parse a single Step-Re-Execution trailer line.
 *
 * Accepted shapes:
 *   Step-Re-Execution: gate-NN reason "<rationale>"
 *   Step-Re-Execution: gate-NN-<descriptor> reason "<rationale>"
 *   Step-Re-Execution: gate-NN reason "<rationale>" step_id=<id> hash=<hash>
 *
 * Returns null if the line does not match the trailer grammar.
 */
export function parseAuthorizationLine(line: string): StepReExecAuthorization | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('Step-Re-Execution:')) return null;
  const body = trimmed.slice('Step-Re-Execution:'.length).trim();

  // gate-NN[-descriptor] token
  const gateMatch = body.match(/^(gate-\d+(?:-[A-Za-z0-9_-]+)?)/);
  if (!gateMatch) return null;
  const gateRef = gateMatch[1];

  // rationale within double quotes
  const rationaleMatch = body.match(/reason\s+"([^"]*)"/);
  if (!rationaleMatch) return null;
  const rationale = rationaleMatch[1];

  // optional step_id=, hash= references
  const stepMatch = body.match(/step_id=([^\s]+)/);
  const hashMatch = body.match(/hash=([^\s]+)/);

  return {
    gateRef,
    rationale,
    stepIdMatch: stepMatch ? stepMatch[1] : undefined,
    hashMatch: hashMatch ? hashMatch[1] : undefined,
    rawLine: trimmed,
  };
}

/**
 * Parse all Step-Re-Execution trailers from a multi-line authorization file.
 * Lines that do not parse are silently skipped (they may be comments or
 * blank lines).
 */
export function parseAuthorizationFile(content: string): StepReExecAuthorization[] {
  const lines = content.split(/\r?\n/);
  const out: StepReExecAuthorization[] = [];
  for (const line of lines) {
    const parsed = parseAuthorizationLine(line);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Determine if any of the parsed authorizations match the pending step.
 *
 * A match requires:
 *  - At least one authorization is present, AND
 *  - If the authorization specifies step_id= and/or hash=, those values
 *    match the pending step. (If neither is specified, the operator has
 *    granted a broader authorization keyed only on gate-NN; we accept
 *    that as a valid match — it's the operator's explicit authority.)
 */
export function findMatchingAuthorization(
  authorizations: StepReExecAuthorization[],
  pending: { stepId: string; hashOfInputs: string },
): StepReExecAuthorization | null {
  for (const auth of authorizations) {
    const stepOk = auth.stepIdMatch === undefined || auth.stepIdMatch === pending.stepId;
    const hashOk = auth.hashMatch === undefined || auth.hashMatch === pending.hashOfInputs;
    if (stepOk && hashOk) return auth;
  }
  return null;
}
