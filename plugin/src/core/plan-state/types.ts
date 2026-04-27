// Stage 06 — Plan-State types.
// Per §3.06 spec.

export interface PlanState {
  currentStage: string;        // e.g., 'Stage 05'
  assignedModel: 'haiku' | 'sonnet' | 'opus';
  bundleHash: string;
  lastUpdated: string;         // ISO 8601 UTC
  stages?: { id: string; inputManifest?: string[]; assignedModel?: string }[];
  currentStageId?: string;
  [key: string]: unknown;      // allow additional plan-state fields per existing schema
}

export interface PlanStateOptions {
  jsonPath: string;       // e.g., ~/.claude/plugins/cdcc/plan-state.json
  hmacKeyPath: string;    // e.g., ~/.claude/plugins/cdcc/hmac.key (mode 0600)
}
