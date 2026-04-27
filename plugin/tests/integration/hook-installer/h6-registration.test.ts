/**
 * Integration test: H6 registration via installAllHooks
 *
 * Verifies that after Stage 07's hook installer runs installAllHooks(),
 * the resulting settings.json contains an H6 entry sourced from plugin.json.
 *
 * Closes N-1 (Insight B Stage 11-specific closure):
 * - H6 (Step ReExec) appears in settings.json after installAllHooks()
 * - H6 entry is read from plugin.json (single source of truth)
 * - CLI install list (previously hardcoded) is no longer needed
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installAllHooks } from '../../../src/core/hook-installer/index.js';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

describe('Hook Installer - H6 Registration', () => {
  let tempDir: string;
  let tempSettingsPath: string;
  let tempPluginJsonPath: string;

  beforeEach(() => {
    // Create a temporary directory for this test run
    const randomSuffix = randomBytes(4).toString('hex');
    tempDir = resolve(tmpdir(), `cdcc-h6-test-${randomSuffix}`);
    mkdirSync(tempDir, { recursive: true });

    tempSettingsPath = resolve(tempDir, 'settings.json');
    tempPluginJsonPath = resolve(tempDir, 'plugin.json');
  });

  afterEach(() => {
    // Clean up the temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper: write a plugin.json stub with all 8 hooks including H6
   */
  function writeTestPluginJson(path: string) {
    const pluginJson = {
      name: 'cdcc',
      version: '1.1.0',
      description: 'Test plugin',
      hooks: {
        entries: [
          { id: 'H1', event: 'UserPromptSubmit', handler: 'dist/hooks/h1-input-manifest/index.js' },
          { id: 'H2', event: 'Stop', handler: 'dist/hooks/h2-deviation-manifest/index.js' },
          { id: 'H3', event: 'PreToolUse', handler: 'dist/hooks/h3-sandbox-hygiene/index.js' },
          { id: 'H4', event: 'PreToolUse', handler: 'dist/hooks/h4-model-assignment/index.js' },
          { id: 'H5', event: 'Stop', handler: 'dist/hooks/h5-gate-result/index.js' },
          { id: 'H6', event: 'PreToolUse', handler: 'dist/hooks/h6-step-reexec/index.js' },
          { id: 'H8', event: 'PreToolUse', handler: 'dist/hooks/h8-protected-files/index.js' },
          { id: 'H9', event: 'Stop', handler: 'dist/hooks/h9-recovery-verifier/index.js' },
        ],
      },
    };
    writeFileSync(path, JSON.stringify(pluginJson, null, 2), 'utf-8');
  }

  it('should install H6 from plugin.json into settings.json via installAllHooks()', async () => {
    // Arrange: write test plugin.json with all 8 hooks
    writeTestPluginJson(tempPluginJsonPath);

    // Act: call installAllHooks with the test plugin.json
    const result = await installAllHooks({
      pluginJsonPath: tempPluginJsonPath,
      settingsJsonPath: tempSettingsPath,
    });

    // Assert: installation succeeded
    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('Install error:', result.error);
      throw new Error(`installAllHooks failed: ${result.error.message}`);
    }

    // Assert: returned hooks include H6
    const installedHooks = result.value.hooks;
    const h6Entry = installedHooks.find((h) => h.id === 'H6');
    expect(h6Entry).toBeDefined();
    expect(h6Entry?.event).toBe('PreToolUse');
    expect(h6Entry?.handler).toBe('dist/hooks/h6-step-reexec/index.js');
  });

  it('should write H6 entry to settings.json hooks.PreToolUse array', async () => {
    // Arrange: write test plugin.json
    writeTestPluginJson(tempPluginJsonPath);

    // Act: install hooks
    const installResult = await installAllHooks({
      pluginJsonPath: tempPluginJsonPath,
      settingsJsonPath: tempSettingsPath,
    });

    expect(installResult.ok).toBe(true);

    // Read and parse the written settings.json
    const settingsContent = readFileSync(tempSettingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent) as Record<string, unknown>;

    // Assert: settings has hooks object
    expect(settings.hooks).toBeDefined();
    expect(typeof settings.hooks).toBe('object');

    const hooksRecord = settings.hooks as Record<string, unknown>;

    // Assert: PreToolUse event array exists
    expect(hooksRecord.PreToolUse).toBeDefined();
    expect(Array.isArray(hooksRecord.PreToolUse)).toBe(true);

    // Assert: H6 entry is in the PreToolUse array
    const preToolUseArray = hooksRecord.PreToolUse as unknown[];
    const h6InSettings = preToolUseArray.find(
      (entry) => (entry as Record<string, unknown>)?.id === 'H6',
    );

    expect(h6InSettings).toBeDefined();
    expect((h6InSettings as Record<string, unknown>)?.event).toBe('PreToolUse');
    expect((h6InSettings as Record<string, unknown>)?.handler).toBe('dist/hooks/h6-step-reexec/index.js');
  });

  it('should verify H6 registration hash is computed and returned', async () => {
    // Arrange: write test plugin.json
    writeTestPluginJson(tempPluginJsonPath);

    // Act: install hooks
    const result = await installAllHooks({
      pluginJsonPath: tempPluginJsonPath,
      settingsJsonPath: tempSettingsPath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Assert: settingsJsonHash is a non-empty string
    const { settingsJsonHash } = result.value;
    expect(typeof settingsJsonHash).toBe('string');
    expect(settingsJsonHash.length).toBeGreaterThan(0);

    // Assert: hash is a valid SHA-256 hex string (64 chars)
    expect(settingsJsonHash).toMatch(/^[a-f0-9]{64}$/i);
  });

  it('should be idempotent: running installAllHooks twice should result in same H6 entry', async () => {
    // Arrange: write test plugin.json
    writeTestPluginJson(tempPluginJsonPath);

    // Act: first install
    const result1 = await installAllHooks({
      pluginJsonPath: tempPluginJsonPath,
      settingsJsonPath: tempSettingsPath,
    });

    expect(result1.ok).toBe(true);

    // Read settings after first install
    const settings1Content = readFileSync(tempSettingsPath, 'utf-8');
    const settings1 = JSON.parse(settings1Content);
    const h6Count1 = ((settings1.hooks as Record<string, unknown>)
      .PreToolUse as unknown[]).filter(
      (e) => (e as Record<string, unknown>)?.id === 'H6',
    ).length;

    // Act: second install (should be idempotent)
    const result2 = await installAllHooks({
      pluginJsonPath: tempPluginJsonPath,
      settingsJsonPath: tempSettingsPath,
    });

    expect(result2.ok).toBe(true);

    // Read settings after second install
    const settings2Content = readFileSync(tempSettingsPath, 'utf-8');
    const settings2 = JSON.parse(settings2Content);
    const h6Count2 = ((settings2.hooks as Record<string, unknown>)
      .PreToolUse as unknown[]).filter(
      (e) => (e as Record<string, unknown>)?.id === 'H6',
    ).length;

    // Assert: H6 entry count is the same (idempotent — no duplicates)
    expect(h6Count1).toBe(1);
    expect(h6Count2).toBe(1);
    expect(h6Count1).toBe(h6Count2);
  });

  it('should install all 8 hooks including H6 from real plugin.json', async () => {
    // Use the real plugin.json from the repository
    const realPluginJsonPath = resolve(
      'C:/Users/NerdyKrystal/cold read 2026-04-25/claudette-can-code/plugin/plugin.json',
    );

    // Skip if real plugin.json doesn't exist (test environment)
    if (!existsSync(realPluginJsonPath)) {
      console.warn(
        'Real plugin.json not found; skipping real-bundle test',
      );
      return;
    }

    // Act: install from real plugin.json
    const result = await installAllHooks({
      pluginJsonPath: realPluginJsonPath,
      settingsJsonPath: tempSettingsPath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('Install error:', result.error);
      throw new Error(`installAllHooks failed: ${result.error.message}`);
    }

    // Assert: all 8 hooks were installed
    const installedHooks = result.value.hooks;
    expect(installedHooks.length).toBe(8);

    // Assert: H6 is present with correct properties
    const h6 = installedHooks.find((h) => h.id === 'H6');
    expect(h6).toBeDefined();
    expect(h6?.id).toBe('H6');
    expect(h6?.event).toBe('PreToolUse');
    expect(h6?.handler).toBe('dist/hooks/h6-step-reexec/index.js');

    // Read settings.json and verify H6 is in the file
    const settingsContent = readFileSync(tempSettingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent);
    const preToolUseArray = (settings.hooks?.PreToolUse || []) as unknown[];
    const h6InSettings = preToolUseArray.find(
      (e) => (e as Record<string, unknown>)?.id === 'H6',
    );
    expect(h6InSettings).toBeDefined();
  });

  it('should verify H6 PreToolUse event type matches plugin.json specification', async () => {
    // Arrange
    writeTestPluginJson(tempPluginJsonPath);

    // Act
    const result = await installAllHooks({
      pluginJsonPath: tempPluginJsonPath,
      settingsJsonPath: tempSettingsPath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Assert: H6 event is specifically PreToolUse (not Stop or UserPromptSubmit)
    const h6 = result.value.hooks.find((h) => h.id === 'H6');
    expect(h6?.event).toBe('PreToolUse');
    expect(h6?.event).not.toBe('Stop');
    expect(h6?.event).not.toBe('UserPromptSubmit');
  });
});
