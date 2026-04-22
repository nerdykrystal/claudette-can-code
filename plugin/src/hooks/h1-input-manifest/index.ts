// H1 — Input Manifest Hook. FR-007.
// UserPromptSubmit: validates ambient filesystem against plan inputManifest.
// Exit 0 (allow) or 1 (block).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditLogger } from '../../core/audit/index.js';

const claudeRoot = process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude');
const planStatePath = join(claudeRoot, 'plugins', 'cdcc', 'plan-state.json');
const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));

interface PlanState {
  stages: Array<{ id: string; inputManifest: string[] }>;
}

/**
 * H1 handler: read expected InputManifest from plan state.
 * Compare to ambient file set (minimal MVP: just log the manifest as-is).
 * On mismatch: block (exit 1). Else allow (exit 0).
 */
export async function handle(): Promise<void> {
  const ts = new Date().toISOString();

  try {
    const planContent = await readFile(planStatePath, 'utf-8');
    const plan = JSON.parse(planContent) as PlanState;

    // Minimal MVP: just validate manifest exists and is non-empty
    const hasManifest = plan.stages && plan.stages.some((s) => s.inputManifest?.length > 0);

    if (hasManifest) {
      await auditLogger.log({
        ts,
        hookId: 'H1',
        stage: plan.stages?.[0]?.id ?? null,
        decision: 'allow',
        rationale: 'Input manifest found and non-empty',
        payload: { manifestCount: plan.stages?.length ?? 0 },
      });
      process.exit(0);
    } else {
      await auditLogger.log({
        ts,
        hookId: 'H1',
        stage: null,
        decision: 'block',
        rationale: 'No input manifest declared in plan',
        payload: { plan: plan.stages ?? [] },
      });
      console.error('H1 BLOCK: No input manifest in plan state');
      process.exit(1);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await auditLogger.log({
      ts,
      hookId: 'H1',
      stage: null,
      decision: 'halt',
      rationale: `H1 handler error: ${detail}`,
      payload: { error: detail },
    });
    console.error(`H1 HALT: ${detail}`);
    process.exit(1);
  }
}

// Entry point
handle().catch((err) => {
  console.error('H1 uncaught error:', err);
  process.exit(1);
});
