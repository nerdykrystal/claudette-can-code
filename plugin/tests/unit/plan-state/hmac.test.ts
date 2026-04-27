// Stage 06 — Unit tests for HMAC module.
// Per §3.06 spec test cases 1-4.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { generateAndStoreKey, loadKey, computeHmac, verifyHmac } from '../../../src/core/plan-state/hmac.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cdcc-hmac-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('generateAndStoreKey', () => {
  // Test case 1 per §3.06: generateAndStoreKey writes 32 bytes; chmod 0600 verified
  it('writes a 32-byte key and sets mode 0600', () => {
    const keyPath = join(tmpDir, 'hmac.key');
    const key = generateAndStoreKey(keyPath);

    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
    expect(existsSync(keyPath)).toBe(true);

    const stat = statSync(keyPath);
    const mode = stat.mode & 0o777;
    // On Windows chmod is advisory; accept 0o600 or 0o666
    const isWindows = process.platform === 'win32';
    if (!isWindows) {
      expect(mode).toBe(0o600);
    } else {
      expect(mode === 0o600 || mode === 0o666).toBe(true);
    }
  });

  it('creates parent directories if they do not exist', () => {
    const keyPath = join(tmpDir, 'nested', 'sub', 'hmac.key');
    generateAndStoreKey(keyPath);
    expect(existsSync(keyPath)).toBe(true);
  });
});

describe('loadKey', () => {
  it('returns ok=true when key exists with correct permissions', () => {
    const keyPath = join(tmpDir, 'hmac.key');
    const generated = generateAndStoreKey(keyPath);
    const result = loadKey(keyPath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(generated);
    }
  });

  it('returns key_not_found when file does not exist', () => {
    const keyPath = join(tmpDir, 'nonexistent.key');
    const result = loadKey(keyPath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('key_not_found');
    }
  });
});

describe('computeHmac + verifyHmac', () => {
  let key: Buffer;

  beforeEach(() => {
    key = randomBytes(32);
  });

  // Test case 2 per §3.06: round-trip ok=true
  it('round-trip: verifyHmac returns true for correct payload + signature + key', () => {
    const payload = Buffer.from('{"currentStage":"Stage 06"}', 'utf-8');
    const sig = computeHmac(payload, key);
    expect(verifyHmac(payload, sig, key)).toBe(true);
  });

  // Test case 3 per §3.06: tampered payload → false
  it('returns false when payload is tampered', () => {
    const payload = Buffer.from('{"currentStage":"Stage 06"}', 'utf-8');
    const sig = computeHmac(payload, key);
    const tampered = Buffer.from('{"currentStage":"Stage 07"}', 'utf-8');
    expect(verifyHmac(tampered, sig, key)).toBe(false);
  });

  // Test case 4 per §3.06: tampered signature → false (timing-safe)
  it('returns false when signature is tampered (timing-safe via timingSafeEqual)', () => {
    const payload = Buffer.from('{"currentStage":"Stage 06"}', 'utf-8');
    const sig = computeHmac(payload, key);
    // Flip one byte in the signature
    const tamperedSig = Buffer.from(sig);
    tamperedSig[0] = (tamperedSig[0] + 1) % 256;
    expect(verifyHmac(payload, tamperedSig, key)).toBe(false);
  });

  it('returns false for wrong-length signature', () => {
    const payload = Buffer.from('test payload', 'utf-8');
    const sig = computeHmac(payload, key);
    const shortSig = sig.slice(0, sig.length - 1);
    expect(verifyHmac(payload, shortSig, key)).toBe(false);
  });

  it('returns false with a different key', () => {
    const payload = Buffer.from('test payload', 'utf-8');
    const sig = computeHmac(payload, key);
    const otherKey = randomBytes(32);
    expect(verifyHmac(payload, sig, otherKey)).toBe(false);
  });

  it('returns deterministic signatures for same input', () => {
    const payload = Buffer.from('deterministic', 'utf-8');
    const sig1 = computeHmac(payload, key);
    const sig2 = computeHmac(payload, key);
    expect(sig1).toEqual(sig2);
  });
});
