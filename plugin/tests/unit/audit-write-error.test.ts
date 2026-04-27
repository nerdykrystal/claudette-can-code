// Coverage for AuditLogger.log() WRITE_FAIL + SCHEMA_INVALID branches.
// Stage 05 rewrite: sqlite-store-based; replaces old node:fs/promises mock approach.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditLogger, type AuditLogEntry } from '../../src/core/audit/index.js';

describe('Audit Logger — log() WRITE_FAIL branch', () => {
  let logDir: string;
  let logger: AuditLogger;

  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), 'audit-err-'));
    logger = new AuditLogger(logDir);
  });

  afterEach(async () => {
    // Close store before rm to release WAL locks on Windows
    logger.close();
    await rm(logDir, { recursive: true, force: true });
  });

  it('returns WRITE_FAIL when sqlite store is closed before log()', async () => {
    // Close the underlying store to simulate a write failure
    logger.close();

    const result = await logger.log({
      ts: new Date().toISOString(),
      hookId: 'H1',
      stage: null,
      decision: 'allow',
      rationale: 'test',
      payload: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_FAIL');
    }

    // Re-open so afterEach close() works
    logger = new AuditLogger(join(logDir, 'reopen'));
  });

  it('returns WRITE_FAIL with non-Error thrown from store (String detail branch)', async () => {
    // Close first so subsequent write throws
    logger.close();

    const result = await logger.log({
      ts: new Date().toISOString(),
      hookId: 'H2',
      stage: null,
      decision: 'block',
      rationale: 'test',
      payload: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_FAIL');
      expect(typeof result.error.detail).toBe('string');
    }

    logger = new AuditLogger(join(logDir, 'reopen2'));
  });
});

describe('Audit Logger — log() SCHEMA_INVALID branch', () => {
  let logDir: string;
  let logger: AuditLogger;

  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), 'audit-schema-'));
    logger = new AuditLogger(logDir);
  });

  afterEach(async () => {
    logger.close();
    await rm(logDir, { recursive: true, force: true });
  });

  it('returns SCHEMA_INVALID for entry missing required fields', async () => {
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

  it('returns SCHEMA_INVALID for empty rationale string', async () => {
    const entry: AuditLogEntry = {
      ts: new Date().toISOString(),
      hookId: 'H1',
      stage: null,
      decision: 'allow',
      rationale: '',
      payload: {},
    };

    const result = await logger.log(entry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
  });
});
