// Unit tests for cdcc config subcommand — Stage 12.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleConfig } from '../../../../src/cli/commands/config.js';

let tmpDir: string;
let configPath: string;
let hmacKeyPath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cdcc-config-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  configPath = join(tmpDir, 'config.json');
  hmacKeyPath = join(tmpDir, 'config.hmac.key');
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function makeOpts() {
  return { configPath, hmacKeyPath };
}

// ─── Usage errors ─────────────────────────────────────────────────────────────

describe('handleConfig — usage errors', () => {
  it('returns 1 when no subcommand given', async () => {
    const code = await handleConfig(undefined, [], makeOpts());
    expect(code).toBe(1);
  });

  it('returns 1 for unknown subcommand', async () => {
    const code = await handleConfig('unknown', [], makeOpts());
    expect(code).toBe(1);
  });

  it('returns 1 for get without key', async () => {
    const code = await handleConfig('get', [], makeOpts());
    expect(code).toBe(1);
  });

  it('returns 1 for set without key', async () => {
    const code = await handleConfig('set', [], makeOpts());
    expect(code).toBe(1);
  });

  it('returns 1 for set without value', async () => {
    const code = await handleConfig('set', ['some.key'], makeOpts());
    expect(code).toBe(1);
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe('handleConfig list', () => {
  it('returns 0 for list with no config file (defaults)', async () => {
    const code = await handleConfig('list', [], makeOpts());
    expect(code).toBe(0);
  });

  it('returns 0 after reset', async () => {
    await handleConfig('reset', [], makeOpts());
    const code = await handleConfig('list', [], makeOpts());
    expect(code).toBe(0);
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('handleConfig reset', () => {
  it('returns 0 on reset', async () => {
    const code = await handleConfig('reset', [], makeOpts());
    expect(code).toBe(0);
  });

  it('creates config.json after reset', async () => {
    await handleConfig('reset', [], makeOpts());
    expect(existsSync(configPath)).toBe(true);
  });
});

// ─── set ──────────────────────────────────────────────────────────────────────

describe('handleConfig set', () => {
  it('returns 0 for valid set', async () => {
    const code = await handleConfig('set', ['experimental.feature_x', 'true'], makeOpts());
    expect(code).toBe(0);
  });

  it('parses JSON value true', async () => {
    await handleConfig('set', ['experimental.bool_flag', 'true'], makeOpts());
    const code = await handleConfig('get', ['experimental.bool_flag'], makeOpts());
    expect(code).toBe(0);
  });

  it('parses JSON value 42', async () => {
    const code = await handleConfig('set', ['experimental.count', '42'], makeOpts());
    expect(code).toBe(0);
  });

  it('treats non-JSON value as string', async () => {
    const code = await handleConfig('set', ['defaults.auditDbPath', '/tmp/custom.sqlite'], makeOpts());
    expect(code).toBe(0);
  });

  it('returns 2 for empty key (invalid_key)', async () => {
    const code = await handleConfig('set', ['', 'val'], makeOpts());
    expect(code).toBe(2);
  });
});

// ─── get ──────────────────────────────────────────────────────────────────────

describe('handleConfig get', () => {
  it('returns 0 for existing key', async () => {
    await handleConfig('set', ['experimental.x', 'true'], makeOpts());
    const code = await handleConfig('get', ['experimental.x'], makeOpts());
    expect(code).toBe(0);
  });

  it('returns 3 for missing key', async () => {
    const code = await handleConfig('get', ['nonexistent.key'], makeOpts());
    expect(code).toBe(3);
  });

  it('returns 0 for default key (falls through to defaults)', async () => {
    const code = await handleConfig('get', ['experimental'], makeOpts());
    expect(code).toBe(0);
  });
});
