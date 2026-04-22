// Stage 04 (Haiku) will implement per d2r-plan.md Stage 04 section.
export type AuditEntry = {
  ts: string;
  hookId: 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'plan_generated' | 'dry_run' | 'audit_query';
  stage: string | null;
  decision: 'allow' | 'block' | 'halt';
  rationale: string;
  payload: Record<string, unknown>;
};
export async function log(_entry: AuditEntry): Promise<{ ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } }> {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 04 deliverable' } };
}
