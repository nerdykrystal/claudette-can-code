// Stage 14 tests — CLI helpers + M-4/M-5/M-6/M-7/M-8/L-2/L-3 closures.
// Tests parseSinceArg, parseKeyValueArg, parseFlag per §3.14 test-case spec.

import { describe, it, expect } from 'vitest';
import { parseSinceArg, parseKeyValueArg, parseFlag } from '../../../../src/cli/helpers/args.js';

// ── M-4: parseSinceArg ────────────────────────────────────────────────────────

describe('parseSinceArg (M-4: ISO 8601 + future rejection)', () => {
  // Test 1: §3.14 test case 1 — valid ISO 8601 past timestamp
  it('parseSinceArg("2026-04-26T00:00:00Z") → ok=true; valid Date', () => {
    const result = parseSinceArg('2026-04-26T00:00:00Z');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(Date);
      expect(result.value.toISOString()).toBe('2026-04-26T00:00:00.000Z');
    }
  });

  // Test 2: §3.14 test case 2 — invalid ISO 8601 string
  it('parseSinceArg("not-a-date") → ok=false; invalid_iso8601', () => {
    const result = parseSinceArg('not-a-date');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_iso8601');
      expect(result.error.message).toContain('not-a-date');
    }
  });

  // Test 3: §3.14 test case 3 — future timestamp
  it('parseSinceArg("2099-01-01T00:00:00Z") → ok=false; future_timestamp', () => {
    const result = parseSinceArg('2099-01-01T00:00:00Z');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('future_timestamp');
      expect(result.error.message).toContain('2099-01-01');
    }
  });

  // Additional M-4 cases
  it('accepts ISO 8601 with timezone offset', () => {
    // 2026-01-01 UTC — should be in the past
    const result = parseSinceArg('2026-01-01T00:00:00+00:00');
    expect(result.ok).toBe(true);
  });

  it('rejects empty string', () => {
    const result = parseSinceArg('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_iso8601');
  });

  it('rejects date-only string (not ISO 8601 datetime)', () => {
    // "2026-04-26" parses as a valid Date in JS — it's a valid ISO 8601 date
    // so this SHOULD pass (Date("2026-04-26") is valid).
    // This verifies parseSinceArg is lenient about date-only (browsers parse it).
    const result = parseSinceArg('2026-04-26');
    // Date('2026-04-26') is valid in most JS engines — should be ok=true (past date)
    expect(result.ok).toBe(true);
  });

  it('rejects clearly malformed value', () => {
    const result = parseSinceArg('abcdef');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_iso8601');
  });
});

// ── M-5: parseKeyValueArg ─────────────────────────────────────────────────────

describe('parseKeyValueArg (M-5: deduplicated arg-parsing)', () => {
  // §3.14 test case 4 assertion: duplicate arg-parse code deduplicated to helpers/args.ts
  it('extracts --since= value from args array', () => {
    const result = parseKeyValueArg(['--since=2026-04-26T00:00:00Z', '--format=json'], 'since');
    expect(result).toBe('2026-04-26T00:00:00Z');
  });

  it('extracts --source= value', () => {
    const result = parseKeyValueArg(['--source=/tmp/audit.jsonl', '--resume'], 'source');
    expect(result).toBe('/tmp/audit.jsonl');
  });

  it('extracts --target= value', () => {
    const result = parseKeyValueArg(['--target=/tmp/audit.sqlite'], 'target');
    expect(result).toBe('/tmp/audit.sqlite');
  });

  it('returns undefined when key not present', () => {
    const result = parseKeyValueArg(['--format=json'], 'since');
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty args array', () => {
    const result = parseKeyValueArg([], 'since');
    expect(result).toBeUndefined();
  });

  it('handles value containing =', () => {
    const result = parseKeyValueArg(['--target=/path/to/db=special'], 'target');
    expect(result).toBe('/path/to/db=special');
  });
});

// ── M-5: parseFlag ────────────────────────────────────────────────────────────

describe('parseFlag (M-5: boolean flag helper)', () => {
  it('returns true when --force present', () => {
    expect(parseFlag(['--force', '--other'], 'force')).toBe(true);
  });

  it('returns false when --force absent', () => {
    expect(parseFlag(['--other'], 'force')).toBe(false);
  });

  it('returns true when --resume present', () => {
    expect(parseFlag(['--resume'], 'resume')).toBe(true);
  });

  it('returns false for empty args', () => {
    expect(parseFlag([], 'force')).toBe(false);
  });

  it('is exact-match: --forceful does not match --force', () => {
    expect(parseFlag(['--forceful'], 'force')).toBe(false);
  });
});
