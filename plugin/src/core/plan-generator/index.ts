// Stage 03 (Haiku) will implement per d2r-plan.md Stage 03 section.
export type Plan = { schemaVersion: '0.1.0'; id: string; createdAt: string; bundle: unknown; stages: unknown[] };
export async function generate(_bundle: unknown, _catalog: unknown): Promise<{ ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } }> {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 03 deliverable' } };
}
