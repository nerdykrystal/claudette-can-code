// Unit tests for SQLiteAuditStore — Stage 05.
// Test cases per §3.05: appendEvent round-trip, WAL pragma, synchronous=FULL, HMAC sig, redaction.
// Updated Stage 14: redaction default-OFF (M-7). Tests that require redaction pass DEFAULT_RULES explicitly.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteAuditStore } from '../../../src/core/audit/sqlite-store.js';
import { DEFAULT_RULES } from '../../../src/core/audit/redaction.js';

describe('SQLiteAuditStore', () => {
  let tmpDir: string;
  let dbPath: string;
  let store: SQLiteAuditStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sqlite-store-test-'));
    dbPath = join(tmpDir, 'audit.sqlite');
    store = new SQLiteAuditStore({ dbPath });
  });

  afterEach(async () => {
    store.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Test case 1 per §3.05: appendEvent returns {id: 1}; subsequent query returns the event
  it('appendEvent returns id=1 for first insert; query returns the event', () => {
    const result = store.appendEvent('test', { x: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(1);
    }

    const events = [...store.queryEvents({ kind: 'test' })];
    expect(events).toHaveLength(1);
    expect(events[0].event_kind).toBe('test');
    const parsed = JSON.parse(events[0].payload_json) as { x: number };
    expect(parsed.x).toBe(1);
  });

  // Test case 2 per §3.05: WAL pragma verified via PRAGMA journal_mode → 'wal'
  it('WAL journal_mode is enabled', () => {
    const db = store.getDb();
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });

  // Test case 3 per §3.05: synchronous = FULL verified
  it('synchronous pragma is FULL (2)', () => {
    const db = store.getDb();
    const sync = db.pragma('synchronous', { simple: true });
    // FULL = 2
    expect(sync).toBe(2);
  });

  it('appendEvent stores multiple events and sequential IDs', () => {
    store.appendEvent('hook_event', { hookId: 'H1' });
    store.appendEvent('hook_event', { hookId: 'H2' });
    store.appendEvent('hook_event', { hookId: 'H3' });

    const events = [...store.queryEvents()];
    expect(events).toHaveLength(3);
    expect(events[0].id).toBe(1);
    expect(events[1].id).toBe(2);
    expect(events[2].id).toBe(3);
  });

  it('appendEvent with HMAC key produces hmac_sig', () => {
    const hmacKey = Buffer.from('test-key-32-bytes-padded-test!!', 'utf8');
    const hmacStore = new SQLiteAuditStore({ dbPath: join(tmpDir, 'hmac.sqlite'), hmacKey });

    try {
      const result = hmacStore.appendEvent('test', { secret: 'value' });
      expect(result.ok).toBe(true);

      const events = [...hmacStore.queryEvents()];
      expect(events).toHaveLength(1);
      expect(events[0].hmac_sig).not.toBeNull();
      expect(typeof events[0].hmac_sig).toBe('string');
      // HMAC-SHA256 is 64 hex chars
      expect((events[0].hmac_sig as string).length).toBe(64);
    } finally {
      hmacStore.close();
    }
  });

  it('appendEvent without HMAC key leaves hmac_sig null', () => {
    store.appendEvent('test', { x: 1 });
    const events = [...store.queryEvents()];
    expect(events[0].hmac_sig).toBeNull();
  });

  it('queryEvents filters by kind', () => {
    store.appendEvent('hook_event', { hookId: 'H1' });
    store.appendEvent('recovery_events', { action: 'revert' });

    const hookEvents = [...store.queryEvents({ kind: 'hook_event' })];
    expect(hookEvents).toHaveLength(1);
    expect(hookEvents[0].event_kind).toBe('hook_event');

    const recoveryEvents = [...store.queryEvents({ kind: 'recovery_events' })];
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0].event_kind).toBe('recovery_events');
  });

  it('queryEvents filters by since', () => {
    store.appendEvent('test', { n: 1 });

    const future = new Date(Date.now() + 60_000).toISOString();
    const events = [...store.queryEvents({ since: future })];
    expect(events).toHaveLength(0);
  });

  it('queryEvents with limit returns only N rows', () => {
    for (let i = 0; i < 10; i++) {
      store.appendEvent('test', { i });
    }
    const limited = [...store.queryEvents({ limit: 3 })];
    expect(limited).toHaveLength(3);
  });

  it('stores ts_utc_year/month/day correctly', () => {
    store.appendEvent('test', {});
    const events = [...store.queryEvents()];
    const now = new Date();
    expect(events[0].ts_utc_year).toBe(now.getUTCFullYear());
    expect(events[0].ts_utc_month).toBe(now.getUTCMonth() + 1);
    expect(events[0].ts_utc_day).toBe(now.getUTCDate());
  });

  it('redaction_count is 0 for clean payloads', () => {
    store.appendEvent('test', { safe: 'value' });
    const events = [...store.queryEvents()];
    expect(events[0].redaction_count).toBe(0);
  });

  it('redaction_count > 0 for payloads with API keys when DEFAULT_RULES explicitly provided (M-7 opt-in)', () => {
    // M-7 closure: redaction is default-OFF. Must opt in by passing DEFAULT_RULES explicitly.
    // Use a separate db file to avoid conflict with the default store open on dbPath.
    const redactDbPath = join(tmpDir, 'audit-redact.sqlite');
    const storeWithRedaction = new SQLiteAuditStore({ dbPath: redactDbPath, redactionRules: DEFAULT_RULES });
    storeWithRedaction.appendEvent('test', { key: 'sk-abcdefghijklmnopqrstu' });
    const events = [...storeWithRedaction.queryEvents()];
    expect(events[0].redaction_count).toBeGreaterThan(0);
    const parsed = JSON.parse(events[0].payload_json) as { key: string };
    expect(parsed.key).toContain('[REDACTED:api_key]');
    storeWithRedaction.close();
  });

  it('checkpointWal completes without error', () => {
    store.appendEvent('test', {});
    expect(() => store.checkpointWal()).not.toThrow();
  });

  it('close() releases the db; subsequent appendEvent returns write_failed error', () => {
    store.close();
    const result = store.appendEvent('test', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('write_failed');
    }
    // Re-open so afterEach close() does not double-close and fail
    store = new SQLiteAuditStore({ dbPath });
  });
});
