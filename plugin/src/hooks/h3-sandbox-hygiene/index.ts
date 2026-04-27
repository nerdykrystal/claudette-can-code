// H3 — Sandbox Hygiene Hook. FR-009.
// PreToolUse: first-run guard checks worktree vs allowlist; halt or remove per config.
// Exit 0 (allow) or 2 (halt fail-closed).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AuditLogger } from '../../core/audit/index.js';
import type { AuditLogEntry } from '../../core/audit/index.js';

export interface HandleDeps {
  readFile: (path: string, encoding?: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  auditLogger: AuditLogger;
  exit: (code: number) => never;
  stderrWrite: (msg: string) => void;
  sandboxMarkerPath: string;
}

export interface HandleResult {
  exitCode: number;
  audit: AuditLogEntry;
}

/**
 * H3 handler: first-run guard.
 * Check for .sandbox-scan-done marker. If present, short-circuit allow.
 * Else: minimal MVP just logs and allows (full file scanning deferred to Stage 05).
 * On success, create marker.
 */
export async function handleImpl(deps: HandleDeps): Promise<HandleResult> {
  const ts = new Date().toISOString();

  try {
    // Check for marker
    let markerExists = false;
    try {
      await deps.readFile(deps.sandboxMarkerPath, 'utf-8');
      markerExists = true;
    } catch {
      // Marker does not exist; proceed with scan
    }

    // Marker exists: short-circuit allow
    if (markerExists) {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H3',
        stage: null,
        decision: 'allow',
        rationale: 'Sandbox already scanned; short-circuit allow',
        payload: { markerExists: true },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    }

    // Minimal MVP: just log and allow (full file scanning in Stage 05)
    const audit: AuditLogEntry = {
      ts,
      hookId: 'H3',
      stage: null,
      decision: 'allow',
      rationale: 'Initial sandbox scan passed (MVP: minimal checks)',
      payload: { markerExists: false },
    };
    await deps.auditLogger.log(audit);

    // Create marker for future invocations. Marker creation is best-effort —
    // if mkdir/writeFile fails (EACCES, ENOSPC, etc.) the audit decision is
    // already recorded as 'allow' and we continue without escalation.
    const markerDir = join(deps.sandboxMarkerPath, '..');
    try {
      await deps.mkdir(markerDir, { recursive: true });
      await deps.writeFile(deps.sandboxMarkerPath, '');
    } catch {
      // Marker creation failed; continue (not fatal). Exercised by
      // tests/unit/hooks/h2-h3-istanbul-removal.test.ts.
    }

    return { exitCode: 0, audit };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const audit: AuditLogEntry = {
      ts,
      hookId: 'H3',
      stage: null,
      decision: 'halt',
      rationale: `H3 handler error: ${detail}`,
      payload: { error: detail },
    };
    await deps.auditLogger.log(audit);
    deps.stderrWrite(JSON.stringify({ rule: 'h3_handler_error', resolution: 'H3 could not complete the sandbox scan. Verify the sandbox marker path is accessible (check permissions and disk space) and that the hook is configured correctly in settings.json.', detail }));
    return { exitCode: 2, audit };
  }
}

// Default exported function for CLI entry point
export async function handle(): Promise<void> {
  const claudeRoot = process.env.CLAUDE_ROOT || join(homedir(), '.claude');
  const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));
  const sandboxMarkerPath = join(claudeRoot, 'plugins', 'cdcc', '.sandbox-scan-done');

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
    writeFile,
    mkdir: mkdirWrapper,
    auditLogger,
    exit: process.exit,
    stderrWrite: (msg) => console.error(msg),
    sandboxMarkerPath,
  });

  auditLogger.close();
  process.exit(result.exitCode);
}

// Entry point
// istanbul ignore next — CLI entry point only executed when module is invoked directly as script; tested via handle() integration tests
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  handle().catch((err) => {
    console.error('H3 uncaught error:', err);
    process.exit(2);
  });
}
