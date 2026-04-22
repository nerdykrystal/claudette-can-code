// H5 — Gate Result Hook. FR-011.
// Stop per-stage: requires ConvergenceGateResult with converged: true.
// If absent or not converged: block and emit findings. Exit 0 (allow) or 1 (block).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv from 'ajv';
import { AuditLogger } from '../../core/audit/index.js';

const ajv = new (Ajv as any)({ validateFormats: false });

const claudeRoot = process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude');
const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));

const convergenceGateResultSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['converged', 'counter', 'findings'],
  properties: {
    converged: { type: 'boolean' },
    counter: { type: 'integer', minimum: 0 },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'message'],
        properties: {
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          message: { type: 'string' },
        },
      },
    },
  },
};

const validateGateResult = ajv.compile(convergenceGateResultSchema);

/**
 * H5 handler: read stdin for ConvergenceGateResult.
 * If converged: allow (exit 0).
 * If not converged or schema invalid: block, emit findings (exit 1).
 */
export async function handle(): Promise<void> {
  const ts = new Date().toISOString();

  try {
    // Read stdin
    let payload = '';
    for await (const chunk of process.stdin) {
      payload += chunk.toString();
    }

    // Try to parse as convergenceGateResult
    let gateResult: unknown;
    try {
      gateResult = JSON.parse(payload);
    } catch {
      await auditLogger.log({
        ts,
        hookId: 'H5',
        stage: null,
        decision: 'block',
        rationale: 'Could not parse ConvergenceGateResult from stdin',
        payload: { rawPayload: payload.slice(0, 200) },
      });
      console.error('H5 BLOCK: Could not parse gate result');
      process.exit(1);
    }

    // Validate schema
    const valid = validateGateResult(gateResult);
    if (!valid) {
      await auditLogger.log({
        ts,
        hookId: 'H5',
        stage: null,
        decision: 'block',
        rationale: `ConvergenceGateResult schema invalid: ${ajv.errorsText(validateGateResult.errors)}`,
        payload: { gateResult },
      });
      console.error('H5 BLOCK: Gate result schema invalid');
      process.exit(1);
    }

    const result = gateResult as { converged: boolean; findings: Array<{ severity: string; message: string }> };

    // Check convergence
    if (result.converged) {
      await auditLogger.log({
        ts,
        hookId: 'H5',
        stage: null,
        decision: 'allow',
        rationale: 'Stage converged per Convergence Gate Engine',
        payload: { gateResult: result },
      });
      process.exit(0);
    }

    // Not converged: emit findings and block
    const findingsSummary = result.findings
      .map((f) => `[${f.severity}] ${f.message}`)
      .join('\n');

    console.error(`H5 BLOCK: Stage not converged. Findings:\n${findingsSummary}`);

    await auditLogger.log({
      ts,
      hookId: 'H5',
      stage: null,
      decision: 'block',
      rationale: 'Stage not converged; findings must be remediated',
      payload: { gateResult: result, findingsSummary },
    });

    process.exit(1);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await auditLogger.log({
      ts,
      hookId: 'H5',
      stage: null,
      decision: 'halt',
      rationale: `H5 handler error: ${detail}`,
      payload: { error: detail },
    });
    console.error(`H5 HALT: ${detail}`);
    process.exit(1);
  }
}

// Entry point
handle().catch((err) => {
  console.error('H5 uncaught error:', err);
  process.exit(1);
});
