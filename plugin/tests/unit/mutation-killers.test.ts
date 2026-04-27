// Mutation-killer assertions for surviving Stryker mutants in:
//   - src/core/backwards-planning/index.ts (stage name/purpose strings)
//   - src/hooks/h1-h5/index.ts (stderr message prefixes, audit rationale strings)
//
// Each test asserts on a specific literal string or behavior that one or more
// Stryker mutants flipped without producing a test-visible failure under the
// existing suite. Killing these lifts mutation score above the 80% threshold.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planBackwards } from '../../src/core/backwards-planning/index.js';
import { handleImpl as h1Impl } from '../../src/hooks/h1-input-manifest/index.js';
import { handleImpl as h2Impl } from '../../src/hooks/h2-deviation-manifest/index.js';
import { handleImpl as h3Impl } from '../../src/hooks/h3-sandbox-hygiene/index.js';
import { handleImpl as h4Impl } from '../../src/hooks/h4-model-assignment/index.js';
import { handleImpl as h5Impl } from '../../src/hooks/h5-gate-result/index.js';
import type { AuditLogger } from '../../src/core/audit/index.js';

function noopLogger(): AuditLogger {
  return {
    log: async () => ({ ok: true as const, value: undefined }),
  } as unknown as AuditLogger;
}

describe('Backwards-planning mutation killers — exact stage strings', () => {
  it('emits qa stage with exact id, name, purpose strings', () => {
    const stages = planBackwards({
      excellentEndState: 'X',
      qaCriteria: ['c1', 'c2'],
      constraints: [],
    });
    const qa = stages.find((s) => s.id === 'qa');
    expect(qa).toBeDefined();
    expect(qa?.id).toBe('qa');
    expect(qa?.name).toBe('Quality Assurance');
    expect(qa?.purpose).toBe('Convergence gate across all stages');
    // dependsOn must list every implementation stage and nothing else.
    expect(qa?.dependsOn).toEqual(['impl-0', 'impl-1']);
  });

  it('emits scaffold stage with exact id, name, purpose, and singleton dependency on plan-full', () => {
    const stages = planBackwards({
      excellentEndState: 'X',
      qaCriteria: ['c1'],
      constraints: [],
    });
    const scaffold = stages.find((s) => s.id === 'scaffold');
    expect(scaffold).toBeDefined();
    expect(scaffold?.id).toBe('scaffold');
    expect(scaffold?.name).toBe('Project Scaffold');
    expect(scaffold?.purpose).toBe('Directory structure and configuration');
    expect(scaffold?.dependsOn).toEqual(['plan-full']);
  });

  it('emits plan-skeleton stage with exact strings and empty dependsOn', () => {
    const stages = planBackwards({
      excellentEndState: 'X',
      qaCriteria: [],
      constraints: [],
    });
    const ps = stages.find((s) => s.id === 'plan-skeleton');
    expect(ps).toBeDefined();
    expect(ps?.id).toBe('plan-skeleton');
    expect(ps?.name).toBe('Plan Skeleton');
    expect(ps?.purpose).toBe('Initial plan outline');
    expect(ps?.dependsOn).toEqual([]);
    expect(ps?.dependsOn.length).toBe(0);
  });

  it('emits plan-full stage with exact strings depending on plan-skeleton', () => {
    const stages = planBackwards({
      excellentEndState: 'X',
      qaCriteria: [],
      constraints: [],
    });
    const pf = stages.find((s) => s.id === 'plan-full');
    expect(pf).toBeDefined();
    expect(pf?.id).toBe('plan-full');
    expect(pf?.name).toBe('Full Plan Content');
    expect(pf?.purpose).toBe('Detailed plan with all specifications');
    expect(pf?.dependsOn).toEqual(['plan-skeleton']);
  });

  it('emits implementation stages with exact id pattern, name template, and purpose=qaCriterion', () => {
    const criteria = ['criterion-A', 'criterion-B', 'criterion-C'];
    const stages = planBackwards({
      excellentEndState: 'X',
      qaCriteria: criteria,
      constraints: [],
    });
    const impls = stages.filter((s) => s.id.startsWith('impl-'));
    expect(impls).toHaveLength(3);
    impls.forEach((stage, i) => {
      expect(stage.id).toBe(`impl-${i}`);
      expect(stage.name).toBe(`Implementation Stage ${i}`);
      expect(stage.purpose).toBe(criteria[i]);
      expect(stage.dependsOn).toEqual(['scaffold']);
    });
  });

  it('stage ordering is exactly [plan-skeleton, plan-full, scaffold, ...impls, qa]', () => {
    const stages = planBackwards({
      excellentEndState: 'X',
      qaCriteria: ['c1', 'c2'],
      constraints: [],
    });
    expect(stages.map((s) => s.id)).toEqual([
      'plan-skeleton',
      'plan-full',
      'scaffold',
      'impl-0',
      'impl-1',
      'qa',
    ]);
  });

  it('qa.dependsOn is exactly the implementation stage ids in order', () => {
    const stages = planBackwards({
      excellentEndState: 'X',
      qaCriteria: ['a', 'b', 'c', 'd'],
      constraints: [],
    });
    const qa = stages.find((s) => s.id === 'qa');
    expect(qa?.dependsOn).toEqual(['impl-0', 'impl-1', 'impl-2', 'impl-3']);
  });
});

