// H5 — Gate Result Hook. FR-011.
// Stop per-stage: requires ConvergenceGateResult with converged: true.
// If absent or not converged: block and emit findings. Exit 0 (allow) or 2 (block/halt fail-closed).

import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import { AuditLogger } from '../../core/audit/index.js';
import type { AuditLogEntry } from '../../core/audit/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ajv = new (Ajv as any)({ validateFormats: false });

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
 * H5 handler: read stdin for ConvergenceGateResult.
 * If converged: allow (exit 0).
 * If not converged or schema invalid: block, emit findings (exit 2).
 */
export async function handleImpl(deps: HandleDeps): Promise<HandleResult> {
  const ts = new Date().toISOString();

  try {
    // Read stdin
    const payload = await deps.stdinReader();

    // Try to parse as convergenceGateResult
    let gateResult: unknown;
    try {
      gateResult = JSON.parse(payload);
    } catch {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H5',
        stage: null,
        decision: 'block',
        rationale: 'Could not parse ConvergenceGateResult from stdin',
        payload: { rawPayload: payload.slice(0, 200) },
      };
      await deps.auditLogger.log(audit);
      deps.stderrWrite(JSON.stringify({ rule: 'h5_parse_error', resolution: 'H5 could not parse the ConvergenceGateResult from stdin. Send a well-formed JSON object with fields: converged (bool), counter (int), findings (array).', detected_value: payload.slice(0, 200) }));
      return { exitCode: 2, audit };
    }

    // Validate schema
    const valid = validateGateResult(gateResult);
    if (!valid) {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H5',
        stage: null,
        decision: 'block',
        rationale: `ConvergenceGateResult schema invalid: ${ajv.errorsText(validateGateResult.errors)}`,
        payload: { gateResult },
      };
      await deps.auditLogger.log(audit);
      deps.stderrWrite(JSON.stringify({ rule: 'h5_schema_invalid', resolution: 'H5 ConvergenceGateResult failed schema validation. Required fields: converged (bool), counter (int ≥ 0), findings (array of {severity, message}). Correct the errors in detail and resubmit.', detail: ajv.errorsText(validateGateResult.errors) }));
      return { exitCode: 2, audit };
    }

    const result = gateResult as { converged: boolean; findings: { severity: string; message: string }[] };

    // Check convergence
    if (result.converged) {
      const audit: AuditLogEntry = {
        ts,
        hookId: 'H5',
        stage: null,
        decision: 'allow',
        rationale: 'Stage converged per Convergence Gate Engine',
        payload: { gateResult: result },
      };
      await deps.auditLogger.log(audit);
      return { exitCode: 0, audit };
    }

    // Not converged: emit findings and block
    const findingsSummary = result.findings
      .map((f) => `[${f.severity}] ${f.message}`)
      .join('\n');

    deps.stderrWrite(JSON.stringify({ rule: 'h5_not_converged', resolution: 'H5 blocked because the stage has not converged. Remediate every finding listed below, then rerun the convergence gate to continue.', findings: findingsSummary }));

    const audit: AuditLogEntry = {
      ts,
      hookId: 'H5',
      stage: null,
      decision: 'block',
      rationale: 'Stage not converged; findings must be remediated',
      payload: { gateResult: result, findingsSummary },
    };
    await deps.auditLogger.log(audit);

    return { exitCode: 2, audit };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const audit: AuditLogEntry = {
      ts,
      hookId: 'H5',
      stage: null,
      decision: 'halt',
      rationale: `H5 handler error: ${detail}`,
      payload: { error: detail },
    };
    await deps.auditLogger.log(audit);
    deps.stderrWrite(JSON.stringify({ rule: 'h5_handler_error', resolution: 'H5 encountered an unexpected error. Verify that stdin carries a valid JSON payload and that the hook is configured correctly in settings.json.', detail }));
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
    console.error('H5 uncaught error:', err);
    process.exit(2);
  });
}
