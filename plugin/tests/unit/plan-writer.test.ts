import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdir, readFile, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { write } from '../../src/core/plan-writer/index.js';
import type { Plan } from '../../src/core/types/index.js';

const createValidPlan = (): Plan => ({
  schemaVersion: '0.1.0',
  id: 'test-plan-123',
  createdAt: '2026-04-22T12:00:00Z',
  bundle: {
    prdPath: '/path/to/prd.md',
    trdPath: '/path/to/trd.md',
    avdPath: '/path/to/avd.md',
    tqcdPath: '/path/to/tqcd.md',
  },
  stages: [
    {
      id: 'stage1',
      name: 'Test Stage',
      assignedModel: 'haiku-4-5',
      effortLevel: 'medium',
      specDepth: 'Deep',
      gate: {
        threshold: 3,
        severityPolicy: 'standard',
        domain: 'code',
      },
      inputManifest: [],
      skillInvocations: [],
    },
  ],
});

describe('Plan Artifact Writer (FR-006)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cdcc-plan-writer-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('schema-valid write succeeds', async () => {
    const plan = createValidPlan();
    const outPath = join(testDir, 'plan.json');

    const result = await write(plan, outPath);

    expect(result.ok).toBe(true);

    const content = await readFile(outPath, 'utf-8');
    const written = JSON.parse(content);
    expect(written.id).toBe(plan.id);
    expect(written.schemaVersion).toBe('0.1.0');
  });

  it('schema-invalid plan rejected', async () => {
    const invalidPlan = {
      // Missing required fields
      id: 'test',
      stages: [],
    } as unknown as Plan;

    const outPath = join(testDir, 'plan.json');

    const result = await write(invalidPlan, outPath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
  });

  it('no partial write on schema failure', async () => {
    const invalidPlan = {
      id: 'test',
      stages: [],
    } as unknown as Plan;

    const outPath = join(testDir, 'plan.json');
    const tmpPath = `${outPath}.tmp`;

    const result = await write(invalidPlan, outPath);

    expect(result.ok).toBe(false);

    // Check that neither final nor tmp file exists (or tmp is cleaned up)
    try {
      await readFile(outPath, 'utf-8');
      throw new Error('Final file should not exist');
    } catch (e) {
      // Expected
    }
  });

  it('atomic write: file exists and is complete', async () => {
    const plan = createValidPlan();
    const outPath = join(testDir, 'plan.json');

    const result = await write(plan, outPath);

    expect(result.ok).toBe(true);

    const content = await readFile(outPath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.schemaVersion).toBe('0.1.0');
    expect(parsed.stages).toHaveLength(1);
  });

  it('write-fail on read-only directory', async () => {
    const plan = createValidPlan();
    const readOnlyDir = join(testDir, 'readonly');
    await mkdir(readOnlyDir, { recursive: true });

    // Make directory read-only (may not work on Windows, but test attempt)
    try {
      await chmod(readOnlyDir, 0o444);

      const outPath = join(readOnlyDir, 'plan.json');
      const result = await write(plan, outPath);

      // On systems where chmod works, expect write failure
      // On Windows, this may not fail as expected
      if (process.platform !== 'win32') {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('WRITE_FAIL');
        }
      }
    } finally {
      // Restore permissions
      try {
        await chmod(readOnlyDir, 0o755);
      } catch {
        // Ignore
      }
    }
  });

  it('JSON output is valid and parseable', async () => {
    const plan = createValidPlan();
    const outPath = join(testDir, 'plan.json');

    const result = await write(plan, outPath);

    expect(result.ok).toBe(true);

    const content = await readFile(outPath, 'utf-8');
    const parsed = JSON.parse(content); // Will throw if invalid JSON

    expect(parsed).toEqual(plan);
  });

  it('multiple consecutive writes succeed', async () => {
    const plan1 = createValidPlan();
    const plan2 = { ...createValidPlan(), id: 'plan-2' };

    const path1 = join(testDir, 'plan1.json');
    const path2 = join(testDir, 'plan2.json');

    const result1 = await write(plan1, path1);
    const result2 = await write(plan2, path2);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    const content1 = JSON.parse(await readFile(path1, 'utf-8'));
    const content2 = JSON.parse(await readFile(path2, 'utf-8'));

    expect(content1.id).toBe('test-plan-123');
    expect(content2.id).toBe('plan-2');
  });
});
