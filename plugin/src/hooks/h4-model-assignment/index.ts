// Stage 04 (Haiku) will implement per d2r-plan.md Stage 04 section.
// H4 — PreToolUse on Write/Edit. Compares executing model to plan stage assignedModel.
// On mismatch: emits Sub-Agent Redirector directive to stdout and exits non-zero (exit code 1).
export async function handle(_payload: unknown): Promise<{ ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } }> {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 04 deliverable' } };
}
