// Tests for plugin-json-reader.ts — Stage 07.
// Verifies runtime read of plugin.json as single source of truth.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readPluginHooks } from '../../../src/core/hook-installer/plugin-json-reader.js';

describe('readPluginHooks', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cdcc-pjr-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns hooks array for valid plugin.json with 6 entries', async () => {
    const pluginJson = {
      name: 'cdcc',
      hooks: {
        entries: [
          { id: 'H1', event: 'UserPromptSubmit', handler: 'dist/hooks/h1-input-manifest/index.js' },
          { id: 'H2', event: 'Stop', handler: 'dist/hooks/h2-deviation-manifest/index.js' },
          { id: 'H3', event: 'PreToolUse', handler: 'dist/hooks/h3-sandbox-hygiene/index.js' },
          { id: 'H4', event: 'PreToolUse', handler: 'dist/hooks/h4-model-assignment/index.js' },
          { id: 'H5', event: 'Stop', handler: 'dist/hooks/h5-gate-result/index.js' },
          { id: 'H6', event: 'PreToolUse', handler: 'dist/hooks/h6-step-reexec/index.js' },
        ],
      },
    };
    const path = join(testDir, 'plugin.json');
    await writeFile(path, JSON.stringify(pluginJson), 'utf-8');

    const result = readPluginHooks(path);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(6);
      expect(result.value[0].id).toBe('H1');
      expect(result.value[0].event).toBe('UserPromptSubmit');
      expect(result.value[5].id).toBe('H6');
    }
  });

  it('returns file_not_found for missing plugin.json', () => {
    const result = readPluginHooks(join(testDir, 'nonexistent.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('file_not_found');
      expect(result.error.message).toContain('nonexistent.json');
    }
  });

  it('returns invalid_json for malformed JSON', async () => {
    const path = join(testDir, 'plugin.json');
    await writeFile(path, 'not valid json {{{', 'utf-8');

    const result = readPluginHooks(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_json');
      expect(result.error.message).toMatch(/invalid JSON/i);
    }
  });

  it('returns no_hooks_array when hooks.entries is missing', async () => {
    const path = join(testDir, 'plugin.json');
    await writeFile(path, JSON.stringify({ name: 'cdcc', hooks: {} }), 'utf-8');

    const result = readPluginHooks(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('no_hooks_array');
    }
  });

  it('returns no_hooks_array when hooks key is absent', async () => {
    const path = join(testDir, 'plugin.json');
    await writeFile(path, JSON.stringify({ name: 'cdcc' }), 'utf-8');

    const result = readPluginHooks(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('no_hooks_array');
    }
  });

  it('preserves matcher field when present', async () => {
    const pluginJson = {
      hooks: {
        entries: [
          {
            id: 'H3',
            event: 'PreToolUse',
            handler: 'dist/hooks/h3-sandbox-hygiene/index.js',
            matcher: 'tool_name',
          },
        ],
      },
    };
    const path = join(testDir, 'plugin.json');
    await writeFile(path, JSON.stringify(pluginJson), 'utf-8');

    const result = readPluginHooks(path);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].matcher).toBe('tool_name');
    }
  });

  it('reads the real plugin.json (integration: 6 entries H1-H6)', () => {
    // Locate plugin.json relative to this test file: tests/unit/hook-installer/ → plugin/plugin.json
    const realPluginJsonPath = join(
      // __dirname equivalent via import.meta.url would require ESM; use relative from testDir's dir root
      // Safe fallback: resolve from cwd + plugin subdir
      process.cwd(),
      'plugin.json',
    );
    const result = readPluginHooks(realPluginJsonPath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // plugin.json currently has H1-H6 (6 entries)
      expect(result.value.length).toBeGreaterThanOrEqual(6);
      const ids = result.value.map((h) => h.id);
      expect(ids).toContain('H1');
      expect(ids).toContain('H6');
    }
  });
});
