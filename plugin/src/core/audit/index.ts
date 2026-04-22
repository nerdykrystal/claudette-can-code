// Audit Logger — Stage 04 enforcement. FR-015, FR-016, SR-002.
// Append-only JSONL with fsync for persistence & crash-recovery guarantee.

import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv from 'ajv';
import type { Result } from '../types/index.js';

const ajv = new (Ajv as any)({ validateFormats: false });

export type HookId = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'plan_generated' | 'dry_run' | 'audit_query';
export type Decision = 'allow' | 'block' | 'halt';

export interface AuditLogEntry {
  ts: string;
  hookId: HookId;
  stage: string | null;
  decision: Decision;
  rationale: string;
  payload: Record<string, unknown>;
}

export type AuditError = { code: 'WRITE_FAIL' | 'SCHEMA_INVALID'; detail: string };

// JSON Schema for validation (embedded inline per stage depth requirement).
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
      enum: ['H1', 'H2', 'H3', 'H4', 'H5', 'plan_generated', 'dry_run', 'audit_query'],
    },
    stage: { type: ['string', 'null'], description: 'Stage ID or null for plan-level events' },
    decision: { type: 'string', enum: ['allow', 'block', 'halt'] },
    rationale: { type: 'string', minLength: 1, description: 'Explanation of decision' },
    payload: { type: 'object', description: 'Hook-specific data' },
  },
};

const validateEntry = ajv.compile(auditEntrySchema);

export class AuditLogger {
  constructor(public readonly logDir: string) {}

  /**
   * Log an audit entry to <logDir>/YYYY-MM-DD.jsonl.
   * Validates entry against schema, opens file in append mode, writes JSON line + newline,
   * calls fsync for durability, closes.
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

    try {
      // Ensure logDir exists
      await mkdir(this.logDir, { recursive: true });

      // Extract date from ts; format as YYYY-MM-DD
      const date = new Date(entry.ts);
      const dateStr = date.toISOString().split('T')[0];
      const logPath = join(this.logDir, `${dateStr}.jsonl`);

      // Open file in append mode
      const fd = await open(logPath, 'a');
      try {
        // Write JSON line
        const line = JSON.stringify(entry) + '\n';
        await fd.write(line);

        // Sync for durability
        await fd.sync();
      } finally {
        await fd.close();
      }

      return { ok: true, value: undefined };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'WRITE_FAIL', detail } };
    }
  }

  /**
   * Query audit log entries with optional filtering.
   * Reads all JSONL files in logDir, parses lines, applies filters, returns array.
   * Gracefully skips malformed lines.
   */
  async query(filter?: { hookId?: HookId; stage?: string; since?: string }): Promise<AuditLogEntry[]> {
    try {
      await mkdir(this.logDir, { recursive: true });
    } catch {
      // Directory may not exist yet
    }

    const results: AuditLogEntry[] = [];

    try {
      const { readdirSync, readFileSync } = await import('node:fs');
      const files = readdirSync(this.logDir).filter((f) => f.endsWith('.jsonl')).sort();

      for (const file of files) {
        const path = join(this.logDir, file);
        const content = readFileSync(path, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as AuditLogEntry;

            // Apply filters
            if (filter?.hookId && entry.hookId !== filter.hookId) continue;
            if (filter?.stage && entry.stage !== filter.stage) continue;
            if (filter?.since && entry.ts < filter.since) continue;

            results.push(entry);
          } catch {
            // Skip malformed lines gracefully
          }
        }
      }
    } catch {
      // Return empty array if read fails
    }

    return results;
  }
}
