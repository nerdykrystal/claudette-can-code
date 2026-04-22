// Stage 03 (Haiku) will implement per d2r-plan.md Stage 03 section.
// Pure function: (excellenceSpec, constraints) -> orderedStages. Mutation-tested.
export type ExcellenceSpec = { description: string };
export type PlanningConstraints = { availableModels: string[] };
export type OrderedStage = { id: string; name: string };
export function deriveStages(_spec: ExcellenceSpec, _constraints: PlanningConstraints): { ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } } {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 03 deliverable' } };
}
