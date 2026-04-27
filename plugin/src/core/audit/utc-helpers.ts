/**
 * UTC Timestamp Helpers — Stage 13
 * Closes gate-22 H-7 (filename derivation timezone shift) + H-8 (lex ISO compare).
 * Provides UTC-safe date string derivation and numeric timestamp comparison.
 */

/**
 * Derive UTC date string 'YYYY-MM-DD' from ISO 8601 timestamp.
 * Handles timezone-shifted inputs correctly by parsing to Date, then extracting UTC components.
 *
 * Examples:
 *   utcDateStringFromTs('2026-04-26T23:00:00+05:00') => '2026-04-26' (UTC 18:00:00Z)
 *   utcDateStringFromTs('2026-04-26T23:00:00-05:00') => '2026-04-27' (UTC 04:00:00Z)
 */
export function utcDateStringFromTs(ts: string): string {
  const date = new Date(ts);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compare two ISO 8601 timestamps numerically (not lexicographically).
 * Parses both strings to Date, extracts millisecond precision, and compares.
 * Handles timezone-shifted forms correctly (e.g., +00:00 vs Z).
 *
 * Returns:
 *   -1 if a < b
 *    0 if a === b
 *    1 if a > b
 */
export function compareTimestamps(a: string, b: string): -1 | 0 | 1 {
  const aMs = new Date(a).getTime();
  const bMs = new Date(b).getTime();

  if (aMs < bMs) return -1;
  if (aMs > bMs) return 1;
  return 0;
}
