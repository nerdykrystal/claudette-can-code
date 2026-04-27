// Integration test: concurrent two-process writes to same audit.sqlite.
// Per §3.05 + Research Insight C: spawn 2 child Node processes both writing to same audit.sqlite;
// assert no row corruption + final row count == sum of writes (1000 each = 2000 rows).
// WAL mode allows concurrent readers/writer; SQLite serializes writers at OS level.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SQLiteAuditStore } from '../../../src/core/audit/sqlite-store.js';

// Absolute path to the plugin root (where node_modules lives)
// __dirname is undefined in ESM; derive from import.meta.url
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// Writes a worker .mjs script that appends N rows to a shared sqlite DB.
// Uses createRequire with explicit basePath so better-sqlite3 resolves from plugin node_modules.
async function writeWorkerScript(scriptPath: string, pluginRoot: string): Promise<void> {
  // Escape Windows backslashes for embedding in JS string literal
  const escapedPluginRoot = pluginRoot.replace(/\\/g, '\\\\');
  const script = `
import { createRequire } from 'node:module';
// Resolve better-sqlite3 from plugin node_modules (not temp dir)
const require = createRequire('${escapedPluginRoot}/package.json');
const Database = require('better-sqlite3');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

const [dbPath, workerIdStr, rowCountStr] = process.argv.slice(2);
const workerId = parseInt(workerIdStr, 10);
const rowCount = parseInt(rowCountStr, 10);

mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');
db.pragma('wal_autocheckpoint = 1000');
db.pragma('busy_timeout = 5000');

db.exec(\`
  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    ts_utc_year INTEGER NOT NULL,
    ts_utc_month INTEGER NOT NULL,
    ts_utc_day INTEGER NOT NULL,
    event_kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    hmac_sig TEXT,
    redaction_count INTEGER DEFAULT 0
  );
\`);

const insertStmt = db.prepare(\`
  INSERT INTO audit_events
    (ts, ts_utc_year, ts_utc_month, ts_utc_day, event_kind, payload_json, hmac_sig, redaction_count)
  VALUES
    (@ts, @ts_utc_year, @ts_utc_month, @ts_utc_day, @event_kind, @payload_json, @hmac_sig, @redaction_count)
\`);

const now = new Date();
for (let i = 0; i < rowCount; i++) {
  insertStmt.run({
    ts: now.toISOString(),
    ts_utc_year: now.getUTCFullYear(),
    ts_utc_month: now.getUTCMonth() + 1,
    ts_utc_day: now.getUTCDate(),
    event_kind: 'concurrent_test',
    payload_json: JSON.stringify({ workerId, rowIndex: i }),
    hmac_sig: null,
    redaction_count: 0,
  });
}

db.close();
console.log(JSON.stringify({ ok: true, workerId, rowsWritten: rowCount }));
`;
  await writeFile(scriptPath, script, 'utf8');
}

/**
 * Run a Node.js script as a child process.
 * Uses spawn() with an argument array (no shell expansion; injection-safe).
 * Returns { stdout, stderr, exitCode }.
 */
function runNodeScript(
  scriptPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('close', (code: number | null) => {
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

describe('Concurrent write integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'concurrent-write-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Per §3.05: spawn 2 child Node processes both writing to same audit.sqlite;
  // assert no row corruption + final row count == sum of writes (1000 + 1000 = 2000).
  it(
    'two concurrent processes write 1000 rows each; final count = 2000; no corruption',
    { timeout: 120_000 },
    async () => {
      const dbPath = join(tmpDir, 'audit.sqlite');
      const worker1Path = join(tmpDir, 'worker1.mjs');
      const worker2Path = join(tmpDir, 'worker2.mjs');

      await writeWorkerScript(worker1Path, PLUGIN_ROOT);
      await writeWorkerScript(worker2Path, PLUGIN_ROOT);

      // Spawn both workers concurrently
      const [result1, result2] = await Promise.all([
        runNodeScript(worker1Path, [dbPath, '1', '1000']),
        runNodeScript(worker2Path, [dbPath, '2', '1000']),
      ]);

      // Both workers should exit successfully
      expect(result1.exitCode).toBe(0);
      expect(result2.exitCode).toBe(0);

      const out1 = JSON.parse(result1.stdout.trim()) as { ok: boolean; workerId: number; rowsWritten: number };
      const out2 = JSON.parse(result2.stdout.trim()) as { ok: boolean; workerId: number; rowsWritten: number };

      expect(out1.ok).toBe(true);
      expect(out1.rowsWritten).toBe(1000);
      expect(out2.ok).toBe(true);
      expect(out2.rowsWritten).toBe(1000);

      // Open DB and verify total row count = 2000; no corruption
      const store = new SQLiteAuditStore({ dbPath });
      const events = [...store.queryEvents()];
      store.close();

      expect(events).toHaveLength(2000);

      // Verify no corruption: every row should have valid payload_json with expected fields
      let corruptedRows = 0;
      for (const event of events) {
        try {
          const parsed = JSON.parse(event.payload_json) as Record<string, unknown>;
          if (typeof parsed['workerId'] !== 'number' || typeof parsed['rowIndex'] !== 'number') {
            corruptedRows++;
          }
        } catch {
          corruptedRows++;
        }
      }
      expect(corruptedRows).toBe(0);

      // Verify both workers contributed rows
      const worker1Rows = events.filter((e) => {
        const p = JSON.parse(e.payload_json) as { workerId: number };
        return p.workerId === 1;
      });
      const worker2Rows = events.filter((e) => {
        const p = JSON.parse(e.payload_json) as { workerId: number };
        return p.workerId === 2;
      });

      expect(worker1Rows).toHaveLength(1000);
      expect(worker2Rows).toHaveLength(1000);
    },
  );
});
