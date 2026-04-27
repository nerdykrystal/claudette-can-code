// H8 — Protected Files Guard. FR-007.
// PreToolUse on Write|Edit|Bash (destructive ops): checks target path against
// protected_files.yaml rules loaded at SessionStart. On match without persona
// in allowed_personas: exit 2 with structured JSON stderr (fail-closed).
// Else: allow (exit 0).
//
// Stage 09 — A18 closure + roadmap P3 H8 (UNFLAGGED per /asae v06).

import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AuditLogger } from '../../core/audit/index.js';
import type { AuditLogEntry } from '../../core/audit/index.js';
import { ProtectedFilesResolverImpl } from '../../core/protected-files/resolver.js';
import type { MatchResult } from '../../core/protected-files/resolver.js';

export interface HandleDeps {
  stdinReader: () => Promise<string>;
  auditLogger: AuditLogger;
  exit: (code: number) => never;
  stderrWrite: (msg: string) => void;
  /** Path to protected_files.yaml; resolved at hook startup */
  protectedFilesYamlPath: string;
  /** Injectable resolver for testing */
  resolver?: ProtectedFilesResolverImpl;
}

export interface HandleResult {
  exitCode: number;
  audit: AuditLogEntry;
}

/** Bash destructive operation patterns to match against bash command content */
const DESTRUCTIVE_BASH_PATTERNS = [
  /^rm\b/,
  /^mv\b/,
  /^cp\b/,
  /\bsed\s+-i\b/,
  /^chmod\b/,
  /\bgit\s+commit\b/,
  /\bgit\s+push\b/,
  /\bgit\s+revert\b/,
  /\bgit\s+reset\b/,
  /\bwrite\b/,
  /\btee\b/,
  /\bcat\s+>/,
];

/** Extract target file path from hook payload depending on tool */
function extractTargetPath(
  tool: string,
  args: Record<string, unknown> | undefined,
): string | null {
  if (!args) return null;
  if (tool === 'Write' || tool === 'Edit') {
    return (args['file_path'] as string | undefined) ?? null;
  }
  if (tool === 'Bash') {
    // For Bash, extract any path-like argument; use command as pseudo-path for matching
    // Per §3.09: match destructive ops; use command string as synthetic path for
    // protected-file detection (e.g., `rm /path/.env`)
    const cmd = (args['command'] as string | undefined) ?? '';
    // Check if it's a destructive command
    const isDestructive = DESTRUCTIVE_BASH_PATTERNS.some((re) => re.test(cmd.trim()));
    if (!isDestructive) return null;
    // Extract path-like token from command (first token that looks like a path)
    const tokens = cmd.split(/\s+/);
    const pathToken = tokens.find((t) => t.includes('/') || t.includes('\\') || t.startsWith('.'));
    return pathToken ?? cmd;
  }
  return null;
}

/**
 * H8 handler: load protected_files.yaml (once per session via module cache),
 * extract target path from PreToolUse payload, match against compiled rules,
 * block on match with structured stderr (exit 2), allow otherwise (exit 0).
 */
