// Final coverage pass: branches uncovered after the primary coverage rounds.
// - bundle/index.ts:45 (no frontmatter opening `---` marker)
// - bundle/index.ts:63-65 (frontmatter line with no colon)
// - audit/index.ts:110-111 (mkdir failure in query())
// - audit/index.ts:140-141 (readdirSync failure after mkdir succeeds)

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
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

describe('Audit Logger — query() mkdir + readdir failure paths (lines 110-111, 140-141)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('node:fs/promises');
    vi.doUnmock('node:fs');
  });

  it('lines 110-111: mkdir failure is caught; query() still returns empty array', async () => {
    const realFsp = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.doMock('node:fs/promises', () => ({
      ...realFsp,
      mkdir: async () => {
        throw new Error('EACCES: simulated mkdir failure');
      },
      default: { ...realFsp },
    }));
    // Also stub readdirSync so the outer try reaches readdir and throws separately,
    // BUT the mkdir catch on lines 110-111 is exercised regardless before readdir runs.
    vi.resetModules();

    const { AuditLogger } = await import('../../src/core/audit/index.js');
    const logger = new AuditLogger('/nonexistent/path/that-would-never-exist');
    const entries = await logger.query();
    // mkdir throws → caught at 110-111 → readdirSync then also throws → caught at 140-141
    // → empty array returned.
    expect(entries).toEqual([]);
  });

  it('lines 140-141: readdirSync throws (outer try catch) → empty array returned', async () => {
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    // Override node:fs.readdirSync to throw. The audit module dynamically imports
    // node:fs at call time; vi.doMock intercepts that dynamic import.
    vi.doMock('node:fs', () => ({
      ...realFs,
      readdirSync: () => {
        throw new Error('ENOENT: simulated readdir failure');
      },
      readFileSync: realFs.readFileSync,
    }));
    vi.resetModules();

    const logDir = await mkdtemp(join(tmpdir(), 'cdcc-audit-readdir-err-'));
    const { AuditLogger } = await import('../../src/core/audit/index.js');
    const logger = new AuditLogger(logDir);
    const entries = await logger.query();
    // readdirSync throws → caught at 140-141 → empty array.
    expect(entries).toEqual([]);
    await rm(logDir, { recursive: true, force: true });
  });
});
