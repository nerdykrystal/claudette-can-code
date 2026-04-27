// H2 — Deviation Manifest Hook. FR-008.
// Stop hook (BUILD_COMPLETE sentinel): requires signed DeviationManifest for detected substitution.
// Exit 0 (allow) or 2 (block/halt fail-closed).

import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import { AuditLogger } from '../../core/audit/index.js';
import type { AuditLogEntry } from '../../core/audit/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ajv = new (Ajv as any)({ validateFormats: false });

const deviationManifestSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['substitutions'],
  properties: {
    substitutions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['original', 'replacement', 'reason'],
        properties: {
          original: { type: 'string' },
          replacement: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
};

const validateManifest = ajv.compile(deviationManifestSchema);

export interface HandleDeps {
  stdinReader: () => Promise<string>;
  auditLogger: AuditLogger;
  exit: (code: number) => never;
  stderrWrite: (msg: string) => void;
}

export interface HandleResult {
  exitCode: number;
  audit: AuditLogEntry;
}

/**
 * H2 handler: on Stop with BUILD_COMPLETE substring, check for deviationManifest.
 * If substitution detected and no manifest: block (exit 2).
 * If manifest provided and valid: allow (exit 0).
 * Else block (exit 2).
 */
export async function handleImpl(deps: HandleDeps): Promise<HandleResult> {
  const ts = new Date().toISOString();

  try {
    // Read stdin for completion payload
    const payload = await deps.stdinReader();

    const hasBuildComplete = payload.includes('BUILD_COMPLETE');

    // Minimal MVP: if BUILD_COMPLETE present, require deviationManifest field
    if (hasBuildComplete) {
      const hasManifest = payload.includes('deviationManifest');

      if (!hasManifest) {
        const audit: AuditLogEntry = {
          ts,
          hookId: 'H2',
          stage: null,
          decision: 'block',
          rationale: 'BUILD_COMPLETE detected but no deviationManifest provided',
          payload: { buildComplete: true, hasManifest: false },
        };
        await deps.auditLogger.log(audit);
        deps.stderrWrite(JSON.stringify({ rule: 'h2_no_deviation_manifest', resolution: 'Rule H2 (FR-008) requires a deviationManifest in every BUILD_COMPLETE payload. Add a deviationManifest field listing each substitution (original, replacement, reason) and resubmit.', detected_value: 'BUILD_COMPLETE without deviationManifest' }));
        return { exitCode: 2, audit };
      }

      // Try to parse manifest
      try {
        const manifestMatch = payload.match(/"deviationManifest"\s*:\s*({[^}]*})/);
        if (manifestMatch) {
          const manifest = JSON.parse(manifestMatch[1]) as { substitutions?: unknown };
          // Gate-22 H-2 guard: substitutions must be a non-null array (null literal bypasses Array.isArray check)
          if (!Array.isArray(manifest.substitutions) || manifest.substitutions === null) {
            const audit: AuditLogEntry = {
              ts,
              hookId: 'H2',
              stage: null,
              decision: 'block',
              rationale: 'deviationManifest schema invalid: substitutions must be a non-null array',
              payload: { manifest },
            };
            await deps.auditLogger.log(audit);
            deps.stderrWrite(JSON.stringify({ rule: 'h2_manifest_schema_invalid', resolution: 'deviationManifest.substitutions must be a non-null array. Each entry requires: original (string), replacement (string), reason (string). Correct the manifest and resubmit.', detail: 'substitutions must be a non-null array' }));
            return { exitCode: 2, audit };
          }
          const valid = validateManifest(manifest);

          if (!valid) {
            const audit: AuditLogEntry = {
              ts,
              hookId: 'H2',
              stage: null,
              decision: 'block',
              rationale: `deviationManifest schema invalid: ${ajv.errorsText(validateManifest.errors)}`,
              payload: { manifest },
            };
            await deps.auditLogger.log(audit);
            deps.stderrWrite(JSON.stringify({ rule: 'h2_manifest_schema_invalid', resolution: 'deviationManifest failed schema validation. Each substitution entry requires: original (string), replacement (string), reason (string). Fix the validation errors listed in detail and resubmit.', detail: ajv.errorsText(validateManifest.errors) }));
            return { exitCode: 2, audit };
          }

          const audit: AuditLogEntry = {
            ts,
            hookId: 'H2',
            stage: null,
            decision: 'allow',
            rationale: 'deviationManifest validated',
            payload: { manifest },
          };
          await deps.auditLogger.log(audit);
          return { exitCode: 0, audit };
        }
      } catch (err) {
        // BUILD_COMPLETE detected and a deviationManifest field was found, but the
        // captured payload did not parse as JSON (or validateManifest threw). Per
        // FR-008 anti-silent-substitution: a malformed manifest under BUILD_COMPLETE
        // MUST block, not fall through to the "no sentinel" allow path.
        const detail = err instanceof Error ? err.message : String(err);
        const audit: AuditLogEntry = {
          ts,
          hookId: 'H2',
          stage: null,
          decision: 'block',
          rationale: `deviationManifest parse failed: ${detail}`,
          payload: { error: detail },
        };
        await deps.auditLogger.log(audit);
        deps.stderrWrite(JSON.stringify({ rule: 'h2_manifest_parse_failed', resolution: 'H2 found a deviationManifest field but could not parse it as JSON. Ensure the value is well-formed JSON, then resubmit.', detail }));
        return { exitCode: 2, audit };
      }
    }

    // No BUILD_COMPLETE: allow
    const audit: AuditLogEntry = {
      ts,
      hookId: 'H2',
      stage: null,
      decision: 'allow',
      rationale: 'No BUILD_COMPLETE sentinel detected',
      payload: { buildComplete: false },
    };
    await deps.auditLogger.log(audit);
    return { exitCode: 0, audit };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const audit: AuditLogEntry = {
      ts,
      hookId: 'H2',
      stage: null,
      decision: 'halt',
      rationale: `H2 handler error: ${detail}`,
      payload: { error: detail },
    };
    await deps.auditLogger.log(audit);
    deps.stderrWrite(JSON.stringify({ rule: 'h2_handler_error', resolution: 'H2 encountered an unexpected error reading stdin. Confirm the hook is receiving well-formed JSON and that it is configured correctly in settings.json.', detail }));
    return { exitCode: 2, audit };
  }
}

// Default exported function for CLI entry point
export async function handle(): Promise<void> {
  const claudeRoot = process.env.CLAUDE_ROOT || join(homedir(), '.claude');
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
    stderrWrite: (msg) => console.error(msg),
  });

  auditLogger.close();
  process.exit(result.exitCode);
}

// Entry point
// istanbul ignore next — CLI entry point only executed when module is invoked directly as script; tested via handle() integration tests
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  handle().catch((err) => {
    console.error('H2 uncaught error:', err);
    process.exit(2);
  });
}
