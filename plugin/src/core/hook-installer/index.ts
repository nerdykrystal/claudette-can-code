// Hook Installer — Stage 07 rewrite.
// Reads hook entries from plugin.json at runtime (single source of truth).
// Uses write-file-atomic for settings.json writes.
// Uses proper-lockfile for settings.json write coordination (closes
// M-stage05-lockfile-skip carry-forward for settings.json path per Finding 16).
//
// Closes:
//   gate-22 H-1 (atomic write pattern for settings.json)
//   gate-22 H-3 (CLI install list drift — systemic via runtime read)
//   M-3, M-11 (hook installer correctness)
//   Insight B (CLI install list deleted; runtime read replaces it)

import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import lockfile from 'proper-lockfile';
import writeFileAtomic from 'write-file-atomic';
import type { Result } from '../types/index.js';
import { readPluginHooks, type PluginJsonHookEntry } from './plugin-json-reader.js';
import type { AtomicWriteError } from '../atomic-write/index.js';

export type { PluginJsonHookEntry };
export type { PluginJsonError } from './plugin-json-reader.js';

export interface InstalledHooks {
  hooks: PluginJsonHookEntry[];
  settingsJsonHash: string;
}

export type InstallError =
  | { kind: 'plugin_json_error'; cause: import('./plugin-json-reader.js').PluginJsonError; message: string }
  | { kind: 'settings_write_failed'; cause: AtomicWriteError; message: string }
  | { kind: 'settings_read_failed'; message: string }
  | { kind: 'settings_parse_failed'; message: string };

// Keep legacy HookEntry + installHooks export for backward compat with existing tests.
export interface HookEntry {
  id: string;
  event: string;
  handler: string;
  matcher?: Record<string, unknown>;
}

export interface InstallHooksError {
  code: 'READ_FAIL' | 'WRITE_FAIL' | 'PARSE_FAIL';
  detail: string;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Ensure the settings file exists (proper-lockfile requires file to pre-exist). */
function ensureSettingsFile(settingsPath: string): void {
  if (!existsSync(settingsPath)) {
    writeFileAtomic.sync(settingsPath, JSON.stringify({}), 'utf-8');
  }
}

/** Read and parse existing settings JSON. Returns {} on ENOENT. Throws on other errors. */
async function readSettings(settingsPath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(settingsPath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error) {
      const fsErr = err as NodeJS.ErrnoException;
      if (fsErr.code === 'ENOENT') return {};
    }
    throw err;
  }
}

/** Merge a single hook entry into a hooks record (idempotent by id). */
function mergeEntry(
  hooksRecord: Record<string, unknown>,
  entry: { id: string; event: string; handler: string; matcher?: unknown },
): Result<void, { code: 'PARSE_FAIL'; detail: string }> {
  const event = entry.event;
  if (!hooksRecord[event]) hooksRecord[event] = [];
  const eventArray = hooksRecord[event];
  if (!Array.isArray(eventArray)) {
    return { ok: false, error: { code: 'PARSE_FAIL', detail: `settings.hooks[${event}] is not an array` } };
  }
  const existingIds = new Set(eventArray.map((h: unknown) => (h as Record<string, unknown>)?.id));
  if (!existingIds.has(entry.id)) eventArray.push(entry);
  return { ok: true, value: undefined };
}

/** Acquire a proper-lockfile lock with standard retry config. */
async function acquireLock(path: string): Promise<() => Promise<void>> {
  return lockfile(path, {
    retries: { retries: 5, minTimeout: 100, maxTimeout: 500 },
    stale: 10000,
  });
}

// ── Legacy installHooks ───────────────────────────────────────────────────────

/**
 * Legacy installHooks: install a caller-supplied list of hook entries.
 * Preserved for backward compat with existing tests.
 * Merges entries into settings.json; writes atomically via write-file-atomic
 * + proper-lockfile coordination.
 */
