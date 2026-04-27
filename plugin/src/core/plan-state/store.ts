// Stage 06 — PlanStateStore: HMAC-protected plan-state read/write.
// Per §3.06 spec + Stage 00 Findings 2, 10, 16.
// Uses proper-lockfile (async lock API with retry/backoff) for multi-process write
// coordination — closes M-stage05-lockfile-skip carry-forward from gate-62.
// Uses write-file-atomic for the HMAC sidecar.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import lockfile from 'proper-lockfile';
import writeFileAtomic from 'write-file-atomic';
import { generateAndStoreKey, loadKey, computeHmac, verifyHmac } from './hmac.js';
import type { PlanState, PlanStateOptions } from './types.js';
import type { PlanStateError } from './errors.js';
import type { Result } from './hmac.js';

export class PlanStateStore {
  constructor(private opts: PlanStateOptions) {}

  /**
   * Ensure the HMAC key exists (generate if missing).
   * Returns Result<Buffer, PlanStateError>.
   */
  private ensureKey(): Result<Buffer, PlanStateError> {
    const keyResult = loadKey(this.opts.hmacKeyPath);
    if (keyResult.ok) {
      return keyResult;
    }
    // Key not found: generate one
    if (keyResult.error.kind === 'key_not_found') {
      const key = generateAndStoreKey(this.opts.hmacKeyPath);
      return { ok: true, value: key };
    }
    // Wrong perms or other key error — map to hmac_mismatch
    return {
      ok: false,
      error: {
        kind: 'hmac_mismatch',
        message: keyResult.error.message,
      },
    };
  }

  /**
   * Read plan-state.json + .hmac sidecar; verify HMAC; fail-closed on mismatch.
   * Returns Result<PlanState, PlanStateError>.
   */
  read(): Result<PlanState, PlanStateError> {
    const { jsonPath } = this.opts;
    const hmacPath = jsonPath + '.hmac';

    if (!existsSync(jsonPath)) {
      return {
        ok: false,
        error: { kind: 'not_found', path: jsonPath, message: `plan-state.json not found at ${jsonPath}` },
      };
    }

    let rawJson: Buffer;
    try {
      rawJson = readFileSync(jsonPath);
    } catch (err) {
      return {
        ok: false,
        error: { kind: 'not_found', path: jsonPath, message: `Cannot read ${jsonPath}: ${String(err)}` },
      };
    }

    let state: PlanState;
    try {
      state = JSON.parse(rawJson.toString('utf-8')) as PlanState;
    } catch (err) {
      return {
        ok: false,
        error: { kind: 'malformed_json', message: `Cannot parse plan-state.json: ${String(err)}` },
      };
    }

    // Check HMAC sidecar
    if (!existsSync(hmacPath)) {
      return {
        ok: false,
        error: { kind: 'hmac_missing', message: `HMAC sidecar not found at ${hmacPath}` },
      };
    }

    const keyResult = this.ensureKey();
    if (!keyResult.ok) {
      return keyResult;
    }
    const key = keyResult.value;

    let storedSig: Buffer;
    try {
      storedSig = readFileSync(hmacPath);
    } catch (err) {
      return {
        ok: false,
        error: { kind: 'hmac_missing', message: `Cannot read HMAC sidecar at ${hmacPath}: ${String(err)}` },
      };
    }

    const valid = verifyHmac(rawJson, storedSig, key);
    if (!valid) {
      return {
        ok: false,
        error: { kind: 'hmac_mismatch', message: `HMAC verification failed for ${jsonPath}; possible tampering` },
      };
    }

    return { ok: true, value: state };
  }

  /**
   * Write plan-state.json with proper-lockfile retry/backoff coordination +
   * HMAC sidecar via write-file-atomic.
   * Uses async lock() with retries (closes M-stage05-lockfile-skip).
   * Returns Promise<Result<void, PlanStateError>>.
   */
  async write(state: PlanState): Promise<Result<void, PlanStateError>> {
    const { jsonPath } = this.opts;
    const hmacPath = jsonPath + '.hmac';

    // Ensure parent directory exists
    const dir = dirname(jsonPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // proper-lockfile requires the target file to exist before locking
    if (!existsSync(jsonPath)) {
      try {
        writeFileSync(jsonPath, '{}');
      } catch (err) {
        return {
          ok: false,
          error: { kind: 'not_found', path: jsonPath, message: `Cannot initialize plan-state.json: ${String(err)}` },
        };
      }
    }

    const keyResult = this.ensureKey();
    if (!keyResult.ok) {
      return keyResult;
    }
    const key = keyResult.value;

    // Acquire proper-lockfile lock with retry/backoff
    // Per §3.06 + Stage 00 Finding 10: process 1 holds lock; process 2 retries
    let release: (() => Promise<void>) | undefined;
    try {
      release = await lockfile(jsonPath, {
        retries: { retries: 5, minTimeout: 100, maxTimeout: 500 },
        stale: 10000,
      });
    } catch (err) {
      return {
        ok: false,
        error: { kind: 'not_found', path: jsonPath, message: `Cannot acquire lock on ${jsonPath}: ${String(err)}` },
      };
    }

    try {
      const rawJson = Buffer.from(JSON.stringify(state, null, 2), 'utf-8');
      const sig = computeHmac(rawJson, key);

      // Write JSON atomically
      writeFileAtomic.sync(jsonPath, rawJson);
      // Write HMAC sidecar atomically
      writeFileAtomic.sync(hmacPath, sig);

      return { ok: true, value: undefined };
    } catch (err) {
      return {
        ok: false,
        error: { kind: 'not_found', path: jsonPath, message: `Write failed for ${jsonPath}: ${String(err)}` },
      };
    } finally {
      if (release) {
        await release();
      }
    }
  }
}
