import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface YourSetupCatalog {
  skills: string[];
  plugins: string[];
  mcpServers: string[];
  source: { settingsPath: string; pluginsDir: string };
}

export async function buildCatalog(claudeRoot: string): Promise<YourSetupCatalog> {
  const skills: string[] = [];
  const plugins: string[] = [];
  const mcpServers: string[] = [];

  const settingsPath = join(claudeRoot, 'settings.json');
  const pluginsDir = join(claudeRoot, 'plugins');
  const skillsDir = join(claudeRoot, 'skills');

  // Try to parse settings.json for mcpServers
  try {
    const settingsContent = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent) as Record<string, unknown>;

    if (settings.mcpServers && typeof settings.mcpServers === 'object') {
      mcpServers.push(...Object.keys(settings.mcpServers));
    }
  } catch {
    // Graceful fallback: no MCP servers found
  }

  // List plugins directory
  try {
    const pluginDirs = await readdir(pluginsDir, { withFileTypes: true });
    for (const entry of pluginDirs) {
      if (entry.isDirectory()) {
        plugins.push(entry.name);
      }
    }
  } catch {
    // Graceful fallback: no plugins directory
  }

  // List skills directory
  try {
    const skillDirs = await readdir(skillsDir, { withFileTypes: true });
    for (const entry of skillDirs) {
      if (entry.isDirectory()) {
        skills.push(entry.name);
      }
    }
  } catch {
    // Graceful fallback: no skills directory
  }

  return {
    skills,
    plugins,
    mcpServers,
    source: { settingsPath, pluginsDir },
  };
}
