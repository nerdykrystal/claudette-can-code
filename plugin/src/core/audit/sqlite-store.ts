// SQLiteAuditStore — Stage 05. Closes gate-22 C-2, H-5, L-1, L-4, L-7.
// WAL-mode sqlite store with HMAC signing and redaction at emission.

import Database from 'better-sqlite3';
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Result } from '../types/index.js';
import { SCHEMA_DDL, PRAGMAS } from './schema.js';
import { redactPayload, type RedactionRule } from './redaction.js';

export type AuditWriteError =
  | { kind: 'lockfile_busy'; message: string }
  | { kind: 'wal_checkpoint_failed'; message: string }
  | { kind: 'hmac_verify_failed'; message: string }
  | { kind: 'write_failed'; message: string };

export interface AuditEvent {
  id: number;
  ts: string;
  ts_utc_year: number;
  ts_utc_month: number;
  ts_utc_day: number;
  event_kind: string;
  payload_json: string;
  hmac_sig: string | null;
  redaction_count: number;
}

export interface SQLiteStoreOptions {
  dbPath: string;
  hmacKey?: Buffer;
  /**
   * M-7 closure: Redaction is default-OFF. Pass an explicit redactionRules array
   * (including DEFAULT_RULES if desired) to opt in to redaction at emission time.
   * When undefined or empty array, no redaction is applied (redactionCount=0 for all writes).
   */
  redactionRules?: RedactionRule[];
}

export interface AppendEventOptions {
  /** Override the timestamp used for the row (ISO 8601 UTC). Defaults to now. */
  ts?: string;
}

export class SQLiteAuditStore {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private opts: SQLiteStoreOptions;

  constructor(opts: SQLiteStoreOptions) {
    this.opts = opts;
    // Ensure parent directory exists
    mkdirSync(dirname(opts.dbPath), { recursive: true });

    this.db = new Database(opts.dbPath);

    // Apply pragmas — better-sqlite3 pragma() strips "PRAGMA " and ";" itself
    for (const pragma of PRAGMAS) {
      // Strip "PRAGMA " prefix and run the key=value part
      const body = pragma.replace(/^PRAGMA\s+/i, '').replace(/;$/, '');
      this.db.pragma(body);
    }

    // Apply schema DDL
    this.db.exec(SCHEMA_DDL);

    // Prepare insert statement once (closes gate-22 L-7 — no schema enum; event_kind is free-text)
    this.insertStmt = this.db.prepare(`
      INSERT INTO audit_events
        (ts, ts_utc_year, ts_utc_month, ts_utc_day, event_kind, payload_json, hmac_sig, redaction_count)
      VALUES
        (@ts, @ts_utc_year, @ts_utc_month, @ts_utc_day, @event_kind, @payload_json, @hmac_sig, @redaction_count)
    `);
  }

  /**
   * Append an audit event to the store.
   * Applies redaction then HMAC-signs the redacted payload before insertion.
   * Returns Result<{id: number}, AuditWriteError>.
   */
  appendEvent(kind: string, payload: object, eventOptions?: AppendEventOptions): Result<{ id: number }, AuditWriteError> {
    try {
      const tsDate = eventOptions?.ts ? new Date(eventOptions.ts) : new Date();
      const ts = tsDate.toISOString();
      const ts_utc_year = tsDate.getUTCFullYear();
      const ts_utc_month = tsDate.getUTCMonth() + 1;
      const ts_utc_day = tsDate.getUTCDate();

      // M-7 closure: redaction is default-OFF. Only apply rules when explicitly provided.
      // Without redactionRules in opts, redactionCount=0 for all writes (no-op redactPayload call).
      const rules = this.opts.redactionRules ?? [];
      const { redacted, redactionCount } = redactPayload(payload, rules);
      const payloadJson = JSON.stringify(redacted);

      let hmacSig: string | null = null;
      if (this.opts.hmacKey) {
        hmacSig = createHmac('sha256', this.opts.hmacKey)
          .update(payloadJson)
          .digest('hex');
      }

      const info = this.insertStmt.run({
        ts,
        ts_utc_year,
        ts_utc_month,
        ts_utc_day,
        event_kind: kind,
        payload_json: payloadJson,
        hmac_sig: hmacSig,
        redaction_count: redactionCount,
      });

      return { ok: true, value: { id: info.lastInsertRowid as number } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { kind: 'write_failed', message } };
    }
  }

  /**
   * Query events with optional filtering.
   * Uses better-sqlite3 .iterate() for lazy streaming (closes gate-22 H-5).
   */
  queryEvents(filter: { since?: string; kind?: string; limit?: number } = {}): IterableIterator<AuditEvent> {
    const conditions: string[] = [];
    const params: Record<string, string | number> = {};

    if (filter.since) {
      conditions.push('ts >= @since');
      params['since'] = filter.since;
    }
    if (filter.kind) {
      conditions.push('event_kind = @kind');
      params['kind'] = filter.kind;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = filter.limit != null ? `LIMIT ${filter.limit}` : '';

    const stmt = this.db.prepare<Record<string, string | number>, AuditEvent>(
      `SELECT * FROM audit_events ${where} ORDER BY id ASC ${limitClause}`
    );

    return stmt.iterate(params);
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Manual WAL checkpoint. Call when WAL file exceeds ~100MB.
   */
  checkpointWal(): void {
    this.db.pragma('wal_checkpoint(RESTART)');
  }

  /**
   * Expose the underlying database for advanced use (e.g., transactions in migration).
   * @internal
   */
  getDb(): Database.Database {
    return this.db;
  }
}
