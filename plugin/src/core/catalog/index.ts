// Stage 03 (Haiku) will implement per d2r-plan.md Stage 03 section.
export type YourSetupCatalog = { skills: string[]; plugins: string[]; mcpServers: string[]; source: { settingsPath: string; pluginsDir: string } };
export async function buildCatalog(_claudeRoot: string): Promise<{ ok: false; error: { code: 'NOT_IMPLEMENTED'; detail: string } }> {
  return { ok: false, error: { code: 'NOT_IMPLEMENTED', detail: 'Stage 03 deliverable' } };
}
