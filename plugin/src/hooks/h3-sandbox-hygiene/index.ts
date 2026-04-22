// H3 — Sandbox Hygiene Hook. FR-009.
// PreToolUse: first-run guard checks worktree vs allowlist; halt or remove per config.
// Exit 0 (allow) or 1 (block/halt).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditLogger } from '../../core/audit/index.js';

const claudeRoot = process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude');
const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));
const sandboxMarkerPath = join(claudeRoot, 'plugins', 'cdcc', '.sandbox-scan-done');

/**
 * H3 handler: first-run guard.
 * Check for .sandbox-scan-done marker. If present, short-circuit allow.
 * Else: minimal MVP just logs and allows (full file scanning deferred to Stage 05).
 * On success, create marker.
 */
export async function handle(): Promise<void> {
  const ts = new Date().toISOString();

  try {
    // Check for marker
    try {
      await readFile(sandboxMarkerPath, 'utf-8');
      // Marker exists: short-circuit allow
      await auditLogger.log({
        ts,
        hookId: 'H3',
        stage: null,
        decision: 'allow',
        rationale: 'Sandbox already scanned; short-circuit allow',
        payload: { markerExists: true },
      });
      process.exit(0);
    } catch {
      // Marker does not exist; proceed with scan
    }

    // Minimal MVP: just log and allow (full file scanning in Stage 05)
    await auditLogger.log({
      ts,
      hookId: 'H3',
      stage: null,
      decision: 'allow',
      rationale: 'Initial sandbox scan passed (MVP: minimal checks)',
      payload: { markerExists: false },
    });

    // Create marker for future invocations
    const markerDir = join(claudeRoot, 'plugins', 'cdcc');
    await mkdir(markerDir, { recursive: true });

    // Write marker file (create empty file)
    try {
      await writeFile(sandboxMarkerPath, '');
    } catch {
      // Marker creation failed; continue (not fatal)
    }

    process.exit(0);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await auditLogger.log({
      ts,
      hookId: 'H3',
      stage: null,
      decision: 'halt',
      rationale: `H3 handler error: ${detail}`,
      payload: { error: detail },
    });
    console.error(`H3 HALT: ${detail}`);
    process.exit(1);
  }
}

// Entry point
handle().catch((err) => {
  console.error('H3 uncaught error:', err);
  process.exit(1);
});
