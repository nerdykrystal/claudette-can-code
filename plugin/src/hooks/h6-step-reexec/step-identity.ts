// H6 — Step Identity computation. ASAE Aspect 13 / FM-1.3 elevation.
// Computes (step_id, hash_of_inputs) tuple for a pending tool invocation.
// PAT redaction discipline applied to Bash command strings prior to hashing.

import { createHash } from 'node:crypto';

export type SupportedTool = 'Write' | 'Edit' | 'Bash';

export interface StepIdentity {
  step_id: string;
  hash_of_inputs: string;
}

/**
 * PAT redaction patterns. Bounded coverage; documented in handler README.
 *
 * Patterns covered:
 *  - GitHub classic PATs: `ghp_[a-zA-Z0-9]{36}`
 *  - GitHub fine-grained PATs: `github_pat_[a-zA-Z0-9_]+`
 *  - GitHub OAuth tokens: `gho_[a-zA-Z0-9]{36}`
 *  - GitHub server tokens: `ghs_[a-zA-Z0-9]{36}`
 *  - GitHub user tokens: `ghu_[a-zA-Z0-9]{36}`
 *  - Bearer tokens in headers (Authorization: Bearer <opaque>)
 *  - AWS access key id: `AKIA[0-9A-Z]{16}`
 *
 * Out of scope (documented as honest_gap in audit log + README):
 *  - Generic 32+ char hex tokens (high false-positive rate; step_id stability
 *    matters more than over-redaction here).
 *  - Provider-specific patterns beyond the above.
 */
const PAT_PATTERNS: { regex: RegExp; placeholder: string }[] = [
  { regex: /ghp_[a-zA-Z0-9]{36}/g, placeholder: '<REDACTED:GH_PAT>' },
  { regex: /github_pat_[a-zA-Z0-9_]+/g, placeholder: '<REDACTED:GH_FINE_PAT>' },
  { regex: /gho_[a-zA-Z0-9]{36}/g, placeholder: '<REDACTED:GH_OAUTH>' },
  { regex: /ghs_[a-zA-Z0-9]{36}/g, placeholder: '<REDACTED:GH_SERVER>' },
  { regex: /ghu_[a-zA-Z0-9]{36}/g, placeholder: '<REDACTED:GH_USER>' },
  { regex: /Bearer\s+[A-Za-z0-9._\-=+/]{16,}/g, placeholder: 'Bearer <REDACTED:BEARER>' },
  { regex: /AKIA[0-9A-Z]{16}/g, placeholder: '<REDACTED:AWS_KEY_ID>' },
];

/**
 * Apply PAT redaction patterns to a string. Used both for hashing
 * (so two invocations with different PATs but same intent produce the same
 * hash_of_inputs) and for command-signature stability.
 */
export function redactPats(input: string): string {
  let out = input;
  for (const { regex, placeholder } of PAT_PATTERNS) {
    out = out.replace(regex, placeholder);
  }
  return out;
}

/**
 * Normalize a Bash command for step_id derivation.
 *
 * Goals:
 *  - Identify the same logical operation across cosmetic differences
 *    (whitespace, quoting variants).
 *  - Strip ephemeral content (timestamps, random seeds, PATs) so a
 *    legitimate retry of the same step (e.g. CI re-run with fresh
 *    timestamp) is recognized.
 *  - Keep the operation verb and structural argument shape so two
 *    semantically distinct commands do NOT collide.
 *
 * Strategy:
 *  - Redact PATs first (mandatory discipline).
 *  - Strip ISO 8601 timestamps and unix-epoch numeric blobs in -seed/--seed
 *    style flags.
 *  - Collapse internal runs of whitespace.
 *  - Trim.
 *  - Use the first whitespace-delimited token as the verb; full normalized
 *    string forms the canonical signature.
 */
export function normalizeBashCommand(cmd: string): string {
  let out = redactPats(cmd);
  // ISO 8601 timestamps (date or datetime forms)
  out = out.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TS>');
  out = out.replace(/\d{4}-\d{2}-\d{2}/g, '<DATE>');
  // unix-epoch-ish 10+ digit numeric blobs as bare tokens
  out = out.replace(/(?<![A-Za-z0-9])\d{10,}(?![A-Za-z0-9])/g, '<EPOCH>');
  // --seed=<n> / --seed <n> / -seed <n>
  out = out.replace(/(--?seed[= ])[^\s]+/g, '$1<SEED>');
  // Collapse whitespace
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Compute SHA-256 hash of a string, prefixed with `sha256:`.
 */
export function sha256Of(input: string): string {
  const h = createHash('sha256');
  h.update(input, 'utf-8');
  return `sha256:${h.digest('hex')}`;
}

/**
 * Compute the step identity tuple `(step_id, hash_of_inputs)` for a pending
 * Claude Code tool invocation.
 *
 * `step_id` formats:
 *  - Write::<file_path>
 *  - Edit::<file_path>
 *  - Bash::<normalized-command-signature>
 *
 * `hash_of_inputs` is SHA-256 over the structured inputs:
 *  - Write: content (the bytes being written)
 *  - Edit: JSON-encoded {old_string, new_string} pair
 *  - Bash: the full PAT-redacted command string (NOT the normalized form —
 *    redaction applied but other content preserved so semantically distinct
 *    arguments still differ)
 */
export function computeStepIdentity(
  tool: SupportedTool,
  args: Record<string, unknown>,
): StepIdentity {
  if (tool === 'Write') {
    const filePath = String(args.file_path ?? args.filePath ?? '');
    const content = String(args.content ?? '');
    return {
      step_id: `Write::${filePath}`,
      hash_of_inputs: sha256Of(content),
    };
  }
  if (tool === 'Edit') {
    const filePath = String(args.file_path ?? args.filePath ?? '');
    const oldString = String(args.old_string ?? args.oldString ?? '');
    const newString = String(args.new_string ?? args.newString ?? '');
    return {
      step_id: `Edit::${filePath}`,
      hash_of_inputs: sha256Of(JSON.stringify({ old: oldString, new: newString })),
    };
  }
  // Bash
  const command = String(args.command ?? '');
  const normalized = normalizeBashCommand(command);
  return {
    step_id: `Bash::${normalized}`,
    hash_of_inputs: sha256Of(redactPats(command)),
  };
}

/**
 * Predicate: tool is one H6 cares about. Read-only tools (Read/Glob/Grep/etc)
 * are idempotent and out of scope per spec.
 */
export function isSupportedTool(tool: string | undefined): tool is SupportedTool {
  return tool === 'Write' || tool === 'Edit' || tool === 'Bash';
}
