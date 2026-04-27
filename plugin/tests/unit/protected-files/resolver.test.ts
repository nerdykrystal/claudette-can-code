// Stage 09 — Unit tests for ProtectedFilesResolver
// Per §3.09 spec test cases (≥5):
//   1. precompile parses valid yaml → ok
//   2. match /path/.env with persona X → allowed:false; ruleId:'rule-1'
//   3. match /path/role-manifests/x.yaml with 'claude-the-pek-remediator' → allowed:true
//   4. match /path/role-manifests/x.yaml with other persona → allowed:false; allowedPersonas: ['claude-the-pek-remediator']
//   5. Windows case-insensitive: match /PATH/.ENV works
// Additional tests for full branch coverage.

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProtectedFilesResolverImpl } from '../../../src/core/protected-files/resolver.js';

const VALID_YAML = `
version: 1
rules:
  - id: rule-1
    glob: "**/.env*"
    allowed_personas: []
    deny_message: "Environment files contain secrets — never edited via assistant"
  - id: rule-2
    glob: "**/role-manifests/**"
    allowed_personas: ["claude-the-pek-remediator"]
    deny_message: "Role-manifest edits limited to claude-the-pek-remediator persona"
`.trim();

describe('ProtectedFilesResolver — unit tests', () => {
  let tmpDir: string;
  let yamlPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cdcc-resolver-test-'));
    yamlPath = join(tmpDir, 'protected_files.yaml');
  });

  // Clean up temp dir after each test
  // (not critical; test runner will clean tmpdir on exit)

  // Test 1: precompile parses valid yaml → ok (Result.ok = true)
  it('Test 1 — precompile valid yaml returns ok:true', async () => {
    await writeFile(yamlPath, VALID_YAML, 'utf-8');
    const resolver = new ProtectedFilesResolverImpl();
    const result = resolver.precompile(yamlPath);
    expect(result.ok).toBe(true);
  });

  // Test 2: match /path/.env with any persona → allowed:false; ruleId:'rule-1'
  it('Test 2 — match .env path with non-empty persona → allowed:false + ruleId rule-1', async () => {
    await writeFile(yamlPath, VALID_YAML, 'utf-8');
    const resolver = new ProtectedFilesResolverImpl();
    resolver.precompile(yamlPath);
    const result = resolver.match('/project/path/.env', 'claudette-the-code-debugger');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.ruleId).toBe('rule-1');
      expect(result.allowedPersonas).toEqual([]);
      expect(result.denyMessage).toContain('secrets');
    }
  });

  // Test 3: match role-manifests path with 'claude-the-pek-remediator' → allowed:true
  it('Test 3 — match role-manifests path with allowed persona → allowed:true', async () => {
    await writeFile(yamlPath, VALID_YAML, 'utf-8');
    const resolver = new ProtectedFilesResolverImpl();
    resolver.precompile(yamlPath);
    const result = resolver.match(
      '/project/role-manifests/claudette-the-code-debugger.yaml',
      'claude-the-pek-remediator',
    );
    expect(result.allowed).toBe(true);
  });

  // Test 4: match role-manifests path with other persona → allowed:false; allowedPersonas list
  it('Test 4 — match role-manifests path with unauthorized persona → allowed:false + allowedPersonas', async () => {
    await writeFile(yamlPath, VALID_YAML, 'utf-8');
    const resolver = new ProtectedFilesResolverImpl();
    resolver.precompile(yamlPath);
    const result = resolver.match(
      '/project/role-manifests/some-manifest.yaml',
      'claudette-the-code-debugger',
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.ruleId).toBe('rule-2');
      expect(result.allowedPersonas).toEqual(['claude-the-pek-remediator']);
      expect(result.denyMessage).toContain('pek-remediator');
    }
  });

  // Test 5: Windows case-insensitive path matching — /PATH/.ENV should match rule-1
  it('Test 5 — Windows case-insensitive: /PATH/.ENV matches .env* rule', async () => {
    await writeFile(yamlPath, VALID_YAML, 'utf-8');
    const resolver = new ProtectedFilesResolverImpl();
    resolver.precompile(yamlPath);
    const result = resolver.match('/PROJECT/PATH/.ENV', 'claudette-the-code-debugger');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.ruleId).toBe('rule-1');
    }
  });

  // Test 6: non-protected path → allowed:true
  it('Test 6 — non-protected path → allowed:true', async () => {
    await writeFile(yamlPath, VALID_YAML, 'utf-8');
    const resolver = new ProtectedFilesResolverImpl();
    resolver.precompile(yamlPath);
    const result = resolver.match('/project/src/index.ts', 'claudette-the-code-debugger');
    expect(result.allowed).toBe(true);
  });

  // Test 7: match before precompile → fail-closed (not_loaded rule)
  it('Test 7 — match before precompile → fail-closed with h8_not_loaded rule', () => {
    const resolver = new ProtectedFilesResolverImpl();
    const result = resolver.match('/path/.env', 'any-persona');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.ruleId).toBe('h8_not_loaded');
    }
  });

  // Test 8: precompile with non-existent file → read_error
  it('Test 8 — precompile non-existent file → ok:false kind:read_error', () => {
    const resolver = new ProtectedFilesResolverImpl();
    const result = resolver.precompile('/non-existent/protected_files.yaml');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('read_error');
    }
  });

  // Test 9: precompile invalid YAML → parse_error
  it('Test 9 — precompile invalid YAML → ok:false kind:parse_error', async () => {
    await writeFile(yamlPath, ': invalid: yaml: [unclosed', 'utf-8');
    const resolver = new ProtectedFilesResolverImpl();
    const result = resolver.precompile(yamlPath);
    // YAML parser may or may not error on this; if it parses to something, schema fails
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['parse_error', 'schema_error']).toContain(result.error.kind);
    }
  });

  // Test 10: precompile schema-invalid YAML (missing required fields) → schema_error
  it('Test 10 — precompile schema-invalid YAML → ok:false kind:schema_error', async () => {
    await writeFile(yamlPath, 'version: 1\nrules:\n  - id: "no-glob"\n', 'utf-8');
    const resolver = new ProtectedFilesResolverImpl();
    const result = resolver.precompile(yamlPath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('schema_error');
    }
  });

  // Cleanup
  it.concurrent('cleanup', async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });
});
