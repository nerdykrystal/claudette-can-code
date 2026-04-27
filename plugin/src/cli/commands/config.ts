// cdcc config get|set|list|reset — Stage 12.
// Thin CLI wrapper around CdccConfigStore. Closes Q2-lock AVD-AC-22.

import { CdccConfigStore } from '../../core/config/store.js';

export interface ConfigOptions {
  configPath?: string;
  hmacKeyPath?: string;
}

function handleConfigGet(store: CdccConfigStore, args: string[]): number {
  const key = args[0];
  if (!key) {
    console.error('Usage: cdcc config get <key>');
    return 1;
  }
  const value = store.get(key);
  if (value === undefined) {
    console.error(`cdcc config get: key "${key}" not found`);
    return 3;
  }
  console.log(JSON.stringify({ key, value }));
  return 0;
}

function handleConfigSet(store: CdccConfigStore, args: string[]): number {
  const key = args[0];
  const rawValue = args[1];
  if (key === undefined || rawValue === undefined) {
    console.error('Usage: cdcc config set <key> <value>');
    return 1;
  }
  // Empty key is an invalid_key validation error (exit 2), not a usage error (exit 1)
  if (key.trim().length === 0) {
    console.error('cdcc config set: key must be a non-empty string');
    return 2;
  }
  // Try to parse value as JSON; fall back to string
  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    value = rawValue;
  }
  const result = store.set(key, value);
  if (!result.ok) {
    console.error(`cdcc config set: ${result.error.message}`);
    return result.error.kind === 'invalid_key' ? 2 : 5;
  }
  console.log(JSON.stringify({ ok: true, key, value }));
  return 0;
}

function handleConfigList(store: CdccConfigStore): number {
  const cfg = store.list();
  console.log(JSON.stringify(cfg, null, 2));
  return 0;
}

function handleConfigReset(store: CdccConfigStore): number {
  const result = store.reset();
  if (!result.ok) {
    console.error(`cdcc config reset: ${result.error.message}`);
    return 5;
  }
  console.log(JSON.stringify({ ok: true, message: 'Config reset to defaults' }));
  return 0;
}

/**
 * Handle `cdcc config <subcommand> [args...]`.
 * Subcommands: get <key>, set <key> <value>, list, reset.
 * Returns exit code: 0=ok, 1=usage, 2=validation, 3=state, 5=I/O.
 */
export async function handleConfig(
  subcommand: string | undefined,
  args: string[],
  opts: ConfigOptions = {},
): Promise<number> {
  if (!subcommand) {
    console.error('Usage: cdcc config <get|set|list|reset> [key] [value]');
    return 1;
  }

  const store = new CdccConfigStore({
    configPath: opts.configPath,
    hmacKeyPath: opts.hmacKeyPath,
  });

  switch (subcommand) {
    case 'get':   return handleConfigGet(store, args);
    case 'set':   return handleConfigSet(store, args);
    case 'list':  return handleConfigList(store);
    case 'reset': return handleConfigReset(store);
    default:
      console.error(`cdcc config: unknown subcommand "${subcommand}". Use get|set|list|reset.`);
      return 1;
  }
}