export async function installHooks(
  settingsPath: string,
  entries: HookEntry[],
): Promise<Result<void, InstallHooksError>> {
  try {
    const parentDir = dirname(settingsPath);
    await mkdir(parentDir, { recursive: true });
    ensureSettingsFile(settingsPath);

    let release: (() => Promise<void>) | undefined;
    try {
      release = await acquireLock(settingsPath);

      let settings: Record<string, unknown>;
      try {
        settings = await readSettings(settingsPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: { code: msg.includes('JSON') ? 'PARSE_FAIL' : 'WRITE_FAIL', detail: msg } };
      }

      if (!settings.hooks) settings.hooks = {};
      if (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
        return { ok: false, error: { code: 'PARSE_FAIL', detail: 'settings.hooks is not a record' } };
      }

      const hooksRecord = settings.hooks as Record<string, unknown>;
      for (const entry of entries) {
        const mergeResult = mergeEntry(hooksRecord, entry);
        if (!mergeResult.ok) return mergeResult;
      }

      const serialized = JSON.stringify(settings);
      JSON.parse(serialized); // round-trip validation
      writeFileAtomic.sync(settingsPath, serialized, 'utf-8');
      return { ok: true, value: undefined };
    } finally {
      if (release) await release();
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: detail.includes('JSON') ? 'PARSE_FAIL' : 'WRITE_FAIL', detail } };
  }
}

// ── installAllHooks ───────────────────────────────────────────────────────────

/** Build an AtomicWriteError from a caught write exception. */
function makeAtomicWriteError(settingsJsonPath: string, cause: string): AtomicWriteError {
  if (cause.includes('rename') || cause.includes('EPERM')) {
    return { kind: 'rename_failed', from: `${settingsJsonPath}.tmp`, to: settingsJsonPath, cause, message: `Atomic rename failed: ${cause}` };
  }
  return { kind: 'fsync_failed', path: settingsJsonPath, cause, message: `Atomic write failed: ${cause}` };
}

/**
 * installAllHooks: read hooks from plugin.json and install into settings.json.
 * This is the Stage 07 primary API — closes H-3 systemic (no hardcoded list).
 *
 * @param opts.pluginJsonPath - Path to plugin.json (single source of truth)
 * @param opts.settingsJsonPath - Path to settings.json to merge hooks into
 */
export async function installAllHooks(opts: {
  pluginJsonPath: string;
  settingsJsonPath: string;
}): Promise<Result<InstalledHooks, InstallError>> {
  const { pluginJsonPath, settingsJsonPath } = opts;

  // Step 1: Read hooks from plugin.json (single source of truth)
  const hooksResult = readPluginHooks(pluginJsonPath);
  if (!hooksResult.ok) {
    return {
      ok: false,
      error: { kind: 'plugin_json_error', cause: hooksResult.error, message: `Failed to read plugin.json: ${hooksResult.error.message}` },
    };
  }
  const hooks = hooksResult.value;

  // Step 2: Ensure parent dir + settings.json exist for proper-lockfile
  await mkdir(dirname(settingsJsonPath), { recursive: true });
  ensureSettingsFile(settingsJsonPath);

  // Step 3: Acquire proper-lockfile on settings.json
  let release: (() => Promise<void>) | undefined;
  try {
    release = await acquireLock(settingsJsonPath);
    return await _doInstallAllHooks(settingsJsonPath, hooks);
  } finally {
    if (release) await release();
  }
}

/** Inner logic of installAllHooks (extracted to reduce complexity of outer fn). */
async function _doInstallAllHooks(
  settingsJsonPath: string,
  hooks: PluginJsonHookEntry[],
): Promise<Result<InstalledHooks, InstallError>> {
  // Read existing settings
  let settings: Record<string, unknown>;
  try {
    settings = await readSettings(settingsJsonPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const fsErr = err as NodeJS.ErrnoException;
    if (err instanceof Error && !fsErr.code && msg.includes('JSON')) {
      return { ok: false, error: { kind: 'settings_parse_failed', message: `Invalid settings.json: ${msg}` } };
    }
    return { ok: false, error: { kind: 'settings_read_failed', message: msg } };
  }

  // Ensure hooks object
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }
  const hooksRecord = settings.hooks as Record<string, unknown>;

  // Merge entries by event (idempotent by id)
  for (const entry of hooks) {
    if (!hooksRecord[entry.event]) hooksRecord[entry.event] = [];
    const arr = hooksRecord[entry.event] as unknown[];
    const existingIds = new Set(arr.map((h) => (h as Record<string, unknown>)?.id));
    if (!existingIds.has(entry.id)) arr.push(entry);
  }

  // Serialize + hash + atomic write
  const serialized = JSON.stringify(settings, null, 2);
  const settingsJsonHash = createHash('sha256').update(serialized).digest('hex');

  try {
    writeFileAtomic.sync(settingsJsonPath, serialized, 'utf-8');
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { kind: 'settings_write_failed', cause: makeAtomicWriteError(settingsJsonPath, cause), message: `Failed to write settings.json: ${cause}` },
    };
  }

  return { ok: true, value: { hooks, settingsJsonHash } };
}
