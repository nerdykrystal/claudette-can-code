// Shared types for the CDCC plugin. Type-only file — excluded from coverage thresholds.
// Stage 03 (Haiku) implementation.

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export type ModelAssignment = 'opus-4-7' | 'sonnet-4-6' | 'haiku-4-5';
export type EffortLevel = 'low' | 'medium' | 'high';
export type SpecDepth = 'Shallow' | 'Medium' | 'Deep';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type SeverityPolicy = 'strict' | 'standard';
export type GateDomain = 'code' | 'plan' | 'test' | 'audit' | 'general';
export type HookDecision = 'allow' | 'block' | 'halt';
export type HookId = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'plan_generated' | 'dry_run' | 'audit_query';

export interface GateSpec {
  threshold: number;
  severityPolicy: SeverityPolicy;
  domain: GateDomain;
}

export interface Stage {
  id: string;
  name: string;
  assignedModel: ModelAssignment;
  effortLevel: EffortLevel;
  specDepth: SpecDepth;
  gate: GateSpec;
  inputManifest: string[];
  skillInvocations: string[];
}

export interface BundleRef {
  path: string;
  sha256: string;
}

export interface Plan {
  schemaVersion: string;
  id: string;
  createdAt: string;
  bundle: { prd: BundleRef; trd: BundleRef; avd: BundleRef; tqcd: BundleRef };
  stages: Stage[];
}
