// Targeted coverage for hook-installer error-return branches.
// Updated for Stage 07: installHooks now uses write-file-atomic (writeFileAtomic.sync)
// instead of node:fs/promises.writeFile + manual rename.
//
// Lines 117-123 (original): outer catch now catches writeFileAtomic.sync throws
//                (or PARSE_FAIL if message includes 'JSON').
// Also: inner catch re-throw when readFile fails with non-ENOENT, non-JSON error.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HookEntry } from '../../src/core/hook-installer/index.js';

const entry: HookEntry = {
  id: 'H1',
  event: 'UserPromptSubmit',
  handler: 'dist/hooks/h1-input-manifest/index.js',
};

describe('Hook Installer — error-return branches (lines 82-89, 117-123)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cdcc-hook-installer-err-'));
  });

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('write-file-atomic');
    vi.doUnmock('node:fs/promises');
    await rm(dir, { recursive: true, force: true });
  });

  it('lines 82-89: PARSE_FAIL when settings.hooks[event] is not an array', async () => {
    const settingsPath = join(dir, 'settings.json');
    await writeFile(
      settingsPath,
      JSON.stringify({ hooks: { UserPromptSubmit: 'this-is-a-string' } }),
      'utf-8',
    );

    const { installHooks } = await import('../../src/core/hook-installer/index.js');
    const result = await installHooks(settingsPath, [entry]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_FAIL');
      expect(result.error.detail).toContain('UserPromptSubmit');
      expect(result.error.detail).toContain('not an array');
    }
  });

  it('lines 117-123 (non-JSON): outer catch returns WRITE_FAIL when writeFileAtomic.sync throws', async () => {
    // Stage 07: installHooks uses write-file-atomic (sync); mock it to throw EACCES
    vi.doMock('write-file-atomic', async () => {
      const realMod = await vi.importActual<typeof import('write-file-atomic')>('write-file-atomic');
      const fn = async (...args: unknown[]) => (realMod as unknown as ((...a: unknown[]) => Promise<void>))(...args);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn as any).sync = () => {
        throw new Error('EACCES: simulated write permission denied');
      };
      return { default: fn };
    });
    vi.resetModules();

    const { installHooks } = await import('../../src/core/hook-installer/index.js');
    const settingsPath = join(dir, 'settings.json');
    const result = await installHooks(settingsPath, [entry]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_FAIL');
      expect(result.error.detail).toContain('EACCES');
    }
  });

  it('lines 117-123 (JSON branch): outer catch returns PARSE_FAIL when thrown error mentions JSON', async () => {
    // Stage 07: mock writeFileAtomic.sync to throw a JSON-mentioning error
    vi.doMock('write-file-atomic', async () => {
      const realMod = await vi.importActual<typeof import('write-file-atomic')>('write-file-atomic');
      const fn = async (...args: unknown[]) => (realMod as unknown as ((...a: unknown[]) => Promise<void>))(...args);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn as any).sync = () => {
        throw new Error('Unexpected JSON serialization failure');
      };
      return { default: fn };
    });
    vi.resetModules();

    const { installHooks } = await import('../../src/core/hook-installer/index.js');
    const settingsPath = join(dir, 'settings.json');
    const result = await installHooks(settingsPath, [entry]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_FAIL');
      expect(result.error.detail).toMatch(/JSON/);
    }
  });

  it('line 54: inner read-error re-throw reaches outer catch (non-ENOENT, non-JSON readFile error)', async () => {
    const realFsp = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.doMock('node:fs/promises', () => ({
      ...realFsp,
      readFile: async () => {
        const e = new Error('EACCES: permission denied on read') as NodeJS.ErrnoException;
        e.code = 'EACCES';
        throw e;
      },
      default: { ...realFsp },
    }));
    vi.resetModules();

    const { installHooks } = await import('../../src/core/hook-installer/index.js');
    const settingsPath = join(dir, 'settings.json');
    const result = await installHooks(settingsPath, [entry]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_FAIL');
      expect(result.error.detail).toContain('EACCES');
    }
  });
});
