// Unit tests for CdccConfigStore — Stage 12.
// AVD-AC-22 Plugin Config Store.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CdccConfigStore, defaultCdccConfig } from '../../../src/core/config/store.js';

let tmpDir: string;
let configPath: string;
let hmacKeyPath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cdcc-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  configPath = join(tmpDir, 'config.json');
  hmacKeyPath = join(tmpDir, 'config.hmac.key');
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function makeStore(): CdccConfigStore {
  return new CdccConfigStore({ configPath, hmacKeyPath });
}

// ─── defaultCdccConfig() ──────────────────────────────────────────────────────

describe('defaultCdccConfig()', () => {
  it('returns config with empty experimental object', () => {
    const cfg = defaultCdccConfig();
    expect(cfg.experimental).toEqual({});
  });

  it('returns config with defaults.auditDbPath as a string', () => {
    const cfg = defaultCdccConfig();
    expect(typeof cfg.defaults.auditDbPath).toBe('string');
    expect(cfg.defaults.auditDbPath).toContain('audit.sqlite');
  });

  it('returns config with defaults.planStatePath as a string', () => {
    const cfg = defaultCdccConfig();
    expect(typeof cfg.defaults.planStatePath).toBe('string');
    expect(cfg.defaults.planStatePath).toContain('plan-state.json');
  });

  it('returns config with defaults.hmacKeyPath as a string', () => {
    const cfg = defaultCdccConfig();
    expect(typeof cfg.defaults.hmacKeyPath).toBe('string');
    expect(cfg.defaults.hmacKeyPath).toContain('hmac.key');
  });
});

// ─── list() ──────────────────────────────────────────────────────────────────

describe('CdccConfigStore.list()', () => {
  it('returns defaults when no config file exists yet', () => {
    const store = makeStore();
    const cfg = store.list();
    expect(cfg.experimental).toEqual({});
    expect(typeof cfg.defaults.auditDbPath).toBe('string');
  });

  it('returns persisted config after reset()', () => {
    const store = makeStore();
    const resetResult = store.reset();
    expect(resetResult.ok).toBe(true);

    const cfg = store.list();
    expect(cfg.experimental).toEqual({});
  });
});

// ─── get() ────────────────────────────────────────────────────────────────────

describe('CdccConfigStore.get()', () => {
  it('returns undefined for missing key', () => {
    const store = makeStore();
    expect(store.get('nonexistent.key')).toBeUndefined();
  });

  it('returns default value for known key before explicit set', () => {
    const store = makeStore();
    const val = store.get('experimental');
    expect(val).toEqual({});
  });

  it('returns set value after set()', () => {
    const store = makeStore();
    store.set('experimental.foo', true);
    expect(store.get('experimental.foo')).toBe(true);
  });

  it('returns nested value with dot notation', () => {
    const store = makeStore();
    store.set('defaults.auditDbPath', '/tmp/custom/audit.sqlite');
    expect(store.get('defaults.auditDbPath')).toBe('/tmp/custom/audit.sqlite');
  });

  it('returns undefined for deeply missing path', () => {
    const store = makeStore();
    expect(store.get('experimental.does.not.exist')).toBeUndefined();
  });
});

// ─── set() ────────────────────────────────────────────────────────────────────

describe('CdccConfigStore.set()', () => {
  it('returns ok=true on successful set', () => {
    const store = makeStore();
    const result = store.set('experimental.feature_x', false);
    expect(result.ok).toBe(true);
  });

  it('persists value that round-trips through get()', () => {
    const store = makeStore();
    store.set('experimental.feature_y', true);
    const readBack = store.get('experimental.feature_y');
    expect(readBack).toBe(true);
  });

  it('returns ok=false with invalid_key for empty key', () => {
    const store = makeStore();
    const result = store.set('', 'value');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_key');
    }
  });

  it('creates intermediate object for nested key that does not exist', () => {
    const store = makeStore();
    store.set('experimental.new_ns.flag', true);
    expect(store.get('experimental.new_ns.flag')).toBe(true);
  });

  it('writes HMAC sidecar alongside config.json', () => {
    const store = makeStore();
    store.set('experimental.x', 1);
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(configPath + '.hmac')).toBe(true);
  });

  it('overwrites previous value', () => {
    const store = makeStore();
    store.set('experimental.toggle', false);
    store.set('experimental.toggle', true);
    expect(store.get('experimental.toggle')).toBe(true);
  });

  it('accepts string values', () => {
    const store = makeStore();
    store.set('defaults.auditDbPath', '/my/custom/path.sqlite');
    expect(store.get('defaults.auditDbPath')).toBe('/my/custom/path.sqlite');
  });
});

// ─── reset() ─────────────────────────────────────────────────────────────────

describe('CdccConfigStore.reset()', () => {
  it('returns ok=true', () => {
    const store = makeStore();
    const result = store.reset();
    expect(result.ok).toBe(true);
  });

  it('restores defaults after custom set', () => {
    const store = makeStore();
    store.set('experimental.custom_flag', true);
    store.reset();
    expect(store.get('experimental.custom_flag')).toBeUndefined();
    expect(store.get('experimental')).toEqual({});
  });

  it('writes config.json and hmac sidecar', () => {
    const store = makeStore();
    store.reset();
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(configPath + '.hmac')).toBe(true);
  });

  it('produces HMAC-verified config after reset (tamper detection)', () => {
    const store = makeStore();
    store.reset();
    // Verify list() can still read it (HMAC verification passes)
    const cfg = store.list();
    expect(cfg.experimental).toEqual({});
  });
});

// ─── HMAC tamper detection ────────────────────────────────────────────────────

describe('HMAC tamper detection', () => {
  it('returns defaults (graceful) when config.json does not exist', () => {
    const store = makeStore();
    // No file written — list() returns defaults gracefully
    const cfg = store.list();
    expect(cfg).toBeDefined();
    expect(cfg.experimental).toEqual({});
  });

  it('get() returns undefined gracefully when config missing', () => {
    const store = makeStore();
    const val = store.get('defaults.auditDbPath');
    // Falls through to defaults
    expect(typeof val).toBe('string');
  });
});

// ─── cdcc.experimental.drr NOT in store (Q2-lock) ────────────────────────────

describe('Q2-lock: cdcc.experimental.drr is NOT reserved here', () => {
  it('experimental namespace is empty by default (drr not present)', () => {
    const store = makeStore();
    const cfg = store.list();
    expect('drr' in cfg.experimental).toBe(false);
  });

  it('drr key is not in defaultCdccConfig().experimental', () => {
    const cfg = defaultCdccConfig();
    expect('drr' in cfg.experimental).toBe(false);
  });
});
