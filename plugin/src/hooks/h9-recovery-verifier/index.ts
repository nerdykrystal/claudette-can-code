// H9 — Recovery Verifier. PostToolUse on Stop event.
// Detection + audit-emission ONLY. Does NOT do git revert. Does NOT spawn Agent.
// Per §3.10, Q4-revised, Insight A-revised, Q7-lock, Q-emergent-1-lock, Q-emergent-2-lock.
// A21 canonical (gate-54 / /asae SKILL.md v06). UNFLAGGED per gate-49.
//
// On violation: emits recovery_events: audit row per /asae v06 schema + exits 2
// with structured stderr naming violation_type + suggested action.
// Parent assistant turn reads stderr and does git revert + redelegation.

import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { SQLiteAuditStore } from '../../core/audit/sqlite-store.js';
import { runVerification } from '../../core/recovery/verifier.js';
import type { RecoveryEvent } from '../../core/recovery/recovery-events-schema.js';

export interface H9Deps {
  stdinReader: () => Promise<string>;
  stderrWrite: (msg: string) => void;
  exit: (code: number) => never;
  auditStore: SQLiteAuditStore;
  /** Current stage ID sourced from hook payload or env */
  getCurrentStageId: () => string;
  /** Working directory for verification commands */
  cwd?: string;
  /** Role manifest path for scope bounds check */
  roleManifestPath?: string;
}

export interface H9Result {
  exitCode: number;
  violated: boolean;
  violations: RecoveryEvent[];
}

/**
 * H9 handler: run verification suite on Stop event.
 * Emits recovery_events: audit rows on violation. Exits 2 to block.
 * Does NOT call git revert. Does NOT spawn Agent.
 */
export async function handleImpl(deps: H9Deps): Promise<H9Result> {
  const currentStage = deps.getCurrentStageId();

  const result = runVerification(currentStage, {
    typecheck: true,
    lint: true,
    coverage: true,
    scopeBoundsCheck: true,
    cwd: deps.cwd ?? process.cwd(),
    roleManifestPath: deps.roleManifestPath,
  });

  if (result.passed) {
    return { exitCode: 0, violated: false, violations: [] };
  }

  // Violation detected — emit audit rows + structured stderr
  const emittedEvents: RecoveryEvent[] = [];

  for (const v of result.violations) {
    const event: RecoveryEvent = {
      stage_id: currentStage,
      violation_type: v.type,
      detected_by: 'hook_tier_9',
      revert_target: v.suggestedRevertTarget,
      redelegation_spec_diff: v.description,
      recovery_pass: false,
    };

    deps.auditStore.appendEvent('recovery_events', event);
    emittedEvents.push(event);
  }

  deps.stderrWrite(
    JSON.stringify({
      rule: 'h9_violations_detected',
      violations: result.violations,
      emitted_events: emittedEvents,
      resolution:
        'H9 detected violations and emitted recovery_events audit rows. The parent assistant turn must now: (1) run `git revert --no-edit <sha>` if revert_target is a hex SHA, or `git restore .` / `git checkout -- .` if revert_target is "working_tree_state"; (2) re-delegate the stage via Agent tool with the updated spec. Per Q7-lock: one retry only — a second violation sets recovery_pass:false and surfaces to the user.',
    }) + '\n',
  );

  // H9 does NOT do git revert. H9 does NOT spawn Agent. Parent orchestrates.
  return { exitCode: 2, violated: true, violations: emittedEvents };
}

/** Default exported function for CLI entry point */
export async function handle(): Promise<void> {
  const claudeRoot = process.env.CLAUDE_ROOT || join(homedir(), '.claude');
  const dbPath = join(claudeRoot, 'cdcc-audit', 'audit.sqlite');
  const auditStore = new SQLiteAuditStore({ dbPath });

  const currentStage =
    process.env.CDCC_CURRENT_STAGE ??
    (() => {
      // Attempt to read from stdin payload
      return 'unknown';
    })();

  const result = await handleImpl({
    stdinReader: async () => {
      let payload = '';
      for await (const chunk of process.stdin) {
        payload += chunk.toString();
      }
      return payload;
    },
    stderrWrite: (msg) => process.stderr.write(msg),
    exit: process.exit,
    auditStore,
    getCurrentStageId: () => currentStage,
    cwd: process.cwd(),
  });

  auditStore.close();
  process.exit(result.exitCode);
}

// Entry point
// istanbul ignore next — CLI entry point only executed when module is invoked directly as script; tested via handleImpl() integration tests
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  handle().catch((err: unknown) => {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      JSON.stringify({
        rule: 'h9_uncaught',
        resolution: 'H9 terminated unexpectedly. Inspect the detail below and verify H9 hook configuration in settings.json.',
        detail,
      }) + '\n',
    );
    process.exit(2);
  });
}
