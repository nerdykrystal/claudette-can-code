import { describe, it, expect, beforeEach } from 'vitest';
import { handleImpl, type HandleDeps } from '../../src/hooks/h6-step-reexec/index.js';
import { AuditLogger } from '../../src/core/audit/index.js';
import { computeStepIdentity } from '../../src/hooks/h6-step-reexec/step-identity.js';

describe('H6 Step-Re-Execution Guard (ASAE Aspect 13 / FM-1.3)', () => {
  let stderrOutput: string[] = [];
  let mockAuditLogger: AuditLogger;
  let appended: { path: string; content: string }[] = [];
  let mkdirCalls: string[] = [];

  beforeEach(() => {
    stderrOutput = [];
    appended = [];
    mkdirCalls = [];
    mockAuditLogger = {
      log: async () => {
        // Mock
      },
    } as unknown as AuditLogger;
  });

  function makeDeps(overrides: Partial<HandleDeps>): HandleDeps {
    return {
      readFile: async () => {
        throw new Error('ENOENT');
      },
      appendFile: async (path, content) => {
        appended.push({ path, content });
      },
      mkdir: async (path) => {
        mkdirCalls.push(path);
      },
      stdinReader: async () => '{}',
      auditLogger: mockAuditLogger,
      exit: () => {
        throw new Error('exit');
      },
      stderrWrite: (msg) => stderrOutput.push(msg),
      planDir: '/fake/plan',
      ...overrides,
    };
  }

  it('allow when tool is read-only (out of scope)', async () => {
    const deps = makeDeps({
      stdinReader: async () => JSON.stringify({ tool: 'Read', args: { file_path: 'x.ts' } }),
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.rationale).toContain('only applies to Write/Edit/Bash');
    expect(appended).toHaveLength(0);
  });

  it('allow when tool field missing entirely', async () => {
    const deps = makeDeps({
      stdinReader: async () => '{}',
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.rationale).toContain('tool is unset');
  });

  it('fresh Write step: allow + append record', async () => {
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: 'src/foo.ts', content: 'hello' },
          agent_persona: 'claudette-the-code-debugger',
        }),
      readFile: async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.rationale).toContain('Fresh step');
    expect(appended).toHaveLength(1);
    const rec = JSON.parse(appended[0].content);
    expect(rec.step_id).toBe('Write::src/foo.ts');
    expect(rec.tool).toBe('Write');
    expect(rec.agent_persona).toBe('claudette-the-code-debugger');
    expect(rec.authorized_by).toBeNull();
  });

  it('same Write step + no authorization: block', async () => {
    const ident = computeStepIdentity('Write', { file_path: 'src/foo.ts', content: 'hello' });
    const priorRecord = {
      ts: '2026-04-26T10:00:00Z',
      step_id: ident.step_id,
      hash_of_inputs: ident.hash_of_inputs,
      tool: 'Write',
      agent_persona: null,
      authorized_by: null,
      gate_ref: null,
    };
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: 'src/foo.ts', content: 'hello' },
        }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          return JSON.stringify(priorRecord) + '\n';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderrOutput[0]).toContain('h6_step_reexec_unauthorized');
    expect(appended).toHaveLength(0);
  });

  it('same Write step + valid Step-Re-Execution authorization: allow', async () => {
    const ident = computeStepIdentity('Write', { file_path: 'src/foo.ts', content: 'hello' });
    const priorRecord = {
      ts: '2026-04-26T10:00:00Z',
      step_id: ident.step_id,
      hash_of_inputs: ident.hash_of_inputs,
      tool: 'Write',
      agent_persona: null,
      authorized_by: null,
      gate_ref: null,
    };
    const authFile = `Step-Re-Execution: gate-44 reason "intentional retry after rebase"\n`;
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: 'src/foo.ts', content: 'hello' },
        }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          return JSON.stringify(priorRecord) + '\n';
        }
        if (path.endsWith('cdcc-step-reexec-authorization.txt')) {
          return authFile;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.rationale).toContain('Authorized re-execution under gate-44');
    expect(appended).toHaveLength(1);
    const newRec = JSON.parse(appended[0].content);
    expect(newRec.authorized_by).toBe('gate-44');
    expect(newRec.gate_ref).toBe('gate-44');
  });

  it('different content at same path: new step (different hash) → allow', async () => {
    const oldIdent = computeStepIdentity('Write', { file_path: 'src/foo.ts', content: 'hello' });
    const priorRecord = {
      ts: '2026-04-26T10:00:00Z',
      step_id: oldIdent.step_id,
      hash_of_inputs: oldIdent.hash_of_inputs,
      tool: 'Write',
      agent_persona: null,
      authorized_by: null,
      gate_ref: null,
    };
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: 'src/foo.ts', content: 'world' }, // different content
        }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          return JSON.stringify(priorRecord) + '\n';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.rationale).toContain('Fresh step');
    expect(appended).toHaveLength(1);
  });

  it('corrupt history lines: count surfaced in audit, primary decision unchanged', async () => {
    const goodRecord = {
      ts: '2026-04-26T10:00:00Z',
      step_id: 'Write::other.ts',
      hash_of_inputs: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      tool: 'Write',
      agent_persona: null,
      authorized_by: null,
      gate_ref: null,
    };
    const corrupt = '{ this is not json';
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: 'src/new.ts', content: 'fresh' },
        }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          return [JSON.stringify(goodRecord), corrupt, ''].join('\n');
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.payload.corrupt_history_lines).toBe(1);
  });

  it('history read error other than ENOENT: degrade gracefully (allow)', async () => {
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({ tool: 'Write', args: { file_path: 'a.ts', content: 'x' } }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          throw new Error('EACCES: permission denied');
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.rationale).toContain('unreadable');
    expect(result.audit.payload.history_read_error).toContain('EACCES');
  });

  it('halt on malformed stdin', async () => {
    const deps = makeDeps({
      stdinReader: async () => 'not-json {',
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('halt');
    expect(stderrOutput[0]).toContain('h6_handler_error');
  });

  it('append failure does not flip primary allow decision', async () => {
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({ tool: 'Write', args: { file_path: 'a.ts', content: 'x' } }),
      appendFile: async () => {
        throw new Error('ENOSPC');
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
  });

  it('Bash tool: same command + no auth → block', async () => {
    const ident = computeStepIdentity('Bash', { command: 'rm -rf dist' });
    const priorRecord = {
      ts: '2026-04-26T10:00:00Z',
      step_id: ident.step_id,
      hash_of_inputs: ident.hash_of_inputs,
      tool: 'Bash',
      agent_persona: null,
      authorized_by: null,
      gate_ref: null,
    };
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({ tool: 'Bash', args: { command: 'rm -rf dist' } }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          return JSON.stringify(priorRecord) + '\n';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
  });

  it('Edit tool: re-execution detection uses (old_string, new_string) hash', async () => {
    const ident = computeStepIdentity('Edit', {
      file_path: 'src/foo.ts',
      old_string: 'a',
      new_string: 'b',
    });
    const priorRecord = {
      ts: '2026-04-26T10:00:00Z',
      step_id: ident.step_id,
      hash_of_inputs: ident.hash_of_inputs,
      tool: 'Edit',
      agent_persona: null,
      authorized_by: null,
      gate_ref: null,
    };
    // Same file, same old/new → re-execution
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Edit',
          args: { file_path: 'src/foo.ts', old_string: 'a', new_string: 'b' },
        }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          return JSON.stringify(priorRecord) + '\n';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
  });

  it('Edit tool: different new_string at same path → fresh step', async () => {
    const oldIdent = computeStepIdentity('Edit', {
      file_path: 'src/foo.ts',
      old_string: 'a',
      new_string: 'b',
    });
    const priorRecord = {
      ts: '2026-04-26T10:00:00Z',
      step_id: oldIdent.step_id,
      hash_of_inputs: oldIdent.hash_of_inputs,
      tool: 'Edit',
      agent_persona: null,
      authorized_by: null,
      gate_ref: null,
    };
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Edit',
          args: { file_path: 'src/foo.ts', old_string: 'a', new_string: 'c' }, // different new
        }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          return JSON.stringify(priorRecord) + '\n';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(result.audit.rationale).toContain('Fresh step');
  });

  it('history records with malformed shape are skipped without halt', async () => {
    const malformedShape = { ts: 'x', step_id: 123 }; // step_id not a string
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({ tool: 'Write', args: { file_path: 'a.ts', content: 'x' } }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          return JSON.stringify(malformedShape) + '\n';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(0);
    expect(result.audit.payload.corrupt_history_lines).toBe(1);
  });

  it('authorization with explicit step_id mismatch is rejected', async () => {
    const ident = computeStepIdentity('Write', { file_path: 'src/foo.ts', content: 'hello' });
    const priorRecord = {
      ts: '2026-04-26T10:00:00Z',
      step_id: ident.step_id,
      hash_of_inputs: ident.hash_of_inputs,
      tool: 'Write',
      agent_persona: null,
      authorized_by: null,
      gate_ref: null,
    };
    // Authorization keyed to a DIFFERENT step_id
    const authFile = `Step-Re-Execution: gate-44 reason "wrong" step_id=Write::other.ts\n`;
    const deps = makeDeps({
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: 'src/foo.ts', content: 'hello' },
        }),
      readFile: async (path) => {
        if (path.endsWith('cdcc-step-history.jsonl')) {
          return JSON.stringify(priorRecord) + '\n';
        }
        if (path.endsWith('cdcc-step-reexec-authorization.txt')) {
          return authFile;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });
    const result = await handleImpl(deps);
    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
  });

  it('audit entry hookId is H6 on every path', async () => {
    let logged = false;
    const deps = makeDeps({
      stdinReader: async () => JSON.stringify({ tool: 'Read' }),
      auditLogger: {
        log: async (entry) => {
          logged = true;
          expect(entry.hookId).toBe('H6');
        },
      } as unknown as AuditLogger,
    });
    await handleImpl(deps);
    expect(logged).toBe(true);
  });
});
