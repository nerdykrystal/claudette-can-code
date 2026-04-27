// Stage 06 — Property tests for HMAC functions via fast-check.
// Per §3.06 spec property test cases 1-2 + integration lockfile retry test.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeHmac, verifyHmac } from '../../../src/core/plan-state/hmac.js';
import { PlanStateStore } from '../../../src/core/plan-state/store.js';
import type { PlanState } from '../../../src/core/plan-state/types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cdcc-hmac-prop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('HMAC properties', () => {
  // Property 1 per §3.06: ∀ payloads p, verifyHmac(p, computeHmac(p, k), k) === true
  it('Property 1: round-trip always ok for any payload with any 32-byte key', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 1024 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        (payloadArr, keyArr) => {
          const payload = Buffer.from(payloadArr);
          const key = Buffer.from(keyArr);
          const sig = computeHmac(payload, key);
          expect(verifyHmac(payload, sig, key)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Property 2 per §3.06: ∀ p ≠ p', verifyHmac(p, computeHmac(p', k), k) === false
  // (collision resistance: HMAC for different payloads should not match)
  it('Property 2: different payloads produce distinct HMAC signatures (collision resistance)', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 512 }),
        fc.uint8Array({ minLength: 1, maxLength: 512 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        (payloadArr1, payloadArr2, keyArr) => {
          const p1 = Buffer.from(payloadArr1);
          const p2 = Buffer.from(payloadArr2);
          // Only test when payloads are genuinely different
          fc.pre(!p1.equals(p2));
          const key = Buffer.from(keyArr);
          const sig2 = computeHmac(p2, key);
          // A HMAC computed for p2 must not verify for p1
          expect(verifyHmac(p1, sig2, key)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('PlanStateStore proper-lockfile retry/backoff integration', () => {
  // Integration test: closes M-stage05-lockfile-skip
  // Per §3.06 + §3.05 missing test #2: process 1 holds lock; process 2 retries with backoff;
  // eventually both succeed.
  // We simulate this in-process: start write #1 (hold lock) and concurrently start write #2
  // (must retry until lock released). Both should complete successfully.
  it('concurrent writes via proper-lockfile: both succeed with retry/backoff', async () => {
    const jsonPath = join(tmpDir, 'plan-state.json');
    const hmacKeyPath = join(tmpDir, 'hmac.key');

    const store = new PlanStateStore({ jsonPath, hmacKeyPath });

    function makeState(stage: string): PlanState {
      return {
        currentStage: stage,
        assignedModel: 'sonnet',
        bundleHash: 'abc',
        lastUpdated: new Date().toISOString(),
      };
    }

    // Perform two concurrent writes — proper-lockfile with retries handles contention
    const [r1, r2] = await Promise.all([
      store.write(makeState('Stage 06-A')),
      store.write(makeState('Stage 06-B')),
    ]);

    // Both writes should succeed (one serialized after the other via lockfile)
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    // Final file is readable and HMAC-valid
    const readResult = store.read();
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      // The final stage is one of the two writes (whichever won the lock last)
      expect(['Stage 06-A', 'Stage 06-B']).toContain(readResult.value.currentStage);
    }
  });

  it('sequential writes accumulate correctly', async () => {
    const jsonPath = join(tmpDir, 'plan-state.json');
    const hmacKeyPath = join(tmpDir, 'hmac.key');
    const store = new PlanStateStore({ jsonPath, hmacKeyPath });

    const state: PlanState = {
      currentStage: 'Stage 06',
      assignedModel: 'sonnet',
      bundleHash: 'initial',
      lastUpdated: new Date().toISOString(),
    };

    await store.write(state);
    state.bundleHash = 'updated';
    await store.write(state);

    const readResult = store.read();
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.value.bundleHash).toBe('updated');
    }
  });
});
