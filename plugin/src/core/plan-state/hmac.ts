// Stage 06 — HMAC-SHA256 key management + signing + timing-safe verification.
// Per §3.06 spec + Stage 00 Finding 2.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { KeyError } from './errors.js';

// Result type (§0 standard error pattern)
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Generate a 32-byte random HMAC key, write it to keyPath with mode 0600.
 * Creates parent directories if needed.
 * Returns the generated key.
 */
export function generateAndStoreKey(keyPath: string): Buffer {
  const key = randomBytes(32);
  const dir = dirname(keyPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(keyPath, key);
  chmodSync(keyPath, 0o600);
  return key;
}

/**
 * Load existing HMAC key from keyPath.
 * Verifies file exists and has mode 0600.
 * Returns Result<Buffer, KeyError>.
 */
export function loadKey(keyPath: string): Result<Buffer, KeyError> {
  if (!existsSync(keyPath)) {
    return {
      ok: false,
      error: { kind: 'key_not_found', path: keyPath, message: `HMAC key not found at ${keyPath}` },
    };
  }

  const stat = statSync(keyPath);
  const mode = stat.mode & 0o777;
  // On Windows, chmod is advisory and mode may read back as 0o666 for files even after chmod 0600.
  // We enforce strict 0o600 check on POSIX; on Windows we accept 0o600 or 0o666 for test portability.
  const isWindows = process.platform === 'win32';
  const permOk = isWindows ? (mode === 0o600 || mode === 0o666) : mode === 0o600;

  if (!permOk) {
    return {
      ok: false,
      error: {
        kind: 'key_wrong_perms',
        path: keyPath,
        mode,
        message: `HMAC key at ${keyPath} has mode ${mode.toString(8)}; expected 0600`,
      },
    };
  }

  const key = readFileSync(keyPath);
  return { ok: true, value: key };
}

/**
 * Compute HMAC-SHA256 of payload with key.
 * Returns the raw HMAC digest as a Buffer.
 */
export function computeHmac(payload: Buffer, key: Buffer): Buffer {
  return createHmac('sha256', key).update(payload).digest();
}

/**
 * Verify HMAC-SHA256 signature against payload + key.
 * Uses timingSafeEqual to prevent timing attacks.
 * Returns true if valid, false if tampered.
 */
export function verifyHmac(payload: Buffer, signature: Buffer, key: Buffer): boolean {
  const expected = computeHmac(payload, key);
  if (signature.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(signature, expected);
}
