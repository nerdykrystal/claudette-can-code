import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditLogger, type AuditLogEntry } from '../../src/core/audit/index.js';

describe('Audit Log Loss Rate (Reliability)', () => {
  let logDir: string;
  let logger: AuditLogger;

  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), 'audit-reliability-'));
    logger = new AuditLogger(logDir);
  });

  afterEach(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  // 1000 fsync-on-write operations on Windows fs typically exceed vitest's 5s default.
  // TQCD 4.4 defines this as a correctness test (zero loss), not a performance test —
  // raising the timeout is the correct fix, not lowering the iteration count.
  it('should write and persist 1000 entries with zero loss', { timeout: 60_000 }, async () => {
    const entries: AuditLogEntry[] = [];

    // Generate 1000 entries
    for (let i = 0; i < 1000; i++) {
      const entry: AuditLogEntry = {
        ts: new Date(Date.now() + i * 1000).toISOString(),
        hookId: ['H1', 'H2', 'H3', 'H4', 'H5'][i % 5] as unknown as 'H1' | 'H2' | 'H3' | 'H4' | 'H5',
        stage: `stage-${i % 10}`,
        decision: i % 3 === 0 ? 'allow' : i % 3 === 1 ? 'block' : 'halt',
        rationale: `Entry ${i}`,
        payload: { index: i, iteration: Math.floor(i / 100) },
      };
      entries.push(entry);
    }

    // Write all entries
    for (const entry of entries) {
      const result = await logger.log(entry);
      expect(result.ok).toBe(true);
    }

    // Read all entries back
    const readEntries = await logger.query();

    // Assert 1000 entries (zero loss)
    expect(readEntries).toHaveLength(1000);

    // Assert order preserved (JSONL line order)
    for (let i = 0; i < readEntries.length; i++) {
      expect(readEntries[i].payload).toMatchObject({ index: i });
    }
  });

  it('should maintain entry integrity across fsync boundaries', async () => {
    const specialEntry: AuditLogEntry = {
      ts: new Date().toISOString(),
      hookId: 'H5',
      stage: 'critical',
      decision: 'block',
      rationale: 'Integrity test with special chars: \n"\\{}',
      payload: { data: { nested: 'value', number: 42, array: [1, 2, 3] } },
    };

    const result = await logger.log(specialEntry);
    expect(result.ok).toBe(true);

    const readEntries = await logger.query();
    expect(readEntries).toHaveLength(1);

    // Deep equality check for complex payload
    expect(readEntries[0]).toMatchObject(specialEntry);
  });
});
