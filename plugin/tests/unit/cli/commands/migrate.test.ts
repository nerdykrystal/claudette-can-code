// Unit tests for cdcc migrate-audit-log command module — Stage 12.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleMigrateAuditLog } from '../../../../src/cli/commands/migrate.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cdcc-migrate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── No sources ───────────────────────────────────────────────────────────────

describe('handleMigrateAuditLog — no sources', () => {
  it('returns 0 and no-op message when no JSONL files found', async () => {
    const auditDir = join(tmpDir, 'cdcc-audit');
    mkdirSync(auditDir, { recursive: true });
    const code = await handleMigrateAuditLog([], { claudeRoot: tmpDir });
    expect(code).toBe(0);
  });
});

// ─── Single JSONL source ──────────────────────────────────────────────────────

describe('handleMigrateAuditLog — valid JSONL', () => {
  it('returns 0 for a valid JSONL file', async () => {
    const auditDir = join(tmpDir, 'cdcc-audit');
    mkdirSync(auditDir, { recursive: true });
    const jsonlPath = join(auditDir, 'audit-2026-04-27.jsonl');
    const lines = [
      JSON.stringify({ ts: '2026-04-27T00:00:00Z', hookId: 'H1', stage: 'Stage 01', decision: 'allow', payload: { msg: 'test' } }),
      JSON.stringify({ ts: '2026-04-27T00:01:00Z', hookId: 'H2', stage: 'Stage 02', decision: 'block', payload: { msg: 'test2' } }),
    ];
    writeFileSync(jsonlPath, lines.join('\n'));

    const code = await handleMigrateAuditLog([], { claudeRoot: tmpDir });
    expect(code).toBe(0);
  });
});

// ─── --source arg parsing ─────────────────────────────────────────────────────

describe('handleMigrateAuditLog — args parsing', () => {
  it('accepts --source= arg', async () => {
    const auditDir = join(tmpDir, 'cdcc-audit');
    mkdirSync(auditDir, { recursive: true });
    const jsonlPath = join(auditDir, 'explicit.jsonl');
    writeFileSync(jsonlPath, JSON.stringify({ ts: '2026-04-27T00:00:00Z', hookId: 'H1', stage: null, decision: 'allow', payload: {} }) + '\n');

    const code = await handleMigrateAuditLog([`--source=${jsonlPath}`], { claudeRoot: tmpDir });
    expect(code).toBe(0);
  });

  it('accepts --target= arg and writes to specified path', async () => {
    const auditDir = join(tmpDir, 'cdcc-audit');
    mkdirSync(auditDir, { recursive: true });
    const jsonlPath = join(auditDir, 'test.jsonl');
    writeFileSync(jsonlPath, JSON.stringify({ ts: '2026-04-27T00:00:00Z', hookId: 'H3', stage: null, decision: 'allow', payload: {} }) + '\n');
    const targetPath = join(tmpDir, 'custom-target.sqlite');

    const code = await handleMigrateAuditLog([`--source=${jsonlPath}`, `--target=${targetPath}`], { claudeRoot: tmpDir });
    expect(code).toBe(0);
    expect(existsSync(targetPath)).toBe(true);
  });

  it('accepts --resume flag without error', async () => {
    const code = await handleMigrateAuditLog(['--resume'], { claudeRoot: tmpDir });
    expect(code).toBe(0);
  });
});

// ─── Error path ───────────────────────────────────────────────────────────────

describe('handleMigrateAuditLog — error handling', () => {
  it('returns 1 when source file contains invalid JSON', async () => {
    const auditDir = join(tmpDir, 'cdcc-audit');
    mkdirSync(auditDir, { recursive: true });
    const jsonlPath = join(auditDir, 'bad.jsonl');
    writeFileSync(jsonlPath, 'not-json\nnot-json-either\n');

    const code = await handleMigrateAuditLog([`--source=${jsonlPath}`], { claudeRoot: tmpDir });
    expect(code).toBe(1);
  });

  it('returns 1 for non-existent explicit source file', async () => {
    const code = await handleMigrateAuditLog([`--source=${join(tmpDir, 'missing.jsonl')}`], { claudeRoot: tmpDir });
    expect(code).toBe(1);
  });
});
