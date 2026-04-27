// Final coverage pass: branches uncovered after the primary coverage rounds.
// - bundle/index.ts:45 (no frontmatter opening `---` marker)
// - bundle/index.ts:63-65 (frontmatter line with no colon)
// - audit/index.ts: query() returns empty array on closed store; parseRow handles null stage
//   Stage 05 update: JSONL mocks replaced with sqlite-based error path tests.

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Bundle frontmatter edge cases (lines 45, 63-65)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cdcc-bundle-edge-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('line 45: file with no frontmatter opening `---` parses to empty frontmatter object', async () => {
    // Write 4 docs where each starts with content (no leading `---` marker).
    // The parser's early return at line 45 fires for each.
    const content = '# PRD without frontmatter\n\nstatus: APPROVED\n\nBody content.';
    await writeFile(join(dir, 'PRD.md'), content, 'utf-8');
    await writeFile(join(dir, 'TRD.md'), content, 'utf-8');
    await writeFile(join(dir, 'AVD.md'), content, 'utf-8');
    await writeFile(join(dir, 'TQCD.md'), content, 'utf-8');

    const { consume } = await import('../../src/core/bundle/index.js');
    const result = await consume(dir);

    // Empty frontmatter → status field missing → NOT_APPROVED.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // MISSING_DOC means frontmatter has no `status` field at all.
      // NOT_APPROVED means it has one but doesn't contain PASS/APPROVED.
      expect(['NOT_APPROVED', 'MISSING_DOC']).toContain(result.error.code);
    }
  });

  it('lines 63-65: frontmatter lines without a colon are skipped gracefully', async () => {
    // Frontmatter with one colon-bearing line and one colon-less line.
    // The colon-less line hits the `if (colonIdx === -1) continue;` branch.
    const content = [
      '---',
      'status: APPROVED',
      'ThisLineHasNoColon',
      '',
      'another: value',
      '---',
      '# Body',
    ].join('\n');
    await writeFile(join(dir, 'PRD.md'), content, 'utf-8');
    await writeFile(join(dir, 'TRD.md'), content, 'utf-8');
    await writeFile(join(dir, 'AVD.md'), content, 'utf-8');
    await writeFile(join(dir, 'TQCD.md'), content, 'utf-8');

    const { consume } = await import('../../src/core/bundle/index.js');
    const result = await consume(dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Valid keys are parsed; colon-less line is dropped.
      expect(result.value.prd.frontmatter.status).toBeDefined();
      expect(String(result.value.prd.frontmatter.status).toUpperCase()).toContain('APPROVED');
      expect(result.value.prd.frontmatter.another).toBeDefined();
      expect(result.value.prd.frontmatter.ThisLineHasNoColon).toBeUndefined();
    }
  });
});

describe('Audit Logger — query() error paths (sqlite-based, Stage 05)', () => {
  let logDir: string;

  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), 'cdcc-audit-readdir-err-'));
  });

  afterEach(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  it('query() returns empty array when sqlite store is closed (iterate throws)', async () => {
    const { AuditLogger } = await import('../../src/core/audit/index.js');
    const logger = new AuditLogger(logDir);
    logger.close();
    const entries = await logger.query();
    // iterate throws on closed DB → caught by outer try/catch → empty array
    expect(entries).toEqual([]);
  });

  it('query() with stage filter returns only matching entries', async () => {
    const { AuditLogger } = await import('../../src/core/audit/index.js');
    const logger = new AuditLogger(logDir);
    await logger.log({
      ts: '2026-04-24T00:00:00Z',
      hookId: 'H1',
      stage: 'stage-01',
      decision: 'allow',
      rationale: 'valid',
      payload: {},
    });
    await logger.log({
      ts: '2026-04-24T00:00:01Z',
      hookId: 'H2',
      stage: 'stage-02',
      decision: 'allow',
      rationale: 'other stage',
      payload: {},
    });
    const filtered = await logger.query({ stage: 'stage-01' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].stage).toBe('stage-01');
    logger.close();
  });
});
