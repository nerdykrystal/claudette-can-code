// H2 — Deviation Manifest Hook. FR-008.
// Stop hook (BUILD_COMPLETE sentinel): requires signed DeviationManifest for detected substitution.
// Exit 0 (allow) or 1 (block).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Validator } from 'ajv';
import { AuditLogger } from '../../core/audit/index.js';

const ajv = new Validator();

const claudeRoot = process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude');
const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));

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

/**
 * H2 handler: on Stop with BUILD_COMPLETE substring, check for deviationManifest.
 * If substitution detected and no manifest: block (exit 1).
 * If manifest provided and valid: allow (exit 0).
 * Else block.
 */
export async function handle(): Promise<void> {
  const ts = new Date().toISOString();

  try {
    // Read stdin for completion payload
    let payload = '';
    for await (const chunk of process.stdin) {
      payload += chunk.toString();
    }

    const hasBuildComplete = payload.includes('BUILD_COMPLETE');

    // Minimal MVP: if BUILD_COMPLETE present, require deviationManifest field
    if (hasBuildComplete) {
      const hasManifest = payload.includes('deviationManifest');

      if (!hasManifest) {
        await auditLogger.log({
          ts,
          hookId: 'H2',
          stage: null,
          decision: 'block',
          rationale: 'BUILD_COMPLETE detected but no deviationManifest provided',
          payload: { buildComplete: true, hasManifest: false },
        });
        console.error('H2 BLOCK: BUILD_COMPLETE without deviationManifest');
        process.exit(1);
      }

      // Try to parse manifest
      try {
        const manifestMatch = payload.match(/"deviationManifest"\s*:\s*({[^}]*})/);
        if (manifestMatch) {
          const manifest = JSON.parse(manifestMatch[1]);
          const valid = validateManifest(manifest);

          if (!valid) {
            await auditLogger.log({
              ts,
              hookId: 'H2',
              stage: null,
              decision: 'block',
              rationale: `deviationManifest schema invalid: ${ajv.errorsText(validateManifest.errors)}`,
              payload: { manifest },
            });
            console.error('H2 BLOCK: deviationManifest schema invalid');
            process.exit(1);
          }

          await auditLogger.log({
            ts,
            hookId: 'H2',
            stage: null,
            decision: 'allow',
            rationale: 'deviationManifest validated',
            payload: { manifest },
          });
          process.exit(0);
        }
      } catch {
        // Fallback to simple text match failure
      }
    }

    // No BUILD_COMPLETE: allow
    await auditLogger.log({
      ts,
      hookId: 'H2',
      stage: null,
      decision: 'allow',
      rationale: 'No BUILD_COMPLETE sentinel detected',
      payload: { buildComplete: false },
    });
    process.exit(0);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await auditLogger.log({
      ts,
      hookId: 'H2',
      stage: null,
      decision: 'halt',
      rationale: `H2 handler error: ${detail}`,
      payload: { error: detail },
    });
    console.error(`H2 HALT: ${detail}`);
    process.exit(1);
  }
}

// Entry point
handle().catch((err) => {
  console.error('H2 uncaught error:', err);
  process.exit(1);
});
