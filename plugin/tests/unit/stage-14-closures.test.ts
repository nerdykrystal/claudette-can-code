// Stage 14 closures — M-6, M-7, M-8, L-2, L-3 test coverage.
// Per §3.14 test cases 5-8.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

// ── M-6: settings.json conflict detection ────────────────────────────────────

describe('M-6: installAllHooks conflict detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cdcc-test-m6-${randomBytes(4).toString('hex')}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  // §3.14 test case 5: existing hook entry → installer warns (conflictingIds populated)
  it('§3.14 test case 5: reports conflictingIds when existing hook IDs found in settings.json', async () => {
    const { installAllHooks } = await import('../../src/core/hook-installer/index.js');

    const settingsPath = join(tmpDir, 'settings.json');
    const pluginJsonPath = join(tmpDir, 'plugin.json');

    // Write a plugin.json with one hook
    writeFileSync(pluginJsonPath, JSON.stringify({
      name: 'test',
      version: '1.1.0',
      hooks: {
        entries: [
          { id: 'H1', event: 'UserPromptSubmit', handler: 'dist/hooks/h1/index.js' },
        ],
      },
    }));

    // Pre-populate settings.json with H1 already installed
    writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ id: 'H1', event: 'UserPromptSubmit', handler: 'dist/hooks/h1/index.js' }],
      },
    }));

    const result = await installAllHooks({
      pluginJsonPath,
      settingsJsonPath: settingsPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // H1 was already present → should appear in conflictingIds
      expect(result.value.conflictingIds).toContain('H1');
    }
  });

  it('conflictingIds is empty when no pre-existing hooks', async () => {
    const { installAllHooks } = await import('../../src/core/hook-installer/index.js');

    const settingsPath = join(tmpDir, 'settings.json');
    const pluginJsonPath = join(tmpDir, 'plugin.json');

    writeFileSync(pluginJsonPath, JSON.stringify({
      name: 'test',
      version: '1.1.0',
      hooks: {
        entries: [
          { id: 'H1', event: 'UserPromptSubmit', handler: 'dist/hooks/h1/index.js' },
        ],
      },
    }));

    // Empty settings.json (no pre-existing hooks)
    writeFileSync(settingsPath, JSON.stringify({}));

    const result = await installAllHooks({
      pluginJsonPath,
      settingsJsonPath: settingsPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.conflictingIds).toHaveLength(0);
    }
  });

  it('forceOverwrite=true suppresses conflictingIds', async () => {
    const { installAllHooks } = await import('../../src/core/hook-installer/index.js');

    const settingsPath = join(tmpDir, 'settings.json');
    const pluginJsonPath = join(tmpDir, 'plugin.json');

    writeFileSync(pluginJsonPath, JSON.stringify({
      name: 'test',
      version: '1.1.0',
      hooks: {
        entries: [
          { id: 'H1', event: 'UserPromptSubmit', handler: 'dist/hooks/h1/index.js' },
        ],
      },
    }));

    // Pre-populate with H1 already there
    writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ id: 'H1', event: 'UserPromptSubmit', handler: 'dist/hooks/h1/index.js' }],
      },
    }));

    const result = await installAllHooks({
      pluginJsonPath,
      settingsJsonPath: settingsPath,
      forceOverwrite: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // forceOverwrite=true → conflictingIds not populated
      expect(result.value.conflictingIds).toHaveLength(0);
    }
  });
});

// ── M-7: redaction default-OFF ────────────────────────────────────────────────

