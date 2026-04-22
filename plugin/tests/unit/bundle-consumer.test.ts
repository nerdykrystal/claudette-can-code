import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { consume } from '../../src/core/bundle/index.js';

describe('Bundle Consumer (FR-001)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cdcc-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('happy path: all 4 docs approved', async () => {
    // Create PRD with approved status
    await writeFile(
      join(testDir, 'PRD_2026-04-22.md'),
      `---
status: APPROVED
version: 1.0
---
# PRD Content`
    );

    // Create TRD with PASS status
    await writeFile(
      join(testDir, 'TRD_2026-04-22.md'),
      `---
status: Draft PASS
version: 1.0
---
# TRD Content`
    );

    // Create AVD
    await writeFile(
      join(testDir, 'AVD_2026-04-22.md'),
      `---
status: Approved for Merge
version: 1.0
---
# AVD Content`
    );

    // Create TQCD
    await writeFile(
      join(testDir, 'TQCD_2026-04-22.md'),
      `---
status: PASS
version: 1.0
---
# TQCD Content`
    );

    const result = await consume(testDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prd).toBeDefined();
      expect(result.value.trd).toBeDefined();
      expect(result.value.avd).toBeDefined();
      expect(result.value.tqcd).toBeDefined();
      expect(result.value.prd.kind).toBe('PRD');
      expect(result.value.prd.frontmatter['status']).toBe('APPROVED');
    }
  });

  it('missing PRD', async () => {
    await writeFile(join(testDir, 'TRD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'AVD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'TQCD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');

    const result = await consume(testDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_DOC');
      expect(result.error.kind).toBe('PRD');
    }
  });

  it('missing TRD', async () => {
    await writeFile(join(testDir, 'PRD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'AVD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'TQCD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');

    const result = await consume(testDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_DOC');
      expect(result.error.kind).toBe('TRD');
    }
  });

  it('missing AVD', async () => {
    await writeFile(join(testDir, 'PRD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'TRD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'TQCD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');

    const result = await consume(testDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_DOC');
      expect(result.error.kind).toBe('AVD');
    }
  });

  it('missing TQCD', async () => {
    await writeFile(join(testDir, 'PRD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'TRD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'AVD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');

    const result = await consume(testDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_DOC');
      expect(result.error.kind).toBe('TQCD');
    }
  });

  it('unapproved doc (status=Draft)', async () => {
    await writeFile(join(testDir, 'PRD_2026-04-22.md'), '---\nstatus: Draft\n---\nContent');
    await writeFile(join(testDir, 'TRD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'AVD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'TQCD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');

    const result = await consume(testDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_APPROVED');
      expect(result.error.kind).toBe('PRD');
    }
  });

  it('malformed frontmatter (unclosed ---)', async () => {
    await writeFile(join(testDir, 'PRD_2026-04-22.md'), `---
status: APPROVED
version: 1.0
# No closing ---
Content`);

    await writeFile(join(testDir, 'TRD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'AVD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'TQCD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');

    const result = await consume(testDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_FAIL');
    }
  });

  it('missing status field', async () => {
    await writeFile(join(testDir, 'PRD_2026-04-22.md'), `---
version: 1.0
---
Content`);

    await writeFile(join(testDir, 'TRD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'AVD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');
    await writeFile(join(testDir, 'TQCD_2026-04-22.md'), '---\nstatus: APPROVED\n---\nContent');

    const result = await consume(testDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_APPROVED');
    }
  });

  it('all 4 docs present and accessible after consume', async () => {
    const prdContent = '# PRD Doc';
    const trdContent = '# TRD Doc';
    const avdContent = '# AVD Doc';
    const tqcdContent = '# TQCD Doc';

    await writeFile(join(testDir, 'PRD_2026-04-22.md'), `---\nstatus: APPROVED\n---\n${prdContent}`);
    await writeFile(join(testDir, 'TRD_2026-04-22.md'), `---\nstatus: APPROVED\n---\n${trdContent}`);
    await writeFile(join(testDir, 'AVD_2026-04-22.md'), `---\nstatus: APPROVED\n---\n${avdContent}`);
    await writeFile(join(testDir, 'TQCD_2026-04-22.md'), `---\nstatus: APPROVED\n---\n${tqcdContent}`);

    const result = await consume(testDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prd.content).toContain(prdContent);
      expect(result.value.trd.content).toContain(trdContent);
      expect(result.value.avd.content).toContain(avdContent);
      expect(result.value.tqcd.content).toContain(tqcdContent);
    }
  });
});