export async function handleImpl(deps: HandleDeps): Promise<HandleResult> {
  const ts = new Date().toISOString();

  try {
    // Load + precompile resolver (idempotent; same file path = cached in instance)
    const resolverInstance = deps.resolver ?? new ProtectedFilesResolverImpl();
    const compileResult = resolverInstance.precompile(deps.protectedFilesYamlPath);

    if (!compileResult.ok) {
      // Fail-closed: if we cannot load the config, block everything
      deps.stderrWrite(
        JSON.stringify({
          rule: 'h8_config_load_error',
          resolution: 'Ensure protected_files.yaml exists and is valid YAML at the configured path',
          detail: compileResult.error.message,
          kind: compileResult.error.kind,
        }) + '\n',
      );
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H8',
        stage: null,
        decision: 'block',
        rationale: `H8 config load error: ${compileResult.error.message}`,
        payload: { error: compileResult.error },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 2, audit };
    }

    // Read PreToolUse payload from stdin
    const rawPayload = await deps.stdinReader();
    const hookPayload = JSON.parse(rawPayload) as {
      tool?: string;
      args?: Record<string, unknown>;
      currentPersonaRole?: string;
    };

    const { tool, args, currentPersonaRole } = hookPayload;

    // H8 only applies to Write, Edit, Bash
    if (tool !== 'Write' && tool !== 'Edit' && tool !== 'Bash') {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H8',
        stage: null,
        decision: 'allow',
        rationale: `H8 only applies to Write/Edit/Bash; tool is ${tool ?? 'unknown'}`,
        payload: { tool },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    }

    // Fail-closed: if persona is absent, block
    if (!currentPersonaRole) {
      deps.stderrWrite(
        JSON.stringify({
          rule: 'h8_no_persona',
          resolution: 'Ensure currentPersonaRole is set in the PreToolUse hook payload',
          detail: 'currentPersonaRole is absent or empty in hook payload',
        }) + '\n',
      );
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H8',
        stage: null,
        decision: 'block',
        rationale: 'H8 fail-closed: currentPersonaRole absent in payload',
        payload: { tool, args },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 2, audit };
    }

    // Extract target path
    const targetPath = extractTargetPath(tool, args);

    if (!targetPath) {
      // No extractable path → allow (not a protected-file operation)
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H8',
        stage: null,
        decision: 'allow',
        rationale: `H8 no extractable path for tool ${tool}; allowing`,
        payload: { tool, args },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    }

    // Match against rules
    const matchResult: MatchResult = resolverInstance.match(targetPath, currentPersonaRole);

    if (!matchResult.allowed) {
      deps.stderrWrite(
        JSON.stringify({
          rule: matchResult.ruleId,
          path: targetPath,
          persona: currentPersonaRole,
          resolution: matchResult.allowedPersonas.length > 0
            ? `Re-delegate to one of: ${matchResult.allowedPersonas.join(', ')}`
            : 'This file is protected and cannot be edited via any assistant persona',
          deny_message: matchResult.denyMessage,
        }) + '\n',
      );
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H8',
        stage: null,
        decision: 'block',
        rationale: `H8 protected file blocked: rule=${matchResult.ruleId} path=${targetPath} persona=${currentPersonaRole}`,
        payload: { rule: matchResult.ruleId, path: targetPath, persona: currentPersonaRole },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 2, audit };
    }

    // Allowed
    const audit: AuditLogEntry = {
      ts,
      hookId: 'H8',
      stage: null,
      decision: 'allow',
      rationale: `H8 allow: path=${targetPath} persona=${currentPersonaRole}`,
      payload: { path: targetPath, persona: currentPersonaRole },
    };
    await deps.auditLogger.log(audit);
    return { exitCode: 0, audit };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const audit: AuditLogEntry = {
      ts,
      hookId: 'H8',
      stage: null,
      decision: 'halt',
      rationale: `H8 handler error: ${detail}`,
      payload: { error: detail },
    };
    await deps.auditLogger.log(audit);
    deps.stderrWrite(
      JSON.stringify({
        rule: 'h8_handler_error',
        resolution: 'Investigate H8 handler error; check plugin logs',
        detail,
      }) + '\n',
    );
    return { exitCode: 2, audit };
  }
}

/** Default exported function for CLI entry point */
export async function handle(): Promise<void> {
  const claudeRoot = process.env.CLAUDE_ROOT || join(homedir(), '.claude');
  const protectedFilesYamlPath =
    process.env.CDCC_PROTECTED_FILES_YAML ??
    join(claudeRoot, 'plugins', 'cdcc', 'protected_files.yaml');
  const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));

  const result = await handleImpl({
    stdinReader: async () => {
      let payload = '';
      for await (const chunk of process.stdin) {
        payload += chunk.toString();
      }
      return payload;
    },
    auditLogger,
    exit: process.exit,
    stderrWrite: (msg) => process.stderr.write(msg),
    protectedFilesYamlPath,
  });

  auditLogger.close();
  process.exit(result.exitCode);
}

// Entry point
// istanbul ignore next — CLI entry point only executed when module is invoked directly as script; tested via handle() integration tests
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  handle().catch((err: unknown) => {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      JSON.stringify({ rule: 'h8_uncaught', resolution: 'Check H8 hook configuration', detail }) + '\n',
    );
    process.exit(2);
  });
}

// Re-export resolver for use in tests
export { ProtectedFilesResolverImpl };
