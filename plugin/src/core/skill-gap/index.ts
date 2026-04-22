// Stage 03 (Haiku) will implement per d2r-plan.md Stage 03 section.
export type SkillGap = { missingSkill: string; requiredByStage: string };
export function check(_plan: unknown, _catalog: unknown): { ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } } {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 03 deliverable' } };
}
