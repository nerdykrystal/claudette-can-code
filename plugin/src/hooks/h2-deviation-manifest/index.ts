// Stage 04 (Haiku) will implement per d2r-plan.md Stage 04 section.
// H2 — Stop hook (BUILD_COMPLETE sentinel). Requires signed DeviationManifest for any detected substitution.
// Block exit code: 1. Remediation: produce deviation-manifest.json before completing the stage.
export async function handle(_payload: unknown): Promise<{ ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } }> {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 04 deliverable' } };
}
