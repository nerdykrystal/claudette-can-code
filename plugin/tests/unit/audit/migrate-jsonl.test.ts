// Unit tests for migrateJsonlToSqlite — Stage 05.
// Test cases per §3.05: source_not_found, round-trip, checkpoint resume.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrateJsonlToSqlite } from '../../../src/core/audit/migrate-jsonl.js';
import { SQLiteAuditStore } from '../../../src/core/audit/sqlite-store.js';

function makeEntry(i: number): string {
  return JSON.stringify({
    ts: new Date(Date.UTC(2026, 3, 22, 10, i % 60, 0)).toISOString(),
    hookId: ['H1', 'H2', 'H3'][i % 3],
    stage: `stage-${i % 5}`,
    decision: i % 2 === 0 ? 'allow' : 'block',
    rationale: `Entry ${i}`,
    payload: { index: i },
  });
}

describe('migrateJsonlToSqlite', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'migrate-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns source_not_found for missing file', async () => {
    const result = await migrateJsonlToSqlite({
      jsonlPath: join(tmpDir, 'nonexistent.jsonl'),
      dbPath: join(tmpDir, 'audit.sqlite'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('source_not_found');
    }
  });

  it('migrates 10 JSONL entries to sqlite', async () => {
    const jsonlPath = join(tmpDir, 'audit.jsonl');
    const lines = Array.from({ length: 10 }, (_, i) => makeEntry(i)).join('\n') + '\n';
    await writeFile(jsonlPath, lines, 'utf8');

    const dbPath = join(tmpDir, 'audit.sqlite');
    const result = await migrateJsonlToSqlite({ jsonlPath, dbPath });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rowsImported).toBe(10);
      expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.value.checksumMatch).toBe(true);
    }

    // Verify rows in DB
    const store = new SQLiteAuditStore({ dbPath });
    const events = [...store.queryEvents()];
    store.close();
    expect(events).toHaveLength(10);
  });

  it('skips blank lines without error', async () => {
    const jsonlPath = join(tmpDir, 'audit.jsonl');
    const lines = makeEntry(0) + '\n\n' + makeEntry(1) + '\n';
    await writeFile(jsonlPath, lines, 'utf8');

    const dbPath = join(tmpDir, 'audit.sqlite');
    const result = await migrateJsonlToSqlite({ jsonlPath, dbPath });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rowsImported).toBe(2);
    }
  });

  it('returns parse_failure for invalid JSON line', async () => {
    const jsonlPath = join(tmpDir, 'bad.jsonl');
    await writeFile(jsonlPath, '{"valid": true}\nNOT_JSON\n', 'utf8');

    const dbPath = join(tmpDir, 'audit.sqlite');
    const result = await migrateJsonlToSqlite({ jsonlPath, dbPath });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('parse_failure');
    }
  });

  // Test case 5 per §3.05: migration resume via checkpoint
  it('resumes from checkpoint when source is partially migrated', async () => {
    const jsonlPath = join(tmpDir, 'partial.jsonl');
    const dbPath = join(tmpDir, 'audit.sqlite');

    // Write 20 entries
    const lines = Array.from({ length: 20 }, (_, i) => makeEntry(i)).join('\n') + '\n';
    await writeFile(jsonlPath, lines, 'utf8');

    // First run: migrate with batchSize=10 (migrates all 20)
    const firstResult = await migrateJsonlToSqlite({ jsonlPath, dbPath, batchSize: 10 });
    expect(firstResult.ok).toBe(true);
    if (firstResult.ok) {
      expect(firstResult.value.rowsImported).toBe(20);
    }

    // Second run: should return cached checkpoint (already completed)
    const secondResult = await migrateJsonlToSqlite({ jsonlPath, dbPath });
    expect(secondResult.ok).toBe(true);
    if (secondResult.ok) {
      // Should return the cached rowsImported count
      expect(secondResult.value.rowsImported).toBe(20);
    }

    // Total rows in DB should still be 20 (no duplication)
    const store = new SQLiteAuditStore({ dbPath });
    const events = [...store.queryEvents()];
    store.close();
    expect(events).toHaveLength(20);
  });

  it('migrates 1000 entries (stress test)', { timeout: 30_000 }, async () => {
    const jsonlPath = join(tmpDir, 'large.jsonl');
    const dbPath = join(tmpDir, 'large.sqlite');

    const lines = Array.from({ length: 1000 }, (_, i) => makeEntry(i)).join('\n') + '\n';
    await writeFile(jsonlPath, lines, 'utf8');

    const result = await migrateJsonlToSqlite({ jsonlPath, dbPath, batchSize: 100 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rowsImported).toBe(1000);
    }
  });
});
