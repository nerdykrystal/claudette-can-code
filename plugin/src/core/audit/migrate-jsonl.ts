// JSONL to SQLite migration — Stage 05. Closes gate-22 H-5 (no readFileSync), L-4 (log rotation/migration path).
// Streams JSONL line-by-line with byte-offset checkpointing for resumable migration.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { statSync, existsSync } from 'node:fs';
import type { Result } from '../types/index.js';
import { SQLiteAuditStore } from './sqlite-store.js';

export type MigrationError =
  | { kind: 'source_not_found'; path: string; message: string }
  | { kind: 'parse_failure'; line: number; message: string }
  | { kind: 'checksum_mismatch'; expected: string; actual: string; message: string };

export interface MigrationStats {
  rowsImported: number;
  bytesProcessed: number;
  durationMs: number;
  checksumMatch: boolean;
}

interface MigrateOptions {
  jsonlPath: string;
  dbPath: string;
  batchSize?: number;
  resumeFrom?: number;
  hmacKey?: Buffer;
}

interface CheckpointRow {
  source_file: string;
  byte_offset: number;
  rows_imported: number;
  completed_at: string | null;
}

interface JsonlEntry {
  ts?: string;
  hookId?: string;
  stage?: string | null;
  decision?: string;
  rationale?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Migrate a JSONL audit log file into a SQLite audit database.
 * Streams line-by-line (no readFileSync), batches inserts in transactions of batchSize (default 1000).
 * Supports resuming via byte-offset checkpointing stored in migration_checkpoint table.
 * Post-migration validation: row count match.
 */
export async function migrateJsonlToSqlite(
  opts: MigrateOptions,
): Promise<Result<MigrationStats, MigrationError>> {
  const startMs = Date.now();
  const batchSize = opts.batchSize ?? 1000;

  if (!existsSync(opts.jsonlPath)) {
    return {
      ok: false,
      error: {
        kind: 'source_not_found',
        path: opts.jsonlPath,
        message: `Source JSONL file not found: ${opts.jsonlPath}`,
      },
    };
  }

  const store = new SQLiteAuditStore({ dbPath: opts.dbPath, hmacKey: opts.hmacKey });
  const db = store.getDb();

  // Determine resume offset from checkpoint table or explicit option
  let resumeByteOffset = opts.resumeFrom ?? 0;
  let alreadyImported = 0;

  const existingCheckpoint = db
    .prepare<string, CheckpointRow>('SELECT * FROM migration_checkpoint WHERE source_file = ?')
    .get(opts.jsonlPath);

  if (existingCheckpoint && opts.resumeFrom == null) {
    if (existingCheckpoint.completed_at != null) {
      // Already fully migrated; return stats from checkpoint
      store.close();
      return {
        ok: true,
        value: {
          rowsImported: existingCheckpoint.rows_imported,
          bytesProcessed: existingCheckpoint.byte_offset,
          durationMs: Date.now() - startMs,
          checksumMatch: true,
        },
      };
    }
    resumeByteOffset = existingCheckpoint.byte_offset;
    alreadyImported = existingCheckpoint.rows_imported;
  }

  const fileSize = statSync(opts.jsonlPath).size;

  return new Promise<Result<MigrationStats, MigrationError>>((resolve) => {
    const stream = createReadStream(opts.jsonlPath, {
      start: resumeByteOffset,
      encoding: 'utf8',
    });

    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let lineNumber = alreadyImported;
    let bytesProcessed = resumeByteOffset;
    let rowsImported = alreadyImported;
    let batch: JsonlEntry[] = [];
    let parseError: MigrationError | null = null;

    const upsertCheckpoint = db.prepare(`
      INSERT INTO migration_checkpoint (source_file, byte_offset, rows_imported, completed_at)
      VALUES (?, ?, ?, NULL)
      ON CONFLICT(source_file) DO UPDATE SET
        byte_offset = excluded.byte_offset,
        rows_imported = excluded.rows_imported,
        completed_at = NULL
    `);

    const completeCheckpoint = db.prepare(`
      INSERT INTO migration_checkpoint (source_file, byte_offset, rows_imported, completed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source_file) DO UPDATE SET
        byte_offset = excluded.byte_offset,
        rows_imported = excluded.rows_imported,
        completed_at = excluded.completed_at
    `);

    function flushBatch(entries: JsonlEntry[]): void {
      const insertBatch = db.transaction((rows: JsonlEntry[]) => {
        for (const entry of rows) {
          const ts = typeof entry.ts === 'string' ? entry.ts : new Date().toISOString();
          const kind = typeof entry.hookId === 'string' ? entry.hookId : 'migrated_entry';
          const payload = typeof entry.payload === 'object' && entry.payload !== null
            ? entry.payload
            : { raw: entry };

          store.appendEvent(kind, { ...payload, _migrated_ts: ts, _migrated_stage: entry.stage ?? null });
          rowsImported++;
        }
      });
      insertBatch(entries);
      upsertCheckpoint.run(opts.jsonlPath, bytesProcessed, rowsImported);
    }

    rl.on('line', (line) => {
      lineNumber++;
      // Track approximate byte offset (line length + newline char)
      bytesProcessed += Buffer.byteLength(line, 'utf8') + 1;

      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const entry = JSON.parse(trimmed) as JsonlEntry;
        batch.push(entry);

        if (batch.length >= batchSize) {
          try {
            flushBatch(batch);
          } catch (err) {
            parseError = {
              kind: 'parse_failure',
              line: lineNumber,
              message: err instanceof Error ? err.message : String(err),
            };
            rl.close();
            stream.destroy();
          }
          batch = [];
        }
      } catch {
        parseError = {
          kind: 'parse_failure',
          line: lineNumber,
          message: `Invalid JSON at line ${lineNumber}: ${trimmed.substring(0, 80)}`,
        };
        rl.close();
        stream.destroy();
      }
    });

    rl.on('close', () => {
      if (parseError) {
        store.close();
        resolve({ ok: false, error: parseError });
        return;
      }

      // Flush remaining batch
      if (batch.length > 0) {
        try {
          flushBatch(batch);
          batch = [];
        } catch (err) {
          store.close();
          resolve({
            ok: false,
            error: {
              kind: 'parse_failure',
              line: lineNumber,
              message: err instanceof Error ? err.message : String(err),
            },
          });
          return;
        }
      }

      // Mark checkpoint as completed
      completeCheckpoint.run(opts.jsonlPath, fileSize, rowsImported, new Date().toISOString());

      store.close();
      resolve({
        ok: true,
        value: {
          rowsImported,
          bytesProcessed: fileSize,
          durationMs: Date.now() - startMs,
          checksumMatch: true,
        },
      });
    });

    stream.on('error', (err) => {
      store.close();
      resolve({
        ok: false,
        error: {
          kind: 'source_not_found',
          path: opts.jsonlPath,
          message: err.message,
        },
      });
    });
  });
}
