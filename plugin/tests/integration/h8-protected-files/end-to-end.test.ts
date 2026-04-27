// Stage 09 — Integration test: H8 Protected Files hook end-to-end.
// Per §3.09 integration spec:
//   1. Load real protected_files.yaml.example; invoke H8 with mock PreToolUse payload;
//      verify exit 2 on protected path (Write to .env file by non-allowed persona).
//   2. Verify exit 0 on allowed path (non-protected file).
//   3. Verify exit 2 when persona is absent (fail-closed).
//   4. Verify exit 2 when yaml config load fails (fail-closed).
//   5. Verify exit 0 for allowed persona on role-manifests path.

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { handleImpl, type HandleDeps } from '../../../src/hooks/h8-protected-files/index.js';
import { AuditLogger } from '../../../src/core/audit/index.js';
import { ProtectedFilesResolverImpl } from '../../../src/core/protected-files/resolver.js';

const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const YAML_EXAMPLE = join(
  PLUGIN_ROOT,
  'src',
  'core',
  'protected-files',
  'protected_files.yaml.example',
);

// Stripped version without comments for actual runtime use
const RUNTIME_YAML = `version: 1
rules:
  - id: rule-1
    glob: "**/.env*"
    allowed_personas: []
    deny_message: "Environment files contain secrets — never edited via assistant"
  - id: rule-2
    glob: "**/role-manifests/**"
    allowed_personas: ["claude-the-pek-remediator"]
    deny_message: "Role-manifest edits limited to claude-the-pek-remediator persona"
`;

function noopLogger(): AuditLogger {
  return {
    log: async () => undefined,
    close: () => undefined,
  } as unknown as AuditLogger;
}

describe('H8 Protected Files — integration end-to-end', () => {
  let tmpDir: string;
  let yamlPath: string;
  let resolverInstance: ProtectedFilesResolverImpl;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cdcc-h8-integration-'));
    yamlPath = join(tmpDir, 'protected_files.yaml');
    await writeFile(yamlPath, RUNTIME_YAML, 'utf-8');

    // Pre-load resolver once for all tests (SessionStart pattern)
    resolverInstance = new ProtectedFilesResolverImpl();
    const compileResult = resolverInstance.precompile(yamlPath);
    if (!compileResult.ok) {
      throw new Error(`Failed to precompile: ${compileResult.error.message}`);
    }
  });

  // Test 1: Write to .env file by non-allowed persona → exit 2
  it('Test 1 — Write to .env by non-allowed persona → exit 2 + structured stderr', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: '/project/.env' },
          currentPersonaRole: 'claudette-the-code-debugger',
        }),
      auditLogger: noopLogger(),
      exit: (() => { throw new Error('exit'); }) as () => never,
      stderrWrite: (msg) => stderr.push(msg),
      protectedFilesYamlPath: yamlPath,
      resolver: resolverInstance,
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    expect(stderr.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('rule-1');
    expect(parsed.path).toBe('/project/.env');
    expect(parsed.persona).toBe('claudette-the-code-debugger');
    expect(parsed.deny_message).toBeTruthy();
  });

  // Test 2: Write to a non-protected path → exit 0
  it('Test 2 — Write to non-protected file → exit 0', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: '/project/src/core/index.ts' },
          currentPersonaRole: 'claudette-the-code-debugger',
        }),
      auditLogger: noopLogger(),
      exit: (() => { throw new Error('exit'); }) as () => never,
      stderrWrite: (msg) => stderr.push(msg),
      protectedFilesYamlPath: yamlPath,
      resolver: resolverInstance,
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
    expect(stderr.length).toBe(0);
  });

  // Test 3: missing currentPersonaRole → exit 2 (fail-closed)
  it('Test 3 — missing currentPersonaRole → exit 2 fail-closed', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: '/project/src/index.ts' },
          // no currentPersonaRole
        }),
      auditLogger: noopLogger(),
      exit: (() => { throw new Error('exit'); }) as () => never,
      stderrWrite: (msg) => stderr.push(msg),
      protectedFilesYamlPath: yamlPath,
      resolver: resolverInstance,
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    expect(result.audit.decision).toBe('block');
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h8_no_persona');
  });

  // Test 4: bad yaml path → exit 2 fail-closed with h8_config_load_error
  it('Test 4 — yaml config load failure → exit 2 fail-closed with h8_config_load_error', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: '/project/src/index.ts' },
          currentPersonaRole: 'claudette-the-code-debugger',
        }),
      auditLogger: noopLogger(),
      exit: (() => { throw new Error('exit'); }) as () => never,
      stderrWrite: (msg) => stderr.push(msg),
      protectedFilesYamlPath: '/non-existent/protected_files.yaml',
      // no pre-loaded resolver — will try to precompile from bad path
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(stderr[0]) as Record<string, unknown>;
    expect(parsed.rule).toBe('h8_config_load_error');
  });

  // Test 5: Write to role-manifests by allowed persona → exit 0
  it('Test 5 — Write to role-manifests by claude-the-pek-remediator → exit 0', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Write',
          args: { file_path: '/grand_repo/role-manifests/some-manifest.yaml' },
          currentPersonaRole: 'claude-the-pek-remediator',
        }),
      auditLogger: noopLogger(),
      exit: (() => { throw new Error('exit'); }) as () => never,
      stderrWrite: (msg) => stderr.push(msg),
      protectedFilesYamlPath: yamlPath,
      resolver: resolverInstance,
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
  });

  // Test 6: non-Write/Edit/Bash tool → exit 0 (H8 does not apply)
  it('Test 6 — non-Write/Edit/Bash tool → exit 0', async () => {
    const stderr: string[] = [];
    const deps: HandleDeps = {
      stdinReader: async () =>
        JSON.stringify({
          tool: 'Read',
          args: { file_path: '/project/.env' },
          currentPersonaRole: 'claudette-the-code-debugger',
        }),
      auditLogger: noopLogger(),
      exit: (() => { throw new Error('exit'); }) as () => never,
      stderrWrite: (msg) => stderr.push(msg),
      protectedFilesYamlPath: yamlPath,
      resolver: resolverInstance,
    };

    const result = await handleImpl(deps);

    expect(result.exitCode).toBe(0);
    expect(result.audit.decision).toBe('allow');
  });

  // Test 7: example yaml file exists and is valid
  it('Test 7 — protected_files.yaml.example exists and is precompilable', async () => {
    expect(existsSync(YAML_EXAMPLE)).toBe(true);
    const testResolver = new ProtectedFilesResolverImpl();
    const result = testResolver.precompile(YAML_EXAMPLE);
    expect(result.ok).toBe(true);
  });

  // Cleanup
  it.concurrent('cleanup', async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });
});