describe('H1 mutation killers — exact stderr/rationale strings', () => {
  it('block path stderr starts with "H1 BLOCK:" and rationale matches', async () => {
    const stderr: string[] = [];
    const result = await h1Impl({
      readFile: async () => JSON.stringify({ stages: [] }),
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (m) => stderr.push(m),
      planStatePath: '/fake/plan-state.json',
    });
    expect(result.exitCode).toBe(1);
    expect(result.audit.rationale).toBe('No input manifest declared in plan');
    expect(stderr).toEqual(['H1 BLOCK: No input manifest in plan state']);
  });

  it('halt path stderr starts with "H1 HALT:" prefix', async () => {
    const stderr: string[] = [];
    const result = await h1Impl({
      readFile: async () => 'not-json',
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (m) => stderr.push(m),
      planStatePath: '/fake/plan-state.json',
    });
    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
    expect(stderr.some((m) => m.startsWith('H1 HALT:'))).toBe(true);
  });

  it('allow path rationale is "Input manifest found and non-empty"', async () => {
    const result = await h1Impl({
      readFile: async () =>
        JSON.stringify({ stages: [{ id: 's0', inputManifest: ['file.ts'] }] }),
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: () => {
        // no-op
      },
      planStatePath: '/fake/plan-state.json',
    });
    expect(result.exitCode).toBe(0);
    expect(result.audit.rationale).toBe('Input manifest found and non-empty');
  });
});

