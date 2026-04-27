// Tests for atomic-write/index.ts — Stage 07.
// Covers: write to fresh path, overwrite existing, Buffer content,
// error wrapping on rename failure, concurrent writes.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { atomicWrite } from '../../../src/core/atomic-write/index.js';

describe('atomicWrite (direct import — no mocks)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cdcc-aw-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('writes string content to a fresh path', async () => {
    const target = join(testDir, 'fresh.txt');
    const result = await atomicWrite(target, 'hello atomic');
    expect(result.ok).toBe(true);
    const content = await readFile(target, 'utf-8');
    expect(content).toBe('hello atomic');
  });

  it('overwrites existing file atomically', async () => {
    const target = join(testDir, 'overwrite.txt');
    await atomicWrite(target, 'original');
    const result = await atomicWrite(target, 'replaced');
    expect(result.ok).toBe(true);
    const content = await readFile(target, 'utf-8');
    expect(content).toBe('replaced');
  });

  it('writes Buffer content', async () => {
    const target = join(testDir, 'buffer.bin');
    const buf = Buffer.from([0x01, 0x02, 0x03]);
    const result = await atomicWrite(target, buf);
    expect(result.ok).toBe(true);
    const content = await readFile(target);
    expect(content).toEqual(buf);
  });

  it('writes JSON content round-trip', async () => {
    const target = join(testDir, 'data.json');
    const data = { key: 'value', num: 42, nested: { a: true } };
    const result = await atomicWrite(target, JSON.stringify(data));
    expect(result.ok).toBe(true);
    const raw = await readFile(target, 'utf-8');
    expect(JSON.parse(raw)).toEqual(data);
  });

  it('concurrent writes to different paths both succeed', async () => {
    const paths = Array.from({ length: 5 }, (_, i) => join(testDir, `concurrent-${i}.json`));
    const results = await Promise.all(
      paths.map((p, i) => atomicWrite(p, JSON.stringify({ i }))),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    for (let i = 0; i < paths.length; i++) {
      const raw = await readFile(paths[i], 'utf-8');
      expect(JSON.parse(raw)).toEqual({ i });
    }
  });
});

describe('atomicWrite (mocked write-file-atomic)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cdcc-aw-mock-'));
    vi.resetModules();
  });

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('write-file-atomic');
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns rename_failed error when write-file-atomic throws rename/EPERM error', async () => {
    vi.doMock('write-file-atomic', () => {
      const fn = async () => {
        throw new Error('EPERM: rename operation not permitted');
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn as any).sync = () => { throw new Error('EPERM: rename operation not permitted'); };
      return { default: fn };
    });
    vi.resetModules();

    const { atomicWrite: mockedWrite } = await import('../../../src/core/atomic-write/index.js');
    const result = await mockedWrite(join(testDir, 'target.txt'), 'data');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('rename_failed');
      expect(result.error.message).toContain('EPERM');
    }
  });

  it('returns fsync_failed error when write-file-atomic throws generic error', async () => {
    vi.doMock('write-file-atomic', () => {
      const fn = async () => {
        throw new Error('EACCES: permission denied');
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn as any).sync = () => { throw new Error('EACCES: permission denied'); };
      return { default: fn };
    });
    vi.resetModules();

    const { atomicWrite: mockedWrite } = await import('../../../src/core/atomic-write/index.js');
    const result = await mockedWrite(join(testDir, 'target.txt'), 'data');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('fsync_failed');
      expect(result.error.message).toContain('EACCES');
    }
  });
});