describe('M-7: SQLiteAuditStore redaction default-OFF', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cdcc-test-m7-${randomBytes(4).toString('hex')}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  // §3.14 test case 6: SQLiteAuditStore constructor without redactionRules → redactionCount=0
  it('§3.14 test case 6: constructor without redactionRules → redactionCount=0 for all writes', async () => {
    const { SQLiteAuditStore } = await import('../../src/core/audit/sqlite-store.js');
    const dbPath = join(tmpDir, 'audit.sqlite');

    // Construct WITHOUT redactionRules (default-OFF)
    const store = new SQLiteAuditStore({ dbPath });

    // Payload contains a pattern that WOULD be caught by DEFAULT_RULES if redaction were on
    const result = store.appendEvent('test_event', {
      apiKey: 'sk-abcdefgh123456789012',  // matches DEFAULT_RULES api_key pattern
      message: 'hello',
    });

    expect(result.ok).toBe(true);

    // Verify redaction_count=0 in the stored row
    const events = [...store.queryEvents()];
    expect(events).toHaveLength(1);
    expect(events[0].redaction_count).toBe(0);

    // Verify original value is stored unredacted (redaction is OFF)
    const payload = JSON.parse(events[0].payload_json) as Record<string, unknown>;
    expect(typeof payload['apiKey']).toBe('string');
    expect((payload['apiKey'] as string).startsWith('sk-')).toBe(true);

    store.close();
  });

  it('redaction applies when redactionRules explicitly provided', async () => {
    const { SQLiteAuditStore } = await import('../../src/core/audit/sqlite-store.js');
    const { DEFAULT_RULES } = await import('../../src/core/audit/redaction.js');
    const dbPath = join(tmpDir, 'audit-redact.sqlite');

    // Construct WITH explicit DEFAULT_RULES (opt-in)
    const store = new SQLiteAuditStore({ dbPath, redactionRules: DEFAULT_RULES });

    const result = store.appendEvent('test_event', {
      apiKey: 'sk-abcdefgh123456789012',
      message: 'hello',
    });

    expect(result.ok).toBe(true);

    const events = [...store.queryEvents()];
    expect(events).toHaveLength(1);
    // Redaction was applied → redaction_count > 0
    expect(events[0].redaction_count).toBeGreaterThan(0);

    // Original value is redacted
    const payload = JSON.parse(events[0].payload_json) as Record<string, unknown>;
    expect(typeof payload['apiKey']).toBe('string');
    expect((payload['apiKey'] as string)).toContain('[REDACTED:');

    store.close();
  });
});

// ── M-8: version alignment ────────────────────────────────────────────────────

describe('M-8: version alignment (package.json === plugin.json)', () => {
  // §3.14 test case 7: package.json:version === plugin.json:version after Stage 14
  it('§3.14 test case 7: package.json:version === plugin.json:version', () => {
    // Navigate from tests/unit/ (2 levels below plugin root) to plugin root
    const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const pkgJson = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf-8')) as { version: string };
    const pluginJson = JSON.parse(readFileSync(join(pluginRoot, 'plugin.json'), 'utf-8')) as { version: string };

    expect(pkgJson.version).toBe(pluginJson.version);
    expect(pkgJson.version).toBe('1.1.0');
  });
});

// ── L-2/L-3: --help formatting ───────────────────────────────────────────────

describe('L-2/L-3: cdcc --help formatting', () => {
  // §3.14 test case 8: cdcc --help formatted output matches snapshot fixture
  it('§3.14 test case 8: --help output contains required sections', async () => {
    const { main } = await import('../../src/cli/index.js');

    const originalArgv = process.argv;
    const originalLog = console.log;
    const captured: string[] = [];
    console.log = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };

    let code = -1;
    try {
      process.argv = ['node', 'cdcc', '--help'];
      code = await main();
    } finally {
      console.log = originalLog;
      process.argv = originalArgv;
    }

    const output = captured.join('\n');

    expect(code).toBe(0);
    // L-2: must contain USAGE section header
    expect(output).toContain('USAGE');
    // L-2: must contain COMMANDS section
    expect(output).toContain('COMMANDS');
    // L-2: must contain EXIT CODES section
    expect(output).toContain('EXIT CODES');
    // L-3: must show generate --force option inline
    expect(output).toContain('--force');
    // L-3: must document --since validation
    expect(output).toContain('ISO 8601');
    // L-3: version number visible
    expect(output).toContain('v1.1.0');
  });
});
