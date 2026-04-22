import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCatalog } from '../../src/core/catalog/index.js';

describe('Your Setup Catalog (FR-017)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cdcc-catalog-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('missing claudeRoot returns all empty arrays', async () => {
    const nonExistentDir = join(testDir, 'non-existent');

    const result = await buildCatalog(nonExistentDir);

    expect(result.skills).toEqual([]);
    expect(result.plugins).toEqual([]);
    expect(result.mcpServers).toEqual([]);
  });

  it('rich claudeRoot with settings.json + plugins + skills', async () => {
    // Create settings.json with mcpServers
    const settingsPath = join(testDir, 'settings.json');
    await writeFile(
      settingsPath,
      JSON.stringify({
        mcpServers: {
          'postgres': { command: 'node', args: [] },
          'github': { command: 'node', args: [] },
        },
        otherField: 'value',
      })
    );

    // Create plugins directory with subdirs
    const pluginsDir = join(testDir, 'plugins');
    await mkdir(pluginsDir, { recursive: true });
    await mkdir(join(pluginsDir, 'plugin1'), { recursive: true });
    await mkdir(join(pluginsDir, 'plugin2'), { recursive: true });

    // Create skills directory with subdirs
    const skillsDir = join(testDir, 'skills');
    await mkdir(skillsDir, { recursive: true });
    await mkdir(join(skillsDir, 'skill1'), { recursive: true });
    await mkdir(join(skillsDir, 'skill2'), { recursive: true });
    await mkdir(join(skillsDir, 'skill3'), { recursive: true });

    const result = await buildCatalog(testDir);

    expect(result.skills).toEqual(['skill1', 'skill2', 'skill3']);
    expect(result.plugins).toEqual(['plugin1', 'plugin2']);
    expect(result.mcpServers).toEqual(['postgres', 'github']);
    expect(result.source.settingsPath).toBe(settingsPath);
  });

  it('malformed settings.json (invalid JSON)', async () => {
    const settingsPath = join(testDir, 'settings.json');
    await writeFile(settingsPath, 'not valid json {');

    const result = await buildCatalog(testDir);

    // Graceful fallback: mcpServers empty, but rest can still be built
    expect(result.mcpServers).toEqual([]);
  });

  it('settings.json with empty mcpServers object', async () => {
    const settingsPath = join(testDir, 'settings.json');
    await writeFile(
      settingsPath,
      JSON.stringify({
        mcpServers: {},
        theme: 'dark',
      })
    );

    const result = await buildCatalog(testDir);

    expect(result.mcpServers).toEqual([]);
  });

  it('missing settings.json gracefully returns empty mcpServers', async () => {
    const result = await buildCatalog(testDir);

    expect(result.mcpServers).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.plugins).toEqual([]);
  });

  it('missing plugins directory gracefully returns empty plugins', async () => {
    const settingsPath = join(testDir, 'settings.json');
    await writeFile(settingsPath, JSON.stringify({ mcpServers: { test: {} } }));

    const skillsDir = join(testDir, 'skills');
    await mkdir(skillsDir, { recursive: true });
    await mkdir(join(skillsDir, 'skill1'), { recursive: true });

    const result = await buildCatalog(testDir);

    expect(result.plugins).toEqual([]);
    expect(result.skills).toEqual(['skill1']);
    expect(result.mcpServers).toEqual(['test']);
  });

  it('missing skills directory gracefully returns empty skills', async () => {
    const settingsPath = join(testDir, 'settings.json');
    await writeFile(settingsPath, JSON.stringify({ mcpServers: { test: {} } }));

    const pluginsDir = join(testDir, 'plugins');
    await mkdir(pluginsDir, { recursive: true });
    await mkdir(join(pluginsDir, 'plugin1'), { recursive: true });

    const result = await buildCatalog(testDir);

    expect(result.skills).toEqual([]);
    expect(result.plugins).toEqual(['plugin1']);
  });

  it('source metadata correctly populated', async () => {
    const pluginsDir = join(testDir, 'plugins');
    await mkdir(pluginsDir, { recursive: true });
    await mkdir(join(pluginsDir, 'p1'), { recursive: true });

    const result = await buildCatalog(testDir);

    expect(result.source.settingsPath).toBe(join(testDir, 'settings.json'));
    expect(result.source.pluginsDir).toBe(join(testDir, 'plugins'));
  });
});
