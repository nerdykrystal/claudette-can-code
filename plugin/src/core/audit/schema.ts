// Audit Logger SQLite schema — Stage 05. FR-015, FR-016, SR-002.
// DDL constants + pragmas for WAL-mode sqlite audit store.

export const SCHEMA_DDL = `
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
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_events(ts);
CREATE INDEX IF NOT EXISTS idx_audit_kind ON audit_events(event_kind);
CREATE INDEX IF NOT EXISTS idx_audit_ymd ON audit_events(ts_utc_year, ts_utc_month, ts_utc_day);

CREATE TABLE IF NOT EXISTS migration_checkpoint (
  source_file TEXT PRIMARY KEY,
  byte_offset INTEGER NOT NULL,
  rows_imported INTEGER NOT NULL,
  completed_at TEXT
);
`;

export const PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = FULL',
  'PRAGMA wal_autocheckpoint = 1000',
  'PRAGMA busy_timeout = 5000',
];
