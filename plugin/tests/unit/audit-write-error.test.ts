// Coverage for AuditLogger.log() outer-catch WRITE_FAIL branch (lines 96-98).

import { describe, it, expect, afterEach, vi } from 'vitest';

describe('Audit Logger — log() WRITE_FAIL branch (lines 96-98)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('node:fs/promises');
  });

  it('returns WRITE_FAIL when fs.open throws (non-Error thrown for String(err) branch)', async () => {
    const realFsp = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.doMock('node:fs/promises', () => ({
      ...realFsp,
      open: async () => {
        // Throw a non-Error value to exercise the `String(err)` branch of
        // `const detail = err instanceof Error ? err.message : String(err);`
        throw 'non-error-open-failure';
      },
      default: { ...realFsp },
    }));
    vi.resetModules();

    const { AuditLogger } = await import('../../src/core/audit/index.js');
    const logger = new AuditLogger('/tmp/cdcc-audit-fake');
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
      expect(result.error.detail).toBe('non-error-open-failure');
    }
  });

  it('returns WRITE_FAIL with Error.message when fs.open throws an Error', async () => {
    const realFsp = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.doMock('node:fs/promises', () => ({
      ...realFsp,
      open: async () => {
        throw new Error('EACCES: simulated open failure');
      },
      default: { ...realFsp },
    }));
    vi.resetModules();

    const { AuditLogger } = await import('../../src/core/audit/index.js');
    const logger = new AuditLogger('/tmp/cdcc-audit-fake-2');
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
      expect(result.error.detail).toContain('EACCES');
    }
  });
});
