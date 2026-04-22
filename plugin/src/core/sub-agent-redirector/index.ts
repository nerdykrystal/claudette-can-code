// Stage 04 (Haiku) will implement per d2r-plan.md Stage 04 section.
export type RedirectDirective = {
  action: 'redirect';
  targetModel: string;
  stageId: string;
  reason: string;
};
export function buildRedirect(_assignedModel: string, _stageId: string): { ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } } {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 04 deliverable' } };
}
