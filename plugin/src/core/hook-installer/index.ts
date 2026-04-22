// Hook Installer — Stage 04. FR-007–FR-011 installation.
// Reads existing settings.json, merges hook entries, writes atomically (temp + rename).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Result } from '../types/index.js';

export interface HookEntry {
  id: 'H1' | 'H2' | 'H3' | 'H4' | 'H5';
  event: string;
  handler: string;
  matcher?: Record<string, unknown>;
}

export type InstallError = { code: 'READ_FAIL' | 'WRITE_FAIL' | 'PARSE_FAIL'; detail: string };

/**
 * Install hooks into settings.json.
 * Reads existing settings (or starts with {}). Sets settings.hooks[entry.event] to array
 * of hook entries, merging new entries without duplication by id.
 * Validates JSON round-trip. Atomic write via temp file + fsync + rename.
 * Preserves all other settings keys untouched.
 */
export async function installHooks(
  settingsPath: string,
  entries: HookEntry[],
): Promise<Result<void, InstallError>> {
  try {
    // Ensure parent directory exists
    const parentDir = dirname(settingsPath);
    await mkdir(parentDir, { recursive: true });

    // Read existing settings
    let settings: Record<string, unknown> = {};
    try {
      const content = await readFile(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    } catch (err) {
      // If file doesn't exist or is not valid JSON, start with {}
      if (
        !(
          err instanceof Error &&
          ((err as NodeJS.ErrnoException).code === 'ENOENT' || err.message.includes('JSON'))
        )
      ) {
        // Unexpected error
        throw err;
      }
    }

    // Ensure hooks object exists
    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
      return {
        ok: false,
        error: { code: 'PARSE_FAIL', detail: 'settings.hooks is not a record' },
      };
    }

    const hooksRecord = settings.hooks as Record<string, unknown>;

    // Merge entries by event
    for (const entry of entries) {
      const event = entry.event;
      if (!hooksRecord[event]) {
        hooksRecord[event] = [];
      }
      const eventArray = hooksRecord[event];
      if (!Array.isArray(eventArray)) {
        return {
          ok: false,
          error: {
            code: 'PARSE_FAIL',
            detail: `settings.hooks[${event}] is not an array`,
          },
        };
      }

      // Avoid duplicate by id
      const existingIds = new Set(eventArray.map((h: unknown) => (h as Record<string, unknown>)?.id));
      if (!existingIds.has(entry.id)) {
        eventArray.push(entry);
      }
    }

    // Validate JSON round-trip
    const serialized = JSON.stringify(settings);
    JSON.parse(serialized); // Will throw if invalid

    // Atomic write: temp file + fsync + rename
    const tempPath = join(parentDir, `.settings-tmp-${randomBytes(8).toString('hex')}.json`);
    await writeFile(tempPath, serialized, 'utf-8');

    // Sync to disk
    const { open } = await import('node:fs/promises');
    const fd = await open(tempPath, 'r');
    await fd.sync();
    await fd.close();

    // Atomic rename
    const { rename } = await import('node:fs/promises');
    await rename(tempPath, settingsPath);

    return { ok: true, value: undefined };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (detail.includes('JSON')) {
      return { ok: false, error: { code: 'PARSE_FAIL', detail } };
    }
    return { ok: false, error: { code: 'WRITE_FAIL', detail } };
  }
}
