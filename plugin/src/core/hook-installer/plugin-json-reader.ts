// plugin-json-reader.ts — Stage 07.
// Single source of truth: read hook entries from plugin.json at runtime.
// Closes H-3 (systemic): no hardcoded hook ID list anywhere; plugin.json is SoT.

import { readFileSync } from 'node:fs';
import type { Result } from '../types/index.js';

export interface PluginJsonHookEntry {
  id: string;
  event: string;
  handler: string;
  matcher?: string;
}

export type PluginJsonError =
  | { kind: 'file_not_found'; path: string; message: string }
  | { kind: 'invalid_json'; message: string }
  | { kind: 'no_hooks_array'; message: string };

/**
 * Read hook entries from plugin.json at runtime.
 * Returns a Result with the array of hook entries on success,
 * or a typed error on failure.
 *
 * @param pluginJsonPath - Absolute path to plugin.json
 */
export function readPluginHooks(
  pluginJsonPath: string,
): Result<PluginJsonHookEntry[], PluginJsonError> {
  let raw: string;
  try {
    raw = readFileSync(pluginJsonPath, 'utf-8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return {
        ok: false,
        error: {
          kind: 'file_not_found',
          path: pluginJsonPath,
          message: `plugin.json not found at: ${pluginJsonPath}`,
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: 'file_not_found',
        path: pluginJsonPath,
        message: `Cannot read plugin.json: ${e.message}`,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        kind: 'invalid_json',
        message: `plugin.json contains invalid JSON: ${msg}`,
      },
    };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('hooks' in parsed) ||
    typeof (parsed as Record<string, unknown>).hooks !== 'object' ||
    (parsed as Record<string, unknown>).hooks === null ||
    !('entries' in ((parsed as Record<string, unknown>).hooks as Record<string, unknown>)) ||
    !Array.isArray(
      ((parsed as Record<string, unknown>).hooks as Record<string, unknown>).entries,
    )
  ) {
    return {
      ok: false,
      error: {
        kind: 'no_hooks_array',
        message: 'plugin.json missing required hooks.entries array',
      },
    };
  }

  const entries = (
    (parsed as Record<string, unknown>).hooks as Record<string, unknown>
  ).entries as unknown[];

  const hooks: PluginJsonHookEntry[] = entries.map((e) => {
    const entry = e as Record<string, unknown>;
    return {
      id: String(entry.id ?? ''),
      event: String(entry.event ?? ''),
      handler: String(entry.handler ?? ''),
      ...(entry.matcher !== undefined ? { matcher: String(entry.matcher) } : {}),
    };
  });

  return { ok: true, value: hooks };
}
