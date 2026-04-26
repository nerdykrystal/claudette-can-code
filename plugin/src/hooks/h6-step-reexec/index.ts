// H6 — Step-Re-Execution Guard. ASAE Aspect 13 / FM-1.3 elevation.
//
// PreToolUse hook: tool-time forward defender for step-bounded idempotency.
// Pairs with commit-msg hook v05 Tier 1c-extended mode-conditional (the
// commit-time backstop). See `_grand_repo/docs/CDCC_H6_Spec_2026-04-26_v01_I.md`.
//
// Exit codes: 0 (allow) or 1 (block / halt).

import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AuditLogger } from '../../core/audit/index.js';
import type { AuditLogEntry } from '../../core/audit/index.js';
import {
  computeStepIdentity,
  isSupportedTool,
  type SupportedTool,
} from './step-identity.js';
import {
  parseAuthorizationFile,
  findMatchingAuthorization,
} from './authority-check.js';
import {
  readStepHistory,
  isReExecution,
  type StepHistoryRecord,
} from './step-history.js';

export interface HandleDeps {
  readFile: (path: string, encoding?: string) => Promise<string>;
  appendFile: (path: string, content: string) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  stdinReader: () => Promise<string>;
  auditLogger: AuditLogger;
  exit: (code: number) => never;
  stderrWrite: (msg: string) => void;
  planDir: string;
}

export interface HandleResult {
  exitCode: number;
  audit: AuditLogEntry;
}

interface PreToolUsePayload {
  tool?: string;
  args?: Record<string, unknown>;
  agent_persona?: string;
}

/**
 * H6 handler: read PreToolUse stdin payload. If tool is not in
 * {Write, Edit, Bash}, allow. Else compute step identity and consult
 * step-history. If matching prior step found, look for authorization in
 * the sidecar file; allow if matched, block if not. New steps are
 * recorded to the history.
 *
 * Graceful-degradation contract: a corrupt history file logs corrupt_lines
 * count in the audit payload but does NOT halt. The pending invocation
 * is still evaluated against any successfully-parsed prior records.
 */
export async function handleImpl(deps: HandleDeps): Promise<HandleResult> {
  const ts = new Date().toISOString();

  try {
    const payload = await deps.stdinReader();
    const hook = JSON.parse(payload) as PreToolUsePayload;
    const tool = hook.tool;
    const args = hook.args ?? {};
    const agentPersona = hook.agent_persona ?? null;

    // Out-of-scope tools: allow without recording (read-only / non-destructive)
    if (!isSupportedTool(tool)) {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H6',
        stage: null,
        decision: 'allow',
        rationale: `H6 only applies to Write/Edit/Bash; tool is ${tool ?? 'unset'}`,
        payload: { tool: tool ?? null },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    }

    const identity = computeStepIdentity(tool, args);
    const historyPath = join(deps.planDir, 'cdcc-step-history.jsonl');
    const authorizationPath = join(deps.planDir, 'cdcc-step-reexec-authorization.txt');

    // Read history (graceful on missing / corrupt)
    let history: { records: StepHistoryRecord[]; corrupt_lines: number };
    try {
      history = await readStepHistory(historyPath, deps.readFile);
    } catch (err) {
      // Read error other than ENOENT (which readStepHistory handles): treat
      // as no-history so we don't block on transient FS issues.
      const detail = err instanceof Error ? err.message : String(err);
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H6',
        stage: null,
        decision: 'allow',
        rationale: `H6 step-history unreadable; allow with degraded enforcement: ${detail}`,
        payload: {
          tool,
          step_id: identity.step_id,
          hash_of_inputs: identity.hash_of_inputs,
          history_read_error: detail,
        },
      };
      await deps.auditLogger.log(audit);
      // Best-effort append of the new step
      await safeAppend(deps, historyPath, identity, tool, agentPersona, null);
      return { exitCode: 0, audit };
    }

    const reexec = isReExecution(history.records, {
      stepId: identity.step_id,
      hashOfInputs: identity.hash_of_inputs,
    });

    if (!reexec) {
      // Fresh / new step: allow + record
      await safeAppend(deps, historyPath, identity, tool, agentPersona, null);
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H6',
        stage: null,
        decision: 'allow',
        rationale: 'Fresh step (no prior matching identity); allow and record',
        payload: {
          tool,
          step_id: identity.step_id,
          hash_of_inputs: identity.hash_of_inputs,
          corrupt_history_lines: history.corrupt_lines,
        },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    }

    // Re-execution: require authorization
    let authContent = '';
    try {
      authContent = await deps.readFile(authorizationPath, 'utf-8');
    } catch {
      // No authorization file present
    }
    const authorizations = parseAuthorizationFile(authContent);
    const matched = findMatchingAuthorization(authorizations, {
      stepId: identity.step_id,
      hashOfInputs: identity.hash_of_inputs,
    });

    if (matched) {
      await safeAppend(deps, historyPath, identity, tool, agentPersona, matched.gateRef);
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H6',
        stage: null,
        decision: 'allow',
        rationale: `Authorized re-execution under ${matched.gateRef}: "${matched.rationale}"`,
        payload: {
          tool,
          step_id: identity.step_id,
          hash_of_inputs: identity.hash_of_inputs,
          authorization: {
            gate_ref: matched.gateRef,
            rationale: matched.rationale,
            raw_line: matched.rawLine,
          },
          corrupt_history_lines: history.corrupt_lines,
        },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    }

    // Re-execution without authorization: block
    const message =
      `H6 BLOCK: Step re-execution detected without authorization.\n` +
      `  step_id:        ${identity.step_id}\n` +
      `  hash_of_inputs: ${identity.hash_of_inputs}\n` +
      `\n` +
      `Either (a) author a gate audit log declaring step_re_execution and place a\n` +
      `matching trailer at <plan_dir>/cdcc-step-reexec-authorization.txt of the form:\n` +
      `  Step-Re-Execution: gate-NN reason "<rationale>"\n` +
      `or (b) recognize this is an unauthorized repetition and avoid it.`;
    deps.stderrWrite(message);

    const audit: AuditLogEntry = {
      ts,
      hookId: 'H6',
      stage: null,
      decision: 'block',
      rationale: 'Step re-execution detected without matching Step-Re-Execution authorization',
      payload: {
        tool,
        step_id: identity.step_id,
        hash_of_inputs: identity.hash_of_inputs,
        corrupt_history_lines: history.corrupt_lines,
        authorizations_seen: authorizations.length,
      },
    };
    await deps.auditLogger.log(audit);
    return { exitCode: 1, audit };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const audit: AuditLogEntry = {
      ts,
      hookId: 'H6',
      stage: null,
      decision: 'halt',
      rationale: `H6 handler error: ${detail}`,
      payload: { error: detail },
    };
    await deps.auditLogger.log(audit);
    deps.stderrWrite(`H6 HALT: ${detail}`);
    return { exitCode: 1, audit };
  }
}

