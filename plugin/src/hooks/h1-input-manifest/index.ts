// Stage 04 (Haiku) will implement per d2r-plan.md Stage 04 section.
// H1 — UserPromptSubmit hook. Validates ambient filesystem against plan inputManifest.
// Block exit code: 1. Remediation: declare undeclared path in planning bundle and re-run cdcc generate.
export async function handle(_payload: unknown): Promise<{ ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } }> {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 04 deliverable' } };
}
