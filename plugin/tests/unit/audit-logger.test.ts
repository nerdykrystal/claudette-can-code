import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditLogger, type AuditLogEntry } from '../../src/core/audit/index.js';

describe('AuditLogger', () => {
  let logDir: string;
  let logger: AuditLogger;

  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), 'audit-'));
    logger = new AuditLogger(logDir);
  });

  afterEach(async () => {
    // Must close sqlite store before rm() to release WAL file locks on Windows.
    logger.close();
    await rm(logDir, { recursive: true, force: true });
  });

  it('should write and read audit entry round-trip', async () => {
    const entry: AuditLogEntry = {
      ts: new Date().toISOString(),
      hookId: 'H1',
      stage: 'stage-01',
      decision: 'allow',
      rationale: 'Test entry',
      payload: { test: true },
    };

    const result = await logger.log(entry);
    expect(result.ok).toBe(true);

    const entries = await logger.query();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject(entry);
  });

  it('should reject schema-invalid entry', async () => {
    const invalidEntry = {
      ts: '2026-04-22T12:00:00Z',
      hookId: 'H1',
      // Missing stage, decision, rationale, payload
    } as unknown as AuditLogEntry;

    const result = await logger.log(invalidEntry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
  });

  it('should filter by hookId', async () => {
    const entry1: AuditLogEntry = {
      ts: new Date().toISOString(),
      hookId: 'H1',
      stage: null,
      decision: 'allow',
      rationale: 'H1 entry',
      payload: {},
    };
    const entry2: AuditLogEntry = {
      ts: new Date().toISOString(),
      hookId: 'H2',
      stage: null,
      decision: 'allow',
      rationale: 'H2 entry',
      payload: {},
    };

    await logger.log(entry1);
    await logger.log(entry2);

    const h1Entries = await logger.query({ hookId: 'H1' });
    expect(h1Entries).toHaveLength(1);
    expect(h1Entries[0].hookId).toBe('H1');
  });

  it('should filter by stage', async () => {
    const entry1: AuditLogEntry = {
      ts: new Date().toISOString(),
      hookId: 'H1',
      stage: 'stage-01',
      decision: 'allow',
      rationale: 'Stage 1',
      payload: {},
    };
    const entry2: AuditLogEntry = {
      ts: new Date().toISOString(),
      hookId: 'H1',
      stage: 'stage-02',
      decision: 'allow',
      rationale: 'Stage 2',
      payload: {},
    };

    await logger.log(entry1);
    await logger.log(entry2);

    const stageEntries = await logger.query({ stage: 'stage-01' });
    expect(stageEntries).toHaveLength(1);
    expect(stageEntries[0].stage).toBe('stage-01');
  });

  it('should filter by since timestamp', async () => {
    const baseTime = new Date('2026-04-22T10:00:00Z');
    const laterTime = new Date('2026-04-22T11:00:00Z');

    const entry1: AuditLogEntry = {
      ts: baseTime.toISOString(),
      hookId: 'H1',
      stage: null,
      decision: 'allow',
      rationale: 'Early entry',
      payload: {},
    };
    const entry2: AuditLogEntry = {
      ts: laterTime.toISOString(),
      hookId: 'H1',
      stage: null,
      decision: 'allow',
      rationale: 'Later entry',
      payload: {},
    };

    await logger.log(entry1);
    await logger.log(entry2);

    const recentEntries = await logger.query({ since: '2026-04-22T10:30:00Z' });
    expect(recentEntries).toHaveLength(1);
    expect(recentEntries[0].ts).toBe(laterTime.toISOString());
  });

  it('should auto-create logDir if missing', async () => {
    const newDir = join(tmpdir(), `audit-new-${Date.now()}`);
    const newLogger = new AuditLogger(newDir);

    const entry: AuditLogEntry = {
      ts: new Date().toISOString(),
      hookId: 'H1',
      stage: null,
      decision: 'allow',
      rationale: 'Auto-create test',
      payload: {},
    };

    const result = await newLogger.log(entry);
    expect(result.ok).toBe(true);

    const entries = await newLogger.query();
    expect(entries).toHaveLength(1);

    // Close before rm to release WAL locks on Windows
    newLogger.close();
    await rm(newDir, { recursive: true, force: true });
  });

  it('should preserve existing entries on append', async () => {
    const entry1: AuditLogEntry = {
      ts: '2026-04-22T10:00:00Z',
      hookId: 'H1',
      stage: null,
      decision: 'allow',
      rationale: 'First',
      payload: {},
    };
    const entry2: AuditLogEntry = {
      ts: '2026-04-22T10:01:00Z',
      hookId: 'H2',
      stage: null,
      decision: 'allow',
      rationale: 'Second',
      payload: {},
    };

    await logger.log(entry1);
    await logger.log(entry2);

    const entries = await logger.query();
    expect(entries).toHaveLength(2);
    expect(entries[0].rationale).toBe('First');
    expect(entries[1].rationale).toBe('Second');
  });
});
