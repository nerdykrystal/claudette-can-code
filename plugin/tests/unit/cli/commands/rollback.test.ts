// Unit tests for cdcc rollback — Stage 12.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleRollback, extractRevertTarget } from '../../../../src/cli/commands/rollback.js';
import { SQLiteAuditStore } from '../../../../src/core/audit/sqlite-store.js';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cdcc-rollback-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, 'audit.sqlite');
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function seedDb(payload: object, kind = 'recovery_event'): number {
  const store = new SQLiteAuditStore({ dbPath });
  const result = store.appendEvent(kind, payload);
  store.close();
  if (!result.ok) throw new Error('seed failed');
  return result.value.id;
}

function validRecoveryPayload(revertTarget: string) {
  return {
    stage_id: 'Stage 12',
    violation_type: 'false_attestation',
    detected_by: 'parent_verification',
    revert_target: revertTarget,
    redelegation_spec_diff: 'fix attestation',
    recovery_pass: false,
  };
}

// ─── Usage errors ─────────────────────────────────────────────────────────────

describe('handleRollback — usage errors', () => {
  it('returns 1 when event_id is missing', async () => {
    const code = await handleRollback(undefined, { dbPath });
    expect(code).toBe(1);
  });

  it('returns 2 when event_id is not a number', async () => {
    const code = await handleRollback('abc', { dbPath });
    expect(code).toBe(2);
  });

  it('returns 2 when event_id is zero', async () => {
    const code = await handleRollback('0', { dbPath });
    expect(code).toBe(2);
  });
});

// ─── State errors ─────────────────────────────────────────────────────────────

describe('handleRollback — state errors', () => {
  it('returns 3 when event not found', async () => {
    seedDb(validRecoveryPayload('abc1234'));
    const code = await handleRollback('9999', { dbPath });
    expect(code).toBe(3);
  });

  it('returns 3 when event found but payload is not a recovery_event', async () => {
    const id = seedDb({ msg: 'not a recovery event' }, 'misc_event');
    const code = await handleRollback(String(id), { dbPath });
    expect(code).toBe(3);
  });

  it('returns 3 when recovery_event has invalid revert_target', async () => {
    const id = seedDb({
      stage_id: 'Stage 12',
      violation_type: 'false_attestation',
      detected_by: 'parent_verification',
      revert_target: 'INVALID@@HASH',
      redelegation_spec_diff: 'fix',
      recovery_pass: false,
    });
    const code = await handleRollback(String(id), { dbPath });
    expect(code).toBe(3);
  });
});

// ─── External command failure path (git not found / fails) ────────────────────

describe('handleRollback — external command failure', () => {
  it('returns 6 when git revert fails for hex target', async () => {
    const id = seedDb(validRecoveryPayload('deadbeef1234567'));
    // git revert on a non-existent sha will fail
    const code = await handleRollback(String(id), { dbPath, cwd: tmpDir });
    // 6 = external command failure
    expect(code).toBe(6);
  });

  it('returns 6 when git restore fails for working_tree_state', async () => {
    const id = seedDb(validRecoveryPayload('working_tree_state'));
    // tmpDir is not a git repo — git restore will fail
    const code = await handleRollback(String(id), { dbPath, cwd: tmpDir });
    expect(code).toBe(6);
  });
});

// ─── extractRevertTarget() ────────────────────────────────────────────────────

describe('extractRevertTarget()', () => {
  it('returns hex revert_target from valid recovery_event JSON', () => {
    const payload = JSON.stringify(validRecoveryPayload('abc1234def'));
    expect(extractRevertTarget(payload)).toBe('abc1234def');
  });

  it('returns "working_tree_state" literal', () => {
    const payload = JSON.stringify(validRecoveryPayload('working_tree_state'));
    expect(extractRevertTarget(payload)).toBe('working_tree_state');
  });

  it('returns undefined for non-JSON string', () => {
    expect(extractRevertTarget('not json')).toBeUndefined();
  });

  it('returns undefined for JSON that is not a recovery_event', () => {
    expect(extractRevertTarget(JSON.stringify({ foo: 'bar' }))).toBeUndefined();
  });

  it('returns undefined for recovery_event with invalid revert_target', () => {
    const payload = JSON.stringify({
      ...validRecoveryPayload('working_tree_state'),
      revert_target: 'INVALID@@',
    });
    expect(extractRevertTarget(payload)).toBeUndefined();
  });

  it('returns undefined for recovery_event with validation errors', () => {
    const payload = JSON.stringify({
      stage_id: '',
      violation_type: 'false_attestation',
      detected_by: 'parent_verification',
      revert_target: 'abc1234',
      redelegation_spec_diff: 'fix',
      recovery_pass: false,
    });
    expect(extractRevertTarget(payload)).toBeUndefined();
  });

  it('returns undefined for null JSON', () => {
    expect(extractRevertTarget('null')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(extractRevertTarget('')).toBeUndefined();
  });
});
