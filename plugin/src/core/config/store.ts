// CdccConfigStore — Stage 12. AVD-AC-22 Plugin Config Store.
// Persists to ~/.claude/plugins/cdcc/config.json with HMAC trailer (same pattern as Stage 06).
// Reserved namespace: cdcc.experimental.* for FUTURE flags only.
// cdcc.experimental.drr is NOT in this namespace per Q2-lock (A21 canonical per /asae v06).

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Result } from '../types/index.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConfigError =
  | { kind: 'not_found'; message: string }
  | { kind: 'malformed_json'; message: string }
  | { kind: 'hmac_mismatch'; message: string }
  | { kind: 'hmac_missing'; message: string }
  | { kind: 'write_failed'; message: string }
  | { kind: 'invalid_key'; message: string };

export interface CdccConfigDefaults {
  auditDbPath: string;
  planStatePath: string;
  hmacKeyPath: string;
}

export interface CdccConfig {
  /** Reserved for future experimental feature flags. drr is NOT here (Q2-lock). */
  experimental: Record<string, boolean>;
  defaults: CdccConfigDefaults;
}

export interface CdccConfigStoreOptions {
  /** Path to config JSON. Defaults to ~/.claude/plugins/cdcc/config.json */
  configPath?: string;
  /** Path to HMAC key. Defaults to ~/.claude/plugins/cdcc/config.hmac.key */
  hmacKeyPath?: string;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export function defaultConfigPath(): string {
  return join(homedir(), '.claude', 'plugins', 'cdcc', 'config.json');
}

export function defaultHmacKeyPath(): string {
  return join(homedir(), '.claude', 'plugins', 'cdcc', 'config.hmac.key');
}

export function defaultCdccConfig(): CdccConfig {
  const base = join(homedir(), '.claude', 'plugins', 'cdcc');
  return {
    experimental: {},
    defaults: {
      auditDbPath: join(base, 'audit.sqlite'),
      planStatePath: join(base, 'plan-state.json'),
      hmacKeyPath: join(base, 'hmac.key'),
    },
  };
}

// ─── HMAC helpers ────────────────────────────────────────────────────────────

function generateKey(keyPath: string): Buffer {
  const key = randomBytes(32);
  const dir = dirname(keyPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(keyPath, key);
  // chmod 0600 (advisory on Windows)
  try { chmodSync(keyPath, 0o600); } catch { /* ignored on Windows */ }
  return key;
}

function loadOrCreateKey(keyPath: string): Buffer {
  if (existsSync(keyPath)) {
    return readFileSync(keyPath);
  }
  return generateKey(keyPath);
}

function computeHmac(payload: Buffer, key: Buffer): Buffer {
  return createHmac('sha256', key).update(payload).digest();
}

function verifyHmac(payload: Buffer, sig: Buffer, key: Buffer): boolean {
  const expected = computeHmac(payload, key);
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(sig, expected);
}

// ─── CdccConfigStore ─────────────────────────────────────────────────────────

export class CdccConfigStore {
  private configPath: string;
  private hmacKeyPath: string;

  constructor(opts: CdccConfigStoreOptions = {}) {
    this.configPath = opts.configPath ?? defaultConfigPath();
    this.hmacKeyPath = opts.hmacKeyPath ?? defaultHmacKeyPath();
  }

  // ── Private read/write ──

  private readRaw(): Result<CdccConfig, ConfigError> {
    const hmacPath = this.configPath + '.hmac';

    if (!existsSync(this.configPath)) {
      return { ok: false, error: { kind: 'not_found', message: `Config not found at ${this.configPath}` } };
    }

    let rawJson: Buffer;
    try {
      rawJson = readFileSync(this.configPath);
    } catch (err) {
      return { ok: false, error: { kind: 'not_found', message: `Cannot read config: ${String(err)}` } };
    }

    if (!existsSync(hmacPath)) {
      return { ok: false, error: { kind: 'hmac_missing', message: `HMAC sidecar not found at ${hmacPath}` } };
    }

    let storedSig: Buffer;
    try {
      storedSig = readFileSync(hmacPath);
    } catch (err) {
      return { ok: false, error: { kind: 'hmac_missing', message: `Cannot read HMAC sidecar: ${String(err)}` } };
    }

    const key = loadOrCreateKey(this.hmacKeyPath);
    if (!verifyHmac(rawJson, storedSig, key)) {
      return { ok: false, error: { kind: 'hmac_mismatch', message: `HMAC verification failed for ${this.configPath}` } };
    }

    let cfg: CdccConfig;
    try {
      cfg = JSON.parse(rawJson.toString('utf-8')) as CdccConfig;
    } catch (err) {
      return { ok: false, error: { kind: 'malformed_json', message: `Cannot parse config JSON: ${String(err)}` } };
    }

    return { ok: true, value: cfg };
  }

  private writeRaw(cfg: CdccConfig): Result<void, ConfigError> {
    const hmacPath = this.configPath + '.hmac';
    const dir = dirname(this.configPath);

    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const key = loadOrCreateKey(this.hmacKeyPath);
      const rawJson = Buffer.from(JSON.stringify(cfg, null, 2), 'utf-8');
      const sig = computeHmac(rawJson, key);
      writeFileSync(this.configPath, rawJson);
      writeFileSync(hmacPath, sig);
      return { ok: true, value: undefined };
    } catch (err) {
      return { ok: false, error: { kind: 'write_failed', message: `Write failed: ${String(err)}` } };
    }
  }

  /** Load config from disk, or return defaults if not yet initialized. */
  private loadOrDefault(): CdccConfig {
    const result = this.readRaw();
    if (result.ok) return result.value;
    // not_found → return defaults (first-run)
    return defaultCdccConfig();
  }

  // ── Public API ──

  /**
   * Get a config value by dot-separated key (e.g., 'defaults.auditDbPath').
   * Returns undefined if the key does not exist.
   */
  get(key: string): unknown {
    const cfg = this.loadOrDefault();
    const parts = key.split('.');
    let cursor: unknown = cfg;
    for (const part of parts) {
      if (typeof cursor !== 'object' || cursor === null) return undefined;
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return cursor;
  }

  /**
   * Set a config value by dot-separated key.
   * Creates intermediate objects as needed.
   * Persists to disk with HMAC trailer.
   */
  set(key: string, value: unknown): Result<void, ConfigError> {
    if (!key || key.trim().length === 0) {
      return { ok: false, error: { kind: 'invalid_key', message: 'Key must be a non-empty string' } };
    }

    const cfg = this.loadOrDefault();
    const parts = key.split('.');
    let cursor: Record<string, unknown> = cfg as unknown as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof cursor[part] !== 'object' || cursor[part] === null) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }

    cursor[parts[parts.length - 1]] = value;
    return this.writeRaw(cfg);
  }

  /**
   * Return the full config object (merged with defaults for missing keys).
   */
  list(): CdccConfig {
    return this.loadOrDefault();
  }

  /**
   * Reset config to defaults and persist.
   */
  reset(): Result<void, ConfigError> {
    return this.writeRaw(defaultCdccConfig());
  }
}
