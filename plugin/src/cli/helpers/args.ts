// CLI argument-parsing helpers — Stage 14.
// Closes gate-22 M-4 (input validation on --since) + M-5 (deduplicate arg-parsing logic).
// Provides parseSinceArg, parseKeyValueArg, parseFlag — consumed by cli commands.

import type { Result } from '../../core/types/index.js';
import { compareTimestamps } from '../../core/audit/utc-helpers.js';

// ── Error types ───────────────────────────────────────────────────────────────

export type AuditArgError =
  | { kind: 'invalid_iso8601'; message: string }
  | { kind: 'future_timestamp'; message: string };

// ── parseSinceArg ─────────────────────────────────────────────────────────────

/**
 * M-4 closure: Parse and validate a --since= argument.
 *
 * Validates:
 *   1. Input is a valid ISO 8601 date-time string (parseable by Date).
 *   2. Input is not in the future (paranoia guard).
 *
 * Uses compareTimestamps from utc-helpers (Stage 13) for numeric comparison — not lex compare.
 *
 * @param input - Raw string from --since=<value>
 * @returns ok=true with Date on success; ok=false with AuditArgError on validation failure.
 */
export function parseSinceArg(input: string): Result<Date, AuditArgError> {
  // Attempt ISO 8601 parse
  const d = new Date(input);
  if (isNaN(d.getTime())) {
    return {
      ok: false,
      error: {
        kind: 'invalid_iso8601',
        message: `--since value "${input}" is not a valid ISO 8601 date-time string.`,
      },
    };
  }

  // Reject future timestamps (use numeric comparison via compareTimestamps)
  const now = new Date().toISOString();
  const comparison = compareTimestamps(input, now);
  if (comparison === 1) {
    return {
      ok: false,
      error: {
        kind: 'future_timestamp',
        message: `--since value "${input}" is in the future. Audit log timestamps are always historical.`,
      },
    };
  }

  return { ok: true, value: d };
}

// ── parseKeyValueArg ──────────────────────────────────────────────────────────

/**
 * M-5 closure: Extract a key=value argument from an args array.
 * Deduplicates the repeated `arg.startsWith('--key=') / arg.slice(...)` pattern
 * that was duplicated across handleAudit, handleMigrateAuditLog, and others.
 *
 * @param args - Array of CLI argument strings (e.g. ['--since=2026-01-01', '--format=json'])
 * @param key  - The argument name to extract (e.g. 'since', 'source', 'target')
 * @returns The string value if found, undefined otherwise.
 */
export function parseKeyValueArg(args: string[], key: string): string | undefined {
  const prefix = `--${key}=`;
  for (const arg of args) {
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }
  return undefined;
}

// ── parseFlag ─────────────────────────────────────────────────────────────────

/**
 * M-5 closure: Check for a boolean flag in an args array.
 * Deduplicates `args.includes('--flag')` patterns across commands.
 *
 * @param args - Array of CLI argument strings
 * @param flag - The flag name (without leading --) to look for
 * @returns true if the flag is present, false otherwise.
 */
export function parseFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`);
}
