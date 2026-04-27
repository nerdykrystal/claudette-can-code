// Audit Logger — Stage 05 rewrite. FR-015, FR-016, SR-002.
// Replaces JSONL append-write with SQLiteAuditStore dispatch.
// Preserves existing external API surface: AuditLogger class + AuditLogEntry type + AuditError type.
// Closes gate-22 C-2 (concurrent writes), H-5 (readFileSync), L-1 (dynamic imports), L-4 (rotation), L-7 (schema enum).

import { join } from 'node:path';
import Ajv from 'ajv';
import type { Result } from '../types/index.js';
import { SQLiteAuditStore } from './sqlite-store.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ajv = new (Ajv as any)({ validateFormats: false });

// Re-export HookId from shared types for backward compatibility
export type HookId = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'plan_generated' | 'dry_run' | 'audit_query';
export type Decision = 'allow' | 'block' | 'halt';

export interface AuditLogEntry {
  ts: string;
  hookId: HookId;
  stage: string | null;
  decision: Decision;
  rationale: string;
  payload: Record<string, unknown>;
}

export interface AuditError { code: 'WRITE_FAIL' | 'SCHEMA_INVALID'; detail: string }

// JSON Schema for validation — hookId is free-text-compatible (event_kind in sqlite);
// Closes L-7: no enum restriction; existing hookIds still validated by enum for backward compat.
const auditEntrySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://martinez.methods/cdcc/schemas/audit-entry.schema.json',
  title: 'AuditEntry',
  description: 'Single entry in the CDCC append-only audit log',
  type: 'object',
  required: ['ts', 'hookId', 'stage', 'decision', 'rationale', 'payload'],
  additionalProperties: false,
  properties: {
    ts: { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp' },
    hookId: {
      type: 'string',
      // L-7 closed: no enum here — event_kind in sqlite is free-text; future H6+ accepted
      minLength: 1,
    },
    stage: { type: ['string', 'null'], description: 'Stage ID or null for plan-level events' },
    decision: { type: 'string', enum: ['allow', 'block', 'halt'] },
    rationale: { type: 'string', minLength: 1, description: 'Explanation of decision' },
    payload: { type: 'object', description: 'Hook-specific data' },
  },
};

const validateEntry = ajv.compile(auditEntrySchema);

export class AuditLogger {
  private store: SQLiteAuditStore;

  constructor(public readonly logDir: string) {
    const dbPath = join(logDir, 'audit.sqlite');
    this.store = new SQLiteAuditStore({ dbPath });
  }

  /**
   * Log an audit entry to the sqlite store at <logDir>/audit.sqlite.
   * Validates entry against schema, appends via SQLiteAuditStore (WAL-mode; concurrent-write safe).
   * Returns ok=true on success or AuditError on failure.
   */
  async log(entry: AuditLogEntry): Promise<Result<void, AuditError>> {
    // Validate entry against schema
    const valid = validateEntry(entry);
    if (!valid) {
      return {
        ok: false,
        error: {
          code: 'SCHEMA_INVALID',
          detail: `Validation failed: ${ajv.errorsText(validateEntry.errors)}`,
        },
      };
    }

    const result = this.store.appendEvent(
      entry.hookId,
      {
        ts: entry.ts,
        stage: entry.stage,
        decision: entry.decision,
        rationale: entry.rationale,
        payload: entry.payload,
      },
      { ts: entry.ts },
    );

    if (!result.ok) {
      return { ok: false, error: { code: 'WRITE_FAIL', detail: result.error.message } };
    }

    return { ok: true, value: undefined };
  }

  /**
   * Query audit log entries with optional filtering.
   * Streams from sqlite via .iterate() (no readFileSync; closes gate-22 H-5).
   * Returns array of AuditLogEntry for backward-compatible API.
   */
  async query(filter?: { hookId?: HookId; stage?: string; since?: string }): Promise<AuditLogEntry[]> {
    const results: AuditLogEntry[] = [];

    try {
      const iter = this.store.queryEvents({
        since: filter?.since,
        kind: filter?.hookId,
      });

      for (const row of iter) {
        const entry = this.parseRow(row);
        if (entry === null) continue;
        // Apply stage filter (not expressible directly in SQL query via queryEvents)
        if (filter?.stage && entry.stage !== filter.stage) continue;
        results.push(entry);
      }
    } catch {
      // Return empty array if read fails
    }

    return results;
  }

  /** Parse a single DB row back into an AuditLogEntry; returns null for malformed rows. */
  private parseRow(row: import('./sqlite-store.js').AuditEvent): AuditLogEntry | null {
    try {
      const parsed = JSON.parse(row.payload_json) as Record<string, unknown>;
      return {
        ts: typeof parsed['ts'] === 'string' ? parsed['ts'] : row.ts,
        hookId: row.event_kind as HookId,
        stage: typeof parsed['stage'] === 'string' ? parsed['stage'] : null,
        decision: typeof parsed['decision'] === 'string' ? parsed['decision'] as Decision : 'allow',
        rationale: typeof parsed['rationale'] === 'string' ? parsed['rationale'] : '',
        payload: (typeof parsed['payload'] === 'object' && parsed['payload'] !== null)
          ? parsed['payload'] as Record<string, unknown>
          : {},
      };
    } catch {
      return null;
    }
  }

  /**
   * Close the underlying sqlite store.
   * Should be called when the logger is no longer needed to release file locks.
   */
  close(): void {
    this.store.close();
  }
}

// Re-export sqlite store and related types for Stage 05 consumers
export { SQLiteAuditStore } from './sqlite-store.js';
export type { AuditWriteError, AuditEvent, SQLiteStoreOptions, AppendEventOptions } from './sqlite-store.js';
export { redactPayload, DEFAULT_RULES } from './redaction.js';
export type { RedactionRule, RedactionResult } from './redaction.js';
export { migrateJsonlToSqlite } from './migrate-jsonl.js';
export type { MigrationStats, MigrationError } from './migrate-jsonl.js';
export { SCHEMA_DDL, PRAGMAS } from './schema.js';
