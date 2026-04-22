import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installHooks, type HookEntry } from '../../src/core/hook-installer/index.js';

describe('HookInstaller', () => {
  let testDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'hooks-'));
    settingsPath = join(testDir, 'settings.json');
    await writeFile(settingsPath, JSON.stringify({}), 'utf-8');
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should install hooks into empty settings.json', async () => {
    const entries: HookEntry[] = [
      {
        id: 'H1',
        event: 'UserPromptSubmit',
        handler: 'h1-handler',
      },
    ];

    const result = await installHooks(settingsPath, entries);
    expect(result.ok).toBe(true);

    const content = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);

    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.UserPromptSubmit).toBeDefined();
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.UserPromptSubmit[0].id).toBe('H1');
  });

  it('should merge into existing settings while preserving other keys', async () => {
    const initialSettings = {
      theme: 'dark',
      model: 'opus',
      hooks: {
        SomeEvent: [{ id: 'X', event: 'SomeEvent', handler: 'x-handler' }],
      },
    };

    await writeFile(settingsPath, JSON.stringify(initialSettings), 'utf-8');

    const entries: HookEntry[] = [
      {
        id: 'H1',
        event: 'UserPromptSubmit',
        handler: 'h1-handler',
      },
    ];

    const result = await installHooks(settingsPath, entries);
    expect(result.ok).toBe(true);

    const content = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);

    // Existing keys preserved
    expect(settings.theme).toBe('dark');
    expect(settings.model).toBe('opus');

    // Existing hooks preserved
    expect(settings.hooks.SomeEvent).toHaveLength(1);
    expect(settings.hooks.SomeEvent[0].id).toBe('X');

    // New hook added
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.UserPromptSubmit[0].id).toBe('H1');
  });

  it('should be idempotent (re-install does not duplicate)', async () => {
    const entries: HookEntry[] = [
      {
        id: 'H1',
        event: 'UserPromptSubmit',
        handler: 'h1-handler',
      },
    ];

    await installHooks(settingsPath, entries);
    await installHooks(settingsPath, entries);

    const content = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);

    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
  });

  it('should reject malformed settings.json (PARSE_FAIL)', async () => {
    await writeFile(settingsPath, 'not valid json', 'utf-8');

    const entries: HookEntry[] = [
      {
        id: 'H1',
        event: 'UserPromptSubmit',
        handler: 'h1-handler',
      },
    ];

    const result = await installHooks(settingsPath, entries);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_FAIL');
    }
  });

  it('should create parent directory if missing', async () => {
    const deepPath = join(testDir, 'deep', 'nested', 'settings.json');

    const entries: HookEntry[] = [
      {
        id: 'H1',
        event: 'UserPromptSubmit',
        handler: 'h1-handler',
      },
    ];

    const result = await installHooks(deepPath, entries);
    expect(result.ok).toBe(true);

    const content = await readFile(deepPath, 'utf-8');
    expect(content).toBeDefined();
  });

  it('should preserve JSON round-trip validity', async () => {
    const entries: HookEntry[] = [
      {
        id: 'H1',
        event: 'UserPromptSubmit',
        handler: 'h1-handler',
        matcher: { tool: 'Write' },
      },
      {
        id: 'H2',
        event: 'Stop',
        handler: 'h2-handler',
      },
    ];

    const result = await installHooks(settingsPath, entries);
    expect(result.ok).toBe(true);

    const content = await readFile(settingsPath, 'utf-8');
    // This will throw if invalid JSON
    const settings = JSON.parse(content);
    expect(settings).toBeDefined();
  });

  it('should atomically write (no partial state on success)', async () => {
    const entries: HookEntry[] = [
      {
        id: 'H1',
        event: 'UserPromptSubmit',
        handler: 'h1-handler',
      },
    ];

    await installHooks(settingsPath, entries);

    // Read and verify exactly one write succeeded
    const content = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);

    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.UserPromptSubmit[0].id).toBe('H1');
  });
});
