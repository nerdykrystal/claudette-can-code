import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readStepHistory,
  isReExecution,
  appendStepHistoryRecord,
  type StepHistoryRecord,
} from '../../src/hooks/h6-step-reexec/step-history.js';

describe('H6 step-history (JSONL R/W)', () => {
  let testDir: string;
  let historyPath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'h6-history-'));
    historyPath = join(testDir, 'cdcc-step-history.jsonl');
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  function record(overrides: Partial<StepHistoryRecord> = {}): StepHistoryRecord {
    return {
      ts: '2026-04-26T10:00:00Z',
      step_id: 'Write::a.ts',
      hash_of_inputs: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      tool: 'Write',
      agent_persona: null,
      authorized_by: null,
      gate_ref: null,
      ...overrides,
    };
  }

  describe('readStepHistory', () => {
    it('returns empty result on missing file', async () => {
      const out = await readStepHistory(historyPath);
      expect(out.records).toEqual([]);
      expect(out.corrupt_lines).toBe(0);
    });

    it('reads well-formed records', async () => {
      const a = record({ step_id: 'Write::a.ts' });
      const b = record({ step_id: 'Write::b.ts' });
      await writeFile(historyPath, [JSON.stringify(a), JSON.stringify(b)].join('\n') + '\n', 'utf-8');
      const out = await readStepHistory(historyPath);
      expect(out.records).toHaveLength(2);
      expect(out.records[0].step_id).toBe('Write::a.ts');
      expect(out.records[1].step_id).toBe('Write::b.ts');
    });

    it('counts and skips malformed JSON lines', async () => {
      const valid = JSON.stringify(record());
      const corrupt = '{ not json';
      await writeFile(historyPath, [valid, corrupt, ''].join('\n'), 'utf-8');
      const out = await readStepHistory(historyPath);
      expect(out.records).toHaveLength(1);
      expect(out.corrupt_lines).toBe(1);
    });

    it('counts records with missing fields as corrupt', async () => {
      const partial = JSON.stringify({ step_id: 'x' }); // missing hash_of_inputs/tool
      const valid = JSON.stringify(record());
      await writeFile(historyPath, [partial, valid].join('\n'), 'utf-8');
      const out = await readStepHistory(historyPath);
      expect(out.records).toHaveLength(1);
      expect(out.corrupt_lines).toBe(1);
    });

    it('handles CRLF line endings', async () => {
      const a = JSON.stringify(record());
      await writeFile(historyPath, a + '\r\n', 'utf-8');
      const out = await readStepHistory(historyPath);
      expect(out.records).toHaveLength(1);
    });

    it('rethrows non-ENOENT read errors', async () => {
      // Pass a path that exists as a directory (not a file) to force a non-ENOENT error
      await expect(readStepHistory(testDir)).rejects.toThrow();
    });
  });

  describe('isReExecution', () => {
    it('matches on (step_id, hash_of_inputs) tuple', () => {
      const recs = [record({ step_id: 'Write::a.ts', hash_of_inputs: 'sha256:abc' })];
      expect(
        isReExecution(recs, { stepId: 'Write::a.ts', hashOfInputs: 'sha256:abc' }),
      ).toBe(true);
    });

    it('does not match when step_id differs', () => {
      const recs = [record({ step_id: 'Write::a.ts', hash_of_inputs: 'sha256:abc' })];
      expect(
        isReExecution(recs, { stepId: 'Write::b.ts', hashOfInputs: 'sha256:abc' }),
      ).toBe(false);
    });

    it('does not match when hash differs', () => {
      const recs = [record({ step_id: 'Write::a.ts', hash_of_inputs: 'sha256:abc' })];
      expect(
        isReExecution(recs, { stepId: 'Write::a.ts', hashOfInputs: 'sha256:def' }),
      ).toBe(false);
    });

    it('returns false on empty record list', () => {
      expect(isReExecution([], { stepId: 'x', hashOfInputs: 'y' })).toBe(false);
    });
  });

  describe('appendStepHistoryRecord', () => {
    it('creates parent dir and appends record', async () => {
      const nested = join(testDir, 'nested', 'deep', 'cdcc-step-history.jsonl');
      await appendStepHistoryRecord(nested, record({ step_id: 'Write::x.ts' }));
      const out = await readFile(nested, 'utf-8');
      expect(out).toContain('Write::x.ts');
      expect(out).toMatch(/\n$/);
    });

    it('appends multiple records preserving order', async () => {
      await appendStepHistoryRecord(historyPath, record({ step_id: 'Write::a.ts' }));
      await appendStepHistoryRecord(historyPath, record({ step_id: 'Write::b.ts' }));
      const out = await readFile(historyPath, 'utf-8');
      const lines = out.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).step_id).toBe('Write::a.ts');
      expect(JSON.parse(lines[1]).step_id).toBe('Write::b.ts');
    });

    it('roundtrips through readStepHistory', async () => {
      await appendStepHistoryRecord(historyPath, record({ step_id: 'Write::r.ts' }));
      const out = await readStepHistory(historyPath);
      expect(out.records).toHaveLength(1);
      expect(out.records[0].step_id).toBe('Write::r.ts');
      expect(out.corrupt_lines).toBe(0);
    });
  });
});
