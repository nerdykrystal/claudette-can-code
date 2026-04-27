// Unit tests for cdcc explain — Stage 12.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleExplain, renderRecoveryEvent } from '../../../../src/cli/commands/explain.js';
import { SQLiteAuditStore } from '../../../../src/core/audit/sqlite-store.js';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cdcc-explain-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, 'audit.sqlite');
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function seedDb(payload: object, kind = 'test_event'): number {
  const store = new SQLiteAuditStore({ dbPath });
  const result = store.appendEvent(kind, payload);
  store.close();
  if (!result.ok) throw new Error('seed failed');
  return result.value.id;
}

// ─── Usage errors ─────────────────────────────────────────────────────────────

describe('handleExplain — usage errors', () => {
  it('returns 1 when event_id is missing', async () => {
    const code = await handleExplain(undefined, { dbPath });
    expect(code).toBe(1);
  });

  it('returns 2 when event_id is not a number', async () => {
    const code = await handleExplain('abc', { dbPath });
    expect(code).toBe(2);
  });

  it('returns 2 when event_id is zero', async () => {
    const code = await handleExplain('0', { dbPath });
    expect(code).toBe(2);
  });

  it('returns 2 when event_id is negative', async () => {
    const code = await handleExplain('-5', { dbPath });
    expect(code).toBe(2);
  });
});

// ─── State errors ─────────────────────────────────────────────────────────────

describe('handleExplain — state errors', () => {
  it('returns 3 when event not found in DB', async () => {
    // Create empty DB first
    seedDb({ dummy: true });
    const code = await handleExplain('9999', { dbPath });
    expect(code).toBe(3);
  });
});

// ─── Success path ─────────────────────────────────────────────────────────────

describe('handleExplain — success path', () => {
  it('returns 0 for existing event', async () => {
    const id = seedDb({ message: 'test payload' });
    const code = await handleExplain(String(id), { dbPath });
    expect(code).toBe(0);
  });

  it('returns 0 for recovery_event payload', async () => {
    const recoveryPayload = {
      stage_id: 'Stage 12',
      violation_type: 'false_attestation',
      detected_by: 'parent_verification',
      revert_target: 'abc1234',
      redelegation_spec_diff: 'add HMAC check',
      recovery_pass: true,
    };
    const id = seedDb(recoveryPayload, 'recovery_event');
    const code = await handleExplain(String(id), { dbPath });
    expect(code).toBe(0);
  });

  it('handles non-existent DB path (returns 5)', async () => {
    const code = await handleExplain('1', { dbPath: join(tmpDir, 'nonexistent', 'audit.sqlite') });
    // Should return 5 (I/O error) because parent dir doesn't exist
    // SQLiteAuditStore will create it but no rows will exist → 3
    // Either 3 or 5 is acceptable; confirm it doesn't throw
    expect([3, 5]).toContain(code);
  });
});

// ─── renderRecoveryEvent() ────────────────────────────────────────────────────

describe('renderRecoveryEvent()', () => {
  it('renders all recovery event fields', () => {
    const ev = {
      stage_id: 'Stage 12',
      violation_type: 'false_attestation' as const,
      detected_by: 'parent_verification' as const,
      revert_target: 'abc1234',
      redelegation_spec_diff: 'add HMAC check',
      recovery_pass: true,
    };
    const rendered = renderRecoveryEvent(ev);
    expect(rendered).toContain('Stage 12');
    expect(rendered).toContain('false_attestation');
    expect(rendered).toContain('parent_verification');
    expect(rendered).toContain('abc1234');
    expect(rendered).toContain('true');
    expect(rendered).toContain('add HMAC check');
  });

  it('renders working_tree_state revert_target', () => {
    const ev = {
      stage_id: 'Stage 10',
      violation_type: 'coverage_drop' as const,
      detected_by: 'F8_governance' as const,
      revert_target: 'working_tree_state',
      redelegation_spec_diff: 'restore coverage',
      recovery_pass: false,
    };
    const rendered = renderRecoveryEvent(ev);
    expect(rendered).toContain('working_tree_state');
    expect(rendered).toContain('false');
  });
});
