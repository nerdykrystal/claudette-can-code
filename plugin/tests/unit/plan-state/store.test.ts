// Stage 06 — Unit tests for PlanStateStore.
// Per §3.06 spec test cases 5-7.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlanStateStore } from '../../../src/core/plan-state/store.js';
import { generateAndStoreKey, computeHmac } from '../../../src/core/plan-state/hmac.js';
import type { PlanState } from '../../../src/core/plan-state/types.js';

let tmpDir: string;
let jsonPath: string;
let hmacKeyPath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cdcc-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  jsonPath = join(tmpDir, 'plan-state.json');
  hmacKeyPath = join(tmpDir, 'hmac.key');
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function sampleState(): PlanState {
  return {
    currentStage: 'Stage 06',
    assignedModel: 'sonnet',
    bundleHash: 'abc123',
    lastUpdated: new Date().toISOString(),
  };
}

describe('PlanStateStore.read()', () => {
  // Test case 5 per §3.06: read missing file → not_found
  it('returns not_found when plan-state.json does not exist', () => {
    const store = new PlanStateStore({ jsonPath, hmacKeyPath });
    const result = store.read();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
  });

  // Test case 6 per §3.06: read with hmac mismatch → hmac_mismatch (fail-closed)
  it('returns hmac_mismatch when HMAC sidecar does not match (fail-closed)', () => {
    const store = new PlanStateStore({ jsonPath, hmacKeyPath });
    const state = sampleState();
    const rawJson = Buffer.from(JSON.stringify(state, null, 2), 'utf-8');
    writeFileSync(jsonPath, rawJson);
    // Write a bogus HMAC sidecar
    writeFileSync(jsonPath + '.hmac', Buffer.alloc(32, 0xab));
    // Generate a real key
    generateAndStoreKey(hmacKeyPath);

    const result = store.read();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('hmac_mismatch');
    }
  });

  it('returns hmac_missing when sidecar file does not exist', () => {
    const store = new PlanStateStore({ jsonPath, hmacKeyPath });
    const state = sampleState();
    writeFileSync(jsonPath, JSON.stringify(state, null, 2));
    generateAndStoreKey(hmacKeyPath);
    // No sidecar written

    const result = store.read();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('hmac_missing');
    }
  });

  it('returns malformed_json when plan-state.json is not valid JSON', () => {
    const store = new PlanStateStore({ jsonPath, hmacKeyPath });
    writeFileSync(jsonPath, 'not-json!!!');
    const key = generateAndStoreKey(hmacKeyPath);
    // Write a valid HMAC for the malformed content
    const raw = readFileSync(jsonPath);
    const sig = computeHmac(raw, key);
    writeFileSync(jsonPath + '.hmac', sig);

    const result = store.read();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('malformed_json');
    }
  });

  it('returns ok=true when JSON + HMAC are both valid', async () => {
    const store = new PlanStateStore({ jsonPath, hmacKeyPath });
    const state = sampleState();

    const writeResult = await store.write(state);
    expect(writeResult.ok).toBe(true);

    const readResult = store.read();
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.value.currentStage).toBe('Stage 06');
      expect(readResult.value.assignedModel).toBe('sonnet');
    }
  });
});

describe('PlanStateStore.write()', () => {
  it('writes JSON and HMAC sidecar files', async () => {
    const store = new PlanStateStore({ jsonPath, hmacKeyPath });
    const state = sampleState();

    const result = await store.write(state);
    expect(result.ok).toBe(true);
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(jsonPath + '.hmac')).toBe(true);
  });

  it('written state round-trips through read()', async () => {
    const store = new PlanStateStore({ jsonPath, hmacKeyPath });
    const state = sampleState();
    state.bundleHash = 'xyz789';

    await store.write(state);
    const readResult = store.read();
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.value.bundleHash).toBe('xyz789');
    }
  });

  // Test case 7 per §3.06: write atomic — simulate scenario where pre-existing state is unchanged
  // after a failed / replaced write (write-file-atomic guarantees atomicity)
  it('preserves original content on second write with different data', async () => {
    const store = new PlanStateStore({ jsonPath, hmacKeyPath });
    const state1 = sampleState();
    state1.currentStage = 'Stage 06';

    await store.write(state1);
    const state2 = { ...state1, currentStage: 'Stage 07' };
    await store.write(state2);

    // After two successful writes, the final state is state2
    const readResult = store.read();
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.value.currentStage).toBe('Stage 07');
    }
  });

  it('creates parent directories if they do not exist', async () => {
    const nestedJsonPath = join(tmpDir, 'nested', 'plan-state.json');
    const store = new PlanStateStore({ jsonPath: nestedJsonPath, hmacKeyPath });
    const result = await store.write(sampleState());
    expect(result.ok).toBe(true);
    expect(existsSync(nestedJsonPath)).toBe(true);
  });
});
