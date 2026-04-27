// cdcc explain <event_id> — Stage 12.
// Queries audit DB for the given event_id; renders recovery_events markup if present.

import { join } from 'node:path';
import { homedir } from 'node:os';
import { SQLiteAuditStore } from '../../core/audit/sqlite-store.js';
import {
  validateRecoveryEvent,
  VIOLATION_TYPES,
} from '../../core/recovery/recovery-events-schema.js';
import type { RecoveryEvent } from '../../core/recovery/recovery-events-schema.js';

export interface ExplainOptions {
  claudeRoot?: string;
  dbPath?: string;
}

/**
 * Render a recovery_event payload as human-readable text.
 */
export function renderRecoveryEvent(ev: RecoveryEvent): string {
  const recoveryPassLabel = ev.recovery_pass ? 'true (recovered)' : 'false — requires manual review';
  const lines: string[] = [
    '  RECOVERY EVENT',
    `    stage_id:               ${ev.stage_id}`,
    `    violation_type:         ${ev.violation_type}`,
    `    detected_by:            ${ev.detected_by}`,
    `    revert_target:          ${ev.revert_target}`,
    `    recovery_pass:          ${recoveryPassLabel}`,
    `    redelegation_spec_diff: ${ev.redelegation_spec_diff}`,
  ];
  return lines.join('\n');
}

/**
 * Render a raw event payload as multi-line text.
 */
function renderPayload(payloadJson: string): string {
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      // Check if it looks like a recovery_event
      if (
        typeof obj['stage_id'] === 'string' &&
        VIOLATION_TYPES.includes(obj['violation_type'] as RecoveryEvent['violation_type'])
      ) {
        const errors = validateRecoveryEvent(parsed);
        if (errors.length === 0) {
          return renderRecoveryEvent(parsed as RecoveryEvent);
        }
        // Partially valid: show validation errors + raw
        return `  [RECOVERY EVENT — partial validation errors]\n${errors.map((e) => `    - ${e}`).join('\n')}\n  Raw:\n    ${JSON.stringify(parsed, null, 4).split('\n').join('\n    ')}`;
      }
    }
    return `  ${JSON.stringify(parsed, null, 2).split('\n').join('\n  ')}`;
  } catch {
    return `  (payload could not be parsed as JSON) ${payloadJson}`;
  }
}

/**
 * Handle `cdcc explain <event_id>`.
 * Returns exit code: 0=ok, 1=usage, 2=validation, 3=state, 5=I/O.
 */
export async function handleExplain(
  eventIdStr: string | undefined,
  opts: ExplainOptions = {},
): Promise<number> {
  if (!eventIdStr) {
    console.error('Usage: cdcc explain <event_id>');
    return 1;
  }

  const eventId = parseInt(eventIdStr, 10);
  if (isNaN(eventId) || eventId < 1) {
    console.error(`cdcc explain: event_id must be a positive integer, got: ${eventIdStr}`);
    return 2;
  }

  const claudeRoot = opts.claudeRoot ?? join(homedir(), '.claude');
  const dbPath = opts.dbPath ?? join(claudeRoot, 'cdcc-audit', 'audit.sqlite');

  let store: SQLiteAuditStore;
  try {
    store = new SQLiteAuditStore({ dbPath });
  } catch (err) {
    console.error(`cdcc explain: cannot open audit DB at ${dbPath}: ${String(err)}`);
    return 5;
  }

  // Read the matching row.
  // IMPORTANT: do NOT call store.close() inside the for...of loop body — better-sqlite3
  // iterate() keeps its prepared statement open until iteration completes. Closing mid-loop
  // throws "database connection is busy executing a query". Break, then close after.
  let foundRow: { id: number; ts: string; event_kind: string; redaction_count: number; hmac_sig: string | null; payload_json: string } | undefined;

  try {
    for (const row of store.queryEvents({})) {
      if (row.id === eventId) {
        foundRow = row;
        break;  // Stop iteration naturally; do NOT close() here
      }
    }
  } catch (err) {
    try { store.close(); } catch { /* ignore */ }
    console.error(`cdcc explain: I/O error: ${String(err)}`);
    return 5;
  }

  store.close();

  if (!foundRow) {
    console.error(`cdcc explain: event ${eventId} not found in audit DB`);
    return 3;
  }

  console.log(`Audit Event #${foundRow.id}`);
  console.log(`  timestamp:     ${foundRow.ts}`);
  console.log(`  event_kind:    ${foundRow.event_kind}`);
  console.log(`  redacted_fields: ${foundRow.redaction_count}`);
  console.log(`  hmac_sig:      ${foundRow.hmac_sig ?? '(none — HMAC not recorded)'}`);
  console.log('  payload:');
  console.log(renderPayload(foundRow.payload_json));

  return 0;
}