/**
 * Best-effort append. If write fails (EACCES, ENOSPC) we do not abort the
 * primary decision; the allow/block ruling has already been audited. Mirrors
 * H3's marker-creation contract.
 */
async function safeAppend(
  deps: HandleDeps,
  historyPath: string,
  identity: { step_id: string; hash_of_inputs: string },
  tool: SupportedTool,
  agentPersona: string | null,
  authorizedBy: string | null,
): Promise<void> {
  try {
    const record: StepHistoryRecord = {
      ts: new Date().toISOString(),
      step_id: identity.step_id,
      hash_of_inputs: identity.hash_of_inputs,
      tool,
      agent_persona: agentPersona,
      authorized_by: authorizedBy,
      gate_ref: authorizedBy,
    };
    await deps.mkdir(dirname(historyPath), { recursive: true });
    await deps.appendFile(historyPath, JSON.stringify(record) + '\n');
  } catch {
    // Append failure is non-fatal; primary decision already audited.
  }
}

// Default exported function for CLI entry point
export async function handle(): Promise<void> {
  const claudeRoot = process.env.CLAUDE_ROOT || join(homedir(), '.claude');
  const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));
  const planDir = process.env.CDCC_PLAN_DIR || join(claudeRoot, 'plugins', 'cdcc');

  const readFileWrapper: (path: string, encoding?: string) => Promise<string> = async (path, encoding) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return readFile(path, (encoding || 'utf-8') as any) as any;
  };

  const mkdirWrapper: (path: string, options?: { recursive?: boolean }) => Promise<void> = async (path, options) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await mkdir(path, { recursive: options?.recursive ?? true }) as any;
  };

  const result = await handleImpl({
    readFile: readFileWrapper,
    appendFile: async (path, content) => {
      await appendFile(path, content, 'utf-8');
    },
    mkdir: mkdirWrapper,
    stdinReader: async () => {
      let payload = '';
      for await (const chunk of process.stdin) {
        payload += chunk.toString();
      }
      return payload;
    },
    auditLogger,
    exit: process.exit,
    stderrWrite: (msg) => console.error(msg),
    planDir,
  });

  process.exit(result.exitCode);
}

// Entry point
// istanbul ignore next — CLI entry point only executed when module is invoked directly as script; tested via handle() integration tests
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  handle().catch((err) => {
    console.error('H6 uncaught error:', err);
    process.exit(1);
  });
}
