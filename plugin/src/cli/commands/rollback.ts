// cdcc rollback <event_id> — Stage 12.
// Resolves the revert_target from recovery_events in the audit DB, then:
//   - hex hash: `git revert --no-edit <sha>`
//   - 'working_tree_state': `git restore --staged .` + `git checkout -- .`
// Per Q-emergent-1-lock spec.
// Uses execFileNoThrow (not exec/execSync) to prevent shell injection.

import { join } from 'node:path';
import { homedir } from 'node:os';
import { SQLiteAuditStore } from '../../core/audit/sqlite-store.js';
import {
  validateRecoveryEvent,
  isValidRevertTarget,
  VIOLATION_TYPES,
} from '../../core/recovery/recovery-events-schema.js';
import type { RecoveryEvent } from '../../core/recovery/recovery-events-schema.js';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';

export interface RollbackOptions {
  claudeRoot?: string;
  dbPath?: string;
  /** Working directory for git commands (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Extract revert_target from a payload_json string.
 * Returns the revert_target if the payload is a valid recovery_event, undefined otherwise.
 */
export function extractRevertTarget(payloadJson: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const obj = parsed as Record<string, unknown>;

  // Must look like a recovery_event
  if (
    typeof obj['stage_id'] !== 'string' ||
    !VIOLATION_TYPES.includes(obj['violation_type'] as RecoveryEvent['violation_type'])
  ) {
    return undefined;
  }

  const errors = validateRecoveryEvent(parsed);
  if (errors.length > 0) return undefined;

  const target = obj['revert_target'];
  if (typeof target !== 'string' || !isValidRevertTarget(target)) return undefined;
  return target;
}

/**
 * Execute the git rollback for a given revert_target.
 * Returns exit code: 0=ok, 6=external command failure.
 */
async function executeGitRollback(revertTarget: string, cwd: string): Promise<number> {
  if (revertTarget === 'working_tree_state') {
    const restoreResult = await execFileNoThrow('git', ['restore', '--staged', '.'], { cwd });
    if (!restoreResult.ok) {
      console.error(`cdcc rollback: git restore --staged failed: ${restoreResult.stderr}`);
      return 6;
    }
    const checkoutResult = await execFileNoThrow('git', ['checkout', '--', '.'], { cwd });
    if (!checkoutResult.ok) {
      console.error(`cdcc rollback: git checkout -- . failed: ${checkoutResult.stderr}`);
      return 6;
    }
    console.log(JSON.stringify({ ok: true, action: 'working_tree_restore', cwd }));
    return 0;
  }

  // Hex commit hash — git revert --no-edit <sha>
  const revertResult = await execFileNoThrow('git', ['revert', '--no-edit', revertTarget], { cwd });
  if (!revertResult.ok) {
    console.error(`cdcc rollback: git revert failed: ${revertResult.stderr}`);
    return 6;
  }
  console.log(JSON.stringify({ ok: true, action: 'git_revert', revert_target: revertTarget, cwd }));
  return 0;
}

/**
 * Handle `cdcc rollback <event_id>`.
 * Returns exit code: 0=ok, 1=usage, 2=validation, 3=state, 5=I/O, 6=external.
 */
export async function handleRollback(
  eventIdStr: string | undefined,
  opts: RollbackOptions = {},
): Promise<number> {
  if (!eventIdStr) {
    console.error('Usage: cdcc rollback <event_id>');
    return 1;
  }

  const eventId = parseInt(eventIdStr, 10);
  if (isNaN(eventId) || eventId < 1) {
    console.error(`cdcc rollback: event_id must be a positive integer, got: ${eventIdStr}`);
    return 2;
  }

  const claudeRoot = opts.claudeRoot ?? join(homedir(), '.claude');
  const dbPath = opts.dbPath ?? join(claudeRoot, 'cdcc-audit', 'audit.sqlite');
  const cwd = opts.cwd ?? process.cwd();

  let store: SQLiteAuditStore;
  try {
    store = new SQLiteAuditStore({ dbPath });
  } catch (err) {
    console.error(`cdcc rollback: cannot open audit DB at ${dbPath}: ${String(err)}`);
    return 5;
  }

  // Read the target row from the DB.
  // IMPORTANT: do NOT call store.close() while iterating — better-sqlite3 iterate() keeps its
  // prepared statement open until iteration completes. Closing mid-loop throws
  // "database connection is busy executing a query". Break first, then close after the loop.
  let revertTarget: string | undefined;
  let eventFound = false;

  try {
    for (const row of store.queryEvents({})) {
      if (row.id === eventId) {
        eventFound = true;
        revertTarget = extractRevertTarget(row.payload_json);
        break;  // Stop iteration; do NOT close() here
      }
    }
  } catch (err) {
    try { store.close(); } catch { /* ignore */ }
    console.error(`cdcc rollback: I/O error reading audit DB: ${String(err)}`);
    return 5;
  }

  store.close();

  if (!eventFound) {
    console.error(`cdcc rollback: event ${eventId} not found in audit DB`);
    return 3;
  }

  if (!revertTarget) {
    console.error(`cdcc rollback: event ${eventId} does not contain a valid recovery_event with revert_target`);
    return 3;
  }

  return executeGitRollback(revertTarget, cwd);
}
