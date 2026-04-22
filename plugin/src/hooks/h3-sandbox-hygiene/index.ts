// Stage 04 (Haiku) will implement per d2r-plan.md Stage 04 section.
// H3 — PreToolUse hook. Audits worktree against plan allowlist; halts or removes disallowed resources.
// Block exit code: 1 (halt) or file removed per plan config.
export async function handle(_payload: unknown): Promise<{ ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } }> {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 04 deliverable' } };
}
