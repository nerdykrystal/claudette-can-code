// Stage 03 (Haiku) will implement per d2r-plan.md Stage 03 section.
export type Bundle = { prd: unknown; trd: unknown; avd: unknown; tqcd: unknown };
export async function consume(_planningDir: string): Promise<{ ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } }> {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 03 deliverable' } };
}
