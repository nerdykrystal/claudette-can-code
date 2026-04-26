// H6 — Step History append-only JSONL R/W.
//
// Storage: `<plan_dir>/cdcc-step-history.jsonl`
//   Each line is a JSON object matching schemas/step-history-record.schema.json.
//
// Reads are bounded — we only need to detect a re-execution against PRIOR
// steps with matching (step_id, hash_of_inputs). To keep the scan O(N) cheap
// we tail the file (load all lines into memory; the file is intended to be
// scoped per-plan and not unbounded). For very large histories the future
// optimization is an in-memory hash index keyed by `${step_id}|${hash}`.

import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface StepHistoryRecord {
  ts: string;
  step_id: string;
  hash_of_inputs: string;
  tool: 'Write' | 'Edit' | 'Bash';
  agent_persona: string | null;
  authorized_by: string | null;       // gate-NN token if this was an authorized re-execution
  gate_ref: string | null;            // duplicate of authorized_by for backward compatibility
}

export interface StepHistoryReadResult {
  records: StepHistoryRecord[];
  corrupt_lines: number;              // count of lines that failed to parse
}

/**
 * Read all records from the step-history file.
 *
 * Graceful degradation: malformed lines are counted and skipped. If the file
 * does not exist we return an empty result rather than throwing.
 *
 * The optional `readFileImpl` parameter exists so the hook handler can inject
 * its own file-read function (for testability and to keep all I/O routed
 * through a single deps surface).
 */
export async function readStepHistory(
  historyPath: string,
  readFileImpl?: (path: string, encoding?: string) => Promise<string>,
): Promise<StepHistoryReadResult> {
  const reader = readFileImpl ?? ((p) => readFile(p, 'utf-8'));
  let content: string;
  try {
    content = await reader(historyPath, 'utf-8');
  } catch (err) {
    const fsErr = err as NodeJS.ErrnoException;
    if (fsErr.code === 'ENOENT') {
      return { records: [], corrupt_lines: 0 };
    }
    throw err;
  }

  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const records: StepHistoryRecord[] = [];
  let corrupt = 0;
  for (const line of lines) {
    try {
      const rec = JSON.parse(line) as StepHistoryRecord;
      // minimal shape validation; full validation lives in the JSON Schema
      if (
        typeof rec.step_id === 'string' &&
        typeof rec.hash_of_inputs === 'string' &&
        typeof rec.tool === 'string'
      ) {
        records.push(rec);
      } else {
        corrupt += 1;
      }
    } catch {
      corrupt += 1;
    }
  }
  return { records, corrupt_lines: corrupt };
}

/**
 * Predicate: any prior record matches the pending step's identity.
 */
export function isReExecution(
  records: StepHistoryRecord[],
  pending: { stepId: string; hashOfInputs: string },
): boolean {
  for (const rec of records) {
    if (rec.step_id === pending.stepId && rec.hash_of_inputs === pending.hashOfInputs) {
      return true;
    }
  }
  return false;
}

/**
 * Append a single record to the history file. Creates the parent directory
 * tree if missing. Append is the only mutation H6 ever performs on the file.
 */
export async function appendStepHistoryRecord(
  historyPath: string,
  record: StepHistoryRecord,
): Promise<void> {
  await mkdir(dirname(historyPath), { recursive: true });
  await appendFile(historyPath, JSON.stringify(record) + '\n', 'utf-8');
}