describe('H2 mutation killers — exact rationales + stderr', () => {
  it('block-no-manifest stderr is exactly "H2 BLOCK: BUILD_COMPLETE without deviationManifest"', async () => {
    const stderr: string[] = [];
    const result = await h2Impl({
      stdinReader: async () => 'BUILD_COMPLETE without manifest',
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (m) => stderr.push(m),
    });
    expect(result.exitCode).toBe(1);
    expect(result.audit.rationale).toBe(
      'BUILD_COMPLETE detected but no deviationManifest provided',
    );
    expect(stderr).toEqual(['H2 BLOCK: BUILD_COMPLETE without deviationManifest']);
  });

  it('allow-no-build-complete rationale is exactly "No BUILD_COMPLETE sentinel detected"', async () => {
    const result = await h2Impl({
      stdinReader: async () => '{"x":"y"}',
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: () => {
        // no-op
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.audit.rationale).toBe('No BUILD_COMPLETE sentinel detected');
  });

  it('allow-with-valid-manifest rationale is "deviationManifest validated"', async () => {
    const result = await h2Impl({
      stdinReader: async () =>
        '{"status":"BUILD_COMPLETE","deviationManifest":{"substitutions":[]}}',
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: () => {
        // no-op
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.audit.rationale).toBe('deviationManifest validated');
  });
});

describe('H3 mutation killers — exact rationales + stderr', () => {
  it('initial-scan rationale is "Initial sandbox scan passed (MVP: minimal checks)"', async () => {
    const result = await h3Impl({
      readFile: async () => {
        throw new Error('ENOENT');
      },
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: () => {
        // no-op
      },
      sandboxMarkerPath: '/fake/marker',
    });
    expect(result.exitCode).toBe(0);
    expect(result.audit.rationale).toBe('Initial sandbox scan passed (MVP: minimal checks)');
  });

  it('marker-exists rationale is "Sandbox already scanned; short-circuit allow"', async () => {
    const result = await h3Impl({
      readFile: async () => 'marker-exists',
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: () => {
        // no-op
      },
      sandboxMarkerPath: '/fake/marker',
    });
    expect(result.exitCode).toBe(0);
    expect(result.audit.rationale).toBe('Sandbox already scanned; short-circuit allow');
  });

  it('halt path stderr prefix is "H3 HALT:" exactly', async () => {
    let logCall = 0;
    const oneShot: AuditLogger = {
      log: async () => {
        logCall += 1;
        if (logCall === 1) {
          throw new Error('forced-log-failure');
        }
        return { ok: true as const, value: undefined };
      },
    } as unknown as AuditLogger;
    const stderr: string[] = [];

    const result = await h3Impl({
      readFile: async () => {
        throw new Error('ENOENT');
      },
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      auditLogger: oneShot,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (m) => stderr.push(m),
      sandboxMarkerPath: '/fake/marker',
    });
    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('halt');
    expect(stderr.some((m) => m.startsWith('H3 HALT:'))).toBe(true);
  });
});

describe('H4 mutation killers — exact rationales + emit shape', () => {
  it('non-Write/Edit allow rationale starts with "H4 only applies to Write/Edit;"', async () => {
    const result = await h4Impl({
      readFile: async () => '{}',
      stdinReader: async () => '{"tool":"Read","args":{},"executingModel":"x"}',
      auditLogger: noopLogger(),
      emit: () => {
        // no-op
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: () => {
        // no-op
      },
      planStatePath: '/fake',
    });
    expect(result.exitCode).toBe(0);
    expect(result.audit.rationale).toMatch(/^H4 only applies to Write\/Edit;/);
    expect(result.audit.rationale).toContain('Read');
  });

  it('mismatch block rationale matches "Model mismatch:" pattern with both models', async () => {
    let emittedDirective: unknown = null;
    const result = await h4Impl({
      readFile: async () => '{}',
      planStateReader: () => ({
        ok: true as const,
        value: { stages: [{ id: 's0', assignedModel: 'haiku-4-5' }] } as never,
      }),
      stdinReader: async () =>
        '{"tool":"Write","args":{"path":"a"},"executingModel":"opus-4-7"}',
      auditLogger: noopLogger(),
      emit: (d) => {
        emittedDirective = d;
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: () => {
        // no-op
      },
      planStatePath: '/fake',
    });
    // Stage 08a: model mismatch is fail-closed → exit 2
    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(result.audit.rationale).toMatch(/^Model mismatch: executing opus-4-7 but assigned haiku-4-5$/);
    expect(emittedDirective).toBeTruthy();
    const directive = emittedDirective as { action: string; assignedModel: string; stageId: string };
    expect(directive.action).toBe('redirect');
    expect(directive.assignedModel).toBe('haiku-4-5');
    expect(directive.stageId).toBe('s0');
  });

  it('match allow rationale starts with "Executing model matches assigned model:"', async () => {
    const result = await h4Impl({
      readFile: async () => '{}',
      planStateReader: () => ({
        ok: true as const,
        value: { stages: [{ id: 's0', assignedModel: 'haiku-4-5' }] } as never,
      }),
      stdinReader: async () =>
        '{"tool":"Write","args":{},"executingModel":"haiku-4-5"}',
      auditLogger: noopLogger(),
      emit: () => {
        // no-op
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: () => {
        // no-op
      },
      planStatePath: '/fake',
    });
    expect(result.exitCode).toBe(0);
    expect(result.audit.rationale).toBe('Executing model matches assigned model: haiku-4-5');
  });

  it('no-current-stage block rationale is exactly "No current stage found; fail-closed"', async () => {
    // Stage 08a: stage-not-found is now fail-closed (exit 2, closes gate-22 C-3)
    const result = await h4Impl({
      readFile: async () => '{}',
      planStateReader: () => ({
        ok: true as const,
        value: { stages: [] } as never,
      }),
      stdinReader: async () =>
        '{"tool":"Write","args":{},"executingModel":"haiku-4-5"}',
      auditLogger: noopLogger(),
      emit: () => {
        // no-op
      },
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: () => {
        // no-op
      },
      planStatePath: '/fake',
    });
    expect(result.exitCode).toBe(2);
    expect(result.audit.rationale).toBe('No current stage found; fail-closed');
  });
});

describe('H5 mutation killers — exact rationales + stderr', () => {
  it('converged allow rationale is exactly "Stage converged per Convergence Gate Engine"', async () => {
    const result = await h5Impl({
      stdinReader: async () =>
        JSON.stringify({ converged: true, counter: 3, findings: [] }),
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: () => {
        // no-op
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.audit.rationale).toBe('Stage converged per Convergence Gate Engine');
  });

  it('not-converged block stderr starts with "H5 BLOCK: Stage not converged."', async () => {
    const stderr: string[] = [];
    const result = await h5Impl({
      stdinReader: async () =>
        JSON.stringify({
          converged: false,
          counter: 1,
          findings: [{ severity: 'CRITICAL', message: 'sample' }],
        }),
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (m) => stderr.push(m),
    });
    expect(result.exitCode).toBe(1);
    expect(result.audit.rationale).toBe(
      'Stage not converged; findings must be remediated',
    );
    expect(stderr.some((m) => m.startsWith('H5 BLOCK: Stage not converged.'))).toBe(true);
    // Findings summary lines have format "[SEVERITY] message"
    expect(stderr.some((m) => m.includes('[CRITICAL] sample'))).toBe(true);
  });

  it('parse-error block rationale is exactly "Could not parse ConvergenceGateResult from stdin"', async () => {
    const stderr: string[] = [];
    const result = await h5Impl({
      stdinReader: async () => 'not-valid-json {{',
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (m) => stderr.push(m),
    });
    expect(result.exitCode).toBe(1);
    expect(result.audit.rationale).toBe(
      'Could not parse ConvergenceGateResult from stdin',
    );
    expect(stderr).toEqual(['H5 BLOCK: Could not parse gate result']);
  });

  it('schema-invalid block stderr is exactly "H5 BLOCK: Gate result schema invalid"', async () => {
    const stderr: string[] = [];
    const result = await h5Impl({
      stdinReader: async () =>
        // valid JSON but missing required fields
        JSON.stringify({ converged: 'not-a-bool' }),
      auditLogger: noopLogger(),
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (m) => stderr.push(m),
    });
    expect(result.exitCode).toBe(1);
    expect(result.audit.decision).toBe('block');
    expect(stderr).toEqual(['H5 BLOCK: Gate result schema invalid']);
  });
});

// Use spawn-related imports as no-ops to avoid stripping by lint pass.
void Readable;
void mkdtemp;
void rm;
void writeFile;
void mkdir;
void tmpdir;
void join;
void describe;
void beforeEach;
void afterEach;
