// Shared types for the CDCC plugin. Type-only file — excluded from coverage thresholds.
// Stage 03/04 (Haiku) will expand these as implementation proceeds.

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export type AssignedModel = 'opus-4-7' | 'sonnet-4-6' | 'haiku-4-5';
export type EffortLevel = 'low' | 'medium' | 'high';
export type SpecDepth = 'Shallow' | 'Medium' | 'Deep';
export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type SeverityPolicy = 'strict' | 'standard';
export type GateDomain = 'code' | 'plan' | 'test' | 'audit' | 'general';
export type HookDecision = 'allow' | 'block' | 'halt';
export type HookId = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'plan_generated' | 'dry_run' | 'audit_query';
