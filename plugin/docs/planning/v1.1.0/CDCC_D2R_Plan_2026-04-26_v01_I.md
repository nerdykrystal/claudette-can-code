---
name: CDCC v1.1.0 — D2R Stage 01b Full Plan
description: Stage 01b full executable plan per /dare-to-rise-code-plan SKILL.md Stage 01b Authorship Protocol. 14 Deep + 2 Shallow stages with exact file operations, code specifications (pinned imports, function signatures, error types), test specifications (exact test cases + assertions), step operations, validation criteria, hook configurations (full .claude/settings.json + .githooks/pre-commit + pre-push + CI YAML), and README/LICENSE content decisions. This is the artifact Stage 02+ executors read and operate against.
type: d2r-stage-output
project: CDCC
stage: 01b
version: v01_I
date: 2026-04-26
status: I
methodology_version: 0.3.0
owner: Krystal Martinez (krystal@stahlsystems.com)
persona: Claudette the Code Debugger v01 (Opus 4.7, 1M context)
persona_role_manifest: _grand_repo/role-manifests/claudette-the-code-debugger.yaml
post_amendment_alignment: gate-49 (cdcc HEAD 1d38110, 2026-04-26)
session_chain:
  - kind: stage
    path: plugin/docs/planning/v1.1.0/CDCC_D2R_Stage01a_Skeleton_2026-04-26_v01_I.md
    relation: Stage 01a skeleton approved by user; this is Stage 01b full plan against the approved skeleton
  - kind: gate
    path: deprecated/asae-logs/gate-54-cdcc-v1.1.0-stage-01a-skeleton-2026-04-26.md
    relation: Stage 01a strict-3-PASS gate (rater CONFIRMED, agentId aa7e123fe270a3064)
  - kind: stage
    path: plugin/docs/planning/v1.1.0/CDCC_D2R_Stage00_Research_Summary_2026-04-26_v01_I.md
    relation: Stage 00 research basis (Insights A/B/C/D + 9 Q-locks + 16 findings)
stage_count: 16
plan_depth_distribution: 14_Deep + 2_Shallow
---

# CDCC v1.1.0 — D2R Stage 01b Full Plan

This is the executable D2R plan. Stage 02+ executors operate against this document. Every Deep stage carries: exact file paths, pinned imports, function signatures, error types, test specs, step operations, validation criteria. Every Medium stage (none in this build) would carry library + API pattern + error pattern + types + test requirements + exit criteria. Every Shallow stage (Stage 02 + Stage 15) carries goal + exit criteria + executor-decision acknowledgment.

Stage 01a master table approved at cdcc HEAD 9d0b5d8. Stage 01b expands each stage to declared depth.

---

## §0 Plan-Wide References

**Pinned library versions (additions to package.json at Stage 02):**
- `better-sqlite3@^11.5.0` (Stage 05)
- `proper-lockfile@^4.1.2` (Stages 05, 06, 07)
- `write-file-atomic@^7.0.1` (Stage 07)
- `node-addon-api@^8.3.0` (Stage 07 AC-21 native helper)

**Existing pinned (retain as-is):** `ajv@^8.17`, `fast-glob@^3.3`. **DevDeps retain:** `@stryker-mutator/core@^8`, `@stryker-mutator/vitest-runner@^8`, `@types/node@^20`, `@vitest/coverage-v8@^1.6`, `eslint@^9`, `fast-check@^3.19`, `typescript@^5.5`, `typescript-eslint@^8`, `vitest@^1.6`.

**Standard error type pattern (used across all Deep stages):** discriminated union `Result<T, E>` where `E` is a stage-specific tagged union extending base shape `{ kind: string; message: string; cause?: unknown }`. Exit code semantics per Stage 00 Finding 6: exit 0 = allow, exit 2 = block (stderr shown), exit 1 = non-blocking error (logged).

**Standard test framework conventions:** Vitest `describe`/`it`/`expect`. Per-module unit tests at `tests/unit/<module>/index.test.ts`. Integration tests at `tests/integration/<surface>/index.test.ts`. Property-based tests via `fast-check` at `tests/property/<surface>/index.test.ts`. E2E tests via `vitest.e2e.config.ts` at `tests/e2e/<scenario>/index.test.ts`.

**Stage exit gate per stage (per SKILL.md Stage NN sub-stages):** NN-A ASAE gate → NN-M meta-ASAE → NN-B commit gate → NN-C audit trail entry. ASAE-Gate trailer at every stage commit: `ASAE-Gate: strict-3-PASS` (or `D2R-Stage: NN-PASS` for code commits per repo `.asae-policy`).

---

## §1 Excellent End State (Verbatim From Stage 01a §1)

Reference: [CDCC_D2R_Stage01a_Skeleton_2026-04-26_v01_I.md §1]. Excellent end state defined by:
- All 29 gate-22 findings + N-1 (Insight B) verified-CLOSED at Stage QA regression
- A21 DRR shipped UNFLAGGED (H9 detection-only emits `recovery_events:` per /asae v06 schema; assistant orchestrates revert + redelegate)
- A18/H8 shipped UNFLAGGED (Protected Files Resolver fail-closed exit 2)
- `plugin.json` single source of truth for hooks (zero hardcoded IDs in `cli/`)
- All 8 hooks return exit 2 on fail-closed paths
- Audit logger = sqlite WAL + proper-lockfile + HMAC-redaction at emission
- Plan-state = HMAC-SHA256 protected (key at 0600; timing-safe compare; fail-closed on tamper)
- Atomic writes work on Windows via AC-21 native helper
- CLI subcommands complete: `cdcc explain`, `rollback`, `migrate-audit-log`, `config get|set|list|reset`

NFR exits per Stage 01a §1.2 table; all carry forward verbatim.

---

## §2 QA Specification (Expanded From Stage 01a §2)

### §2.1 Test Coverage Gates (Stage QA Exit Criteria)

| Gate | Threshold | Tooling | Exec Stage |
|---|---|---|---|
| Line coverage | 100% | vitest --coverage (v8) | per-stage NN-A + Stage QA |
| Branch coverage | 100% | vitest --coverage (v8) | per-stage NN-A + Stage QA |
| Function coverage | 100% | vitest --coverage (v8) | per-stage NN-A + Stage QA |
| Statement coverage | 100% | vitest --coverage (v8) | per-stage NN-A + Stage QA |
| Mutation score (critical files) | ≥80% | Stryker (vitest-runner) | Stage QA nightly |
| Concurrent two-process write | passes | custom test in tests/integration/audit/concurrent-write.test.ts | Stage 05 + Stage QA |
| Cross-platform atomic write | passes (Windows + POSIX) | tests/integration/atomic-write/cross-platform.test.ts | Stage 07 + Stage QA |
| recovery_events markup round-trip | parses through /asae v06 hook | tests/integration/recovery/asae-roundtrip.test.ts | Stage QA |
| Hook latency p95 | ≤50ms PreToolUse, ≤200ms PostToolUse | tests/perf/hook-latency.test.ts (1000-iter benchmark) | Stage QA |
| gate-22 regression | 29 findings + N-1 CLOSED | tests/regression/gate-22-ledger.test.ts | Stage QA |
| Property tests envelope math | 0 failed properties | fast-check at tests/property/envelope-math/ | Stage QA |

### §2.2 Critical-File Mutation Scope (Q5-locked)

Stryker config (stryker.conf.mjs) `mutate:` array:
```
src/core/audit/**/*.ts
src/core/plan-generator/**/*.ts
src/core/hook-installer/**/*.ts
src/core/recovery/**/*.ts
src/core/plan-state/**/*.ts
src/core/protected-files/**/*.ts
src/core/atomic-write/**/*.ts
src/core/config/**/*.ts
```

Excluded (mutation low-value): hooks/* (thin handlers; integration-tested), cli/* (orchestration), test-helpers, types-only modules.

---

## §3 Per-Stage Full Plan Content

### §3.02 Stage 02 — Project Scaffold + Bundle Deps Update (Sonnet, Shallow)

**Goal:** Add new deps to package.json, create new module skeleton dirs, amend AVD-AD-01 with proper-lockfile naming, refresh CI workflow if Stage 01a uncovered any drift.

**Exit criteria:**
1. `package.json` `dependencies` contains pinned `better-sqlite3@^11.5.0`, `proper-lockfile@^4.1.2`, `write-file-atomic@^7.0.1`, `node-addon-api@^8.3.0` (in addition to existing `ajv`, `fast-glob`)
2. New module dirs exist with `index.ts` stub exporting `export {}; // Stage NN authors content`:
   - `src/core/atomic-write/`
   - `src/core/config/`
   - `src/core/protected-files/`
   - `src/core/recovery/`
   - `src/core/plan-state/`
3. `npm install` completes without error
4. `npm run typecheck` passes (stubs export {})
5. `npm test` passes (no tests in new modules yet)
6. AVD-AD-01 updated to name `proper-lockfile` alongside `better-sqlite3 WAL` per Stage 00 honest-gap #2
7. Commit gate passes

**Shallow-depth justification:** Sonnet (per SKILL.md Stage 02 hard rule) with judgment for any setup error troubleshooting. No exact npm output to script.

**Sonnet executor decisions in scope:** specific dep version resolutions if `^` constraints conflict; CI workflow YAML format if existing workflow needs alignment with new module dirs.

**ASAE Threshold:** 3 (`/asae` `domain=document` for AVD amendment + `domain=code` for package.json/scaffold)

**Commit message structure:** `Stage 02 — scaffold deps + module dirs + AVD-AD-01 amendment // ASAE-Gate: strict-3-PASS // Co-Authored-By: ...`

---

### §3.03 Stage 03 — Bundle Parser (Haiku, Deep)

**Files to create:**
- `src/core/bundle-parser/index.ts` — main parser entry
- `src/core/bundle-parser/types.ts` — exported types
- `src/core/bundle-parser/errors.ts` — discriminated error union
- `tests/unit/bundle-parser/index.test.ts` — unit tests
- `tests/integration/bundle-parser/real-bundle.test.ts` — integration vs real CDCC v1.1.0 bundle

**Imports (pinned):**
```typescript
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';  // ^8.17
```

**Types (`src/core/bundle-parser/types.ts`):**
```typescript
export interface BundleAST {
  prd: ParsedDoc;
  trd: ParsedDoc;
  avd: ParsedDoc;
  tqcd: ParsedDoc;
  uxd: ParsedDoc;
  bidx: ParsedBidx;
  rootDir: string;
}
export interface ParsedDoc {
  path: string;
  frontmatter: Record<string, unknown>;
  sections: Section[];  // §-numbered
  ids: string[];  // PRD-FR-NN, TRD-FR-NN, etc. extracted via heading-prefix grammar
}
export interface Section { id: string; level: number; title: string; body: string; }
export interface ParsedBidx { rows: BidxRow[]; }
export interface BidxRow { closesFinding: string; via: string; doc: string; sectionId: string; }
```

**Errors (`src/core/bundle-parser/errors.ts`):**
```typescript
export type BundleParseError =
  | { kind: 'file_not_found'; path: string; message: string }
  | { kind: 'invalid_frontmatter'; path: string; line: number; message: string }
  | { kind: 'missing_section'; doc: string; expectedSection: string; message: string }
  | { kind: 'bidx_orphan_finding'; finding: string; message: string };
```

**Function signature:**
```typescript
export function parseBundle(rootDir: string): Result<BundleAST, BundleParseError>;
```

**Test cases (unit):**
1. `parseBundle('fixtures/empty')` → `{ ok: false, error.kind === 'file_not_found' }`
2. `parseBundle('fixtures/malformed-frontmatter')` → `{ ok: false, error.kind === 'invalid_frontmatter' }`
3. `parseBundle('fixtures/missing-section')` → `{ ok: false, error.kind === 'missing_section' }`
4. `parseBundle('fixtures/valid')` → `{ ok: true, value.prd.ids.includes('PRD-FR-01') }`
5. ID extraction across all 5 docs: assert each doc returns ≥5 IDs matching heading-prefix grammar regex
6. BIDX orphan detection: fixture with finding C-1 not in any doc → `bidx_orphan_finding`

**Test cases (integration):**
1. `parseBundle('plugin/docs/planning/v1.1.0/')` against real CDCC v1.1.0 bundle → ok=true; assert 29 findings appear in BIDX rows; assert all 5 docs return non-empty ids[]

**Closes:** gate-22 M-9 (parser ignores bundle content). Surprise #6 (gate module unwired).

**Step operations (executor):**
1. Author types.ts, errors.ts (no logic; types-only)
2. Author index.ts: read 5 doc files + BIDX file via `readFileSync`, parse YAML frontmatter (use `js-yaml` or hand-parse `---`-delimited blocks), parse markdown sections via heading regex `^(#{1,6})\s+(.+)$`, extract IDs via heading-prefix grammar regex
3. Author tests; run `npm test -- bundle-parser`
4. Run `npm run typecheck` — must pass
5. Run `npm run test:coverage -- bundle-parser` — must show 100% lines/branches/functions/statements
6. Surface integration-test fixture path to `plugin/docs/planning/v1.1.0/` (real bundle)

**Validation per step:**
- Step 1-2: `tsc` exits 0; `eslint src/core/bundle-parser` exits 0
- Step 3: vitest output shows N tests passed, 0 failed
- Step 4: typecheck exit 0
- Step 5: coverage report lines/branches/functions/statements all 100%
- Step 6: integration test passes against real bundle

**ASAE Threshold:** 3. Domain: `code` for src/, `document` for any AVD/TRD updates.

---

### §3.04 Stage 04 — Plan Generator + extractExcellenceSpec rewrite (Haiku, Deep)

**Files to modify:** `src/core/plan-generator/index.ts:22-47` (extractExcellenceSpec rewrite); `src/core/backwards-planning/index.ts` (full rewrite — same F13 pattern)
**Files to create:** `src/core/plan-generator/excellence-spec.ts`; `tests/unit/plan-generator/excellence-spec.test.ts`; `tests/unit/backwards-planning/index.test.ts`

**Imports:**
```typescript
import type { BundleAST } from '../bundle-parser/types.js';
import type { Result } from '../shared/result.js';
```

**New function signature (replaces hardcoded version):**
```typescript
export function extractExcellenceSpec(bundle: BundleAST): Result<ExcellenceSpec, ExcellenceSpecError>;
export interface ExcellenceSpec {
  qaCriteria: { id: string; description: string; sourceDoc: string; sourceId: string }[];  // derived from TQCD
  constraints: { id: string; description: string; sourceDoc: string }[];  // derived from PRD §6 + AVD constraints
  exitCriteria: { id: string; metric: string; threshold: string; sourceDoc: string }[];  // derived from TQCD §3 + §6
}
```

**Errors:**
```typescript
export type ExcellenceSpecError =
  | { kind: 'tqcd_missing_section_3'; message: string }
  | { kind: 'no_exit_criteria_found'; message: string };
```

**Backwards-planner replacement:**
```typescript
export function planStages(bundle: BundleAST, spec: ExcellenceSpec): Result<StagePlan[], PlanError>;
export interface StagePlan {
  stageId: string;
  inputs: string[];
  outputs: string[];
  exitCriteriaIds: string[];  // refs ExcellenceSpec.exitCriteria[].id
  closes: string[];  // gate-22 finding IDs this stage closes (from BIDX)
}
```

**Wire `src/core/gate/` (98 LOC currently unused):** call `gate.runGateEvaluation(plan, spec)` in plan-generator's exit path; assert plan covers all `spec.exitCriteria` IDs.

**Test cases:**
1. extractExcellenceSpec(realBundle) → ok=true; value.qaCriteria.length ≥ 5 (derived from TQCD §3 + §5); value.exitCriteria contains all TQCD §6 declared metrics
2. extractExcellenceSpec(bundle without TQCD §3) → ok=false; error.kind === 'tqcd_missing_section_3'
3. planStages → returns 16 StagePlan entries (matching Stage 01a master table); each stage's `closes[]` non-empty for stages that close findings
4. gate.runGateEvaluation rejects a plan missing exitCriteria coverage

**Closes:** gate-22 C-1 (extractExcellenceSpec ignores bundle), M-2, M-10, H-4 (assignedModel hardcode in plan-generator). Surprise #6 + #9.

**Step operations:** Read existing plan-generator/index.ts:22-47 + backwards-planning/index.ts; replace hardcoded values with bundle-derived; wire gate module; author tests; run typecheck + tests + coverage.

**ASAE Threshold:** 3.

---

### §3.05 Stage 05 — Audit Logger sqlite WAL + Migration (Haiku, Deep)

**Files to create:**
- `src/core/audit/sqlite-store.ts`
- `src/core/audit/schema.ts` (DDL constants + migrations)
- `src/core/audit/redaction.ts`
- `src/core/audit/migrate-jsonl.ts`
- `tests/unit/audit/sqlite-store.test.ts`
- `tests/unit/audit/redaction.test.ts`
- `tests/unit/audit/migrate-jsonl.test.ts`
- `tests/integration/audit/concurrent-write.test.ts`
- `tests/property/audit/redaction-properties.test.ts`

**Files to modify:**
- `src/core/audit/index.ts` (replace JSONL append-write with sqlite-store dispatch; preserve external API surface)
- `src/cli/index.ts` (add `cdcc migrate-audit-log` subcommand)

**Imports:**
```typescript
import Database from 'better-sqlite3';  // ^11.5.0
import lockfile from 'proper-lockfile';  // ^4.1.2
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHmac } from 'node:crypto';
```

**Schema DDL (`src/core/audit/schema.ts`):**
```typescript
export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,             -- ISO 8601 with Z suffix (UTC)
  ts_utc_year INTEGER NOT NULL, -- denormalized for fast filename lookup
  ts_utc_month INTEGER NOT NULL,
  ts_utc_day INTEGER NOT NULL,
  event_kind TEXT NOT NULL,     -- 'recovery_events' | 'redaction_events' | 'hook_event' | etc.
  payload_json TEXT NOT NULL,   -- JSON-serialized event body
  hmac_sig TEXT,                -- optional HMAC signature for tamper-evidence
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
  'PRAGMA synchronous = FULL',           // durability over speed for audit
  'PRAGMA wal_autocheckpoint = 1000',    // auto-checkpoint every 1000 pages
  'PRAGMA busy_timeout = 5000',
];
```

**SQLite store (`src/core/audit/sqlite-store.ts`):**
```typescript
export interface SQLiteStoreOptions { dbPath: string; hmacKey?: Buffer; }
export class SQLiteAuditStore {
  constructor(private opts: SQLiteStoreOptions) { /* initialize: open db, run pragmas + DDL */ }
  appendEvent(kind: string, payload: object): Result<{ id: number }, AuditWriteError>;
  queryEvents(filter: { since?: string; kind?: string; limit?: number }): IterableIterator<AuditEvent>;  // .iterate() under hood
  close(): void;
  checkpointWal(): void;  // manual `wal_checkpoint(RESTART)` invoke when WAL > 100MB
}
```

**Redaction (`src/core/audit/redaction.ts`):**
```typescript
export interface RedactionRule { regex: RegExp; reason: string; }
export const DEFAULT_RULES: RedactionRule[] = [
  { regex: /sk-[a-zA-Z0-9]{20,}/g, reason: 'api_key' },
  { regex: /\bAKIA[0-9A-Z]{16}\b/g, reason: 'aws_access_key' },
  // password / bearer token patterns
];
export function redactPayload(payload: object, rules: RedactionRule[]): { redacted: object; redactionCount: number; redactionEvents: { reason: string; originalHash: string }[] };
```

**Migration (`src/core/audit/migrate-jsonl.ts`):**
```typescript
export async function migrateJsonlToSqlite(opts: {
  jsonlPath: string;
  dbPath: string;
  batchSize?: number;  // default 1000
  resumeFrom?: number;
}): Promise<Result<MigrationStats, MigrationError>>;
export interface MigrationStats { rowsImported: number; bytesProcessed: number; durationMs: number; checksumMatch: boolean; }
```

**Errors:**
```typescript
export type AuditWriteError =
  | { kind: 'lockfile_busy'; message: string }
  | { kind: 'wal_checkpoint_failed'; message: string }
  | { kind: 'hmac_verify_failed'; message: string };
export type MigrationError =
  | { kind: 'source_not_found'; path: string; message: string }
  | { kind: 'parse_failure'; line: number; message: string }
  | { kind: 'checksum_mismatch'; expected: string; actual: string; message: string };
```

**Test cases (unit):**
1. SQLiteAuditStore.appendEvent({kind:'test',payload:{x:1}}) → returns {id: 1}; subsequent query returns the event
2. WAL pragma verified via PRAGMA journal_mode → 'wal'
3. Synchronous = FULL verified
4. Redaction rule matches sk-XXX pattern → returns redactionCount: 1, redactionEvents[0].reason: 'api_key'
5. Migration resume: pre-populate checkpoint, run migration → resumes from byte_offset

**Test cases (integration):**
1. `tests/integration/audit/concurrent-write.test.ts`: spawn two child Node processes both writing to same `audit.sqlite`; assert no row corruption + final row count == sum of writes (1000 each = 2000 rows)
2. proper-lockfile detection: process 1 holds lock; process 2 retries 5x with 100ms backoff; eventually succeeds

**Test cases (property):**
1. Property: redactPayload(any object) is idempotent (run twice → same output)
2. Property: redactPayload preserves all non-matching fields exactly

**Migration CLI subcommand (`cdcc migrate-audit-log`):**
- `cdcc migrate-audit-log [--source=<path>] [--target=<path>] [--resume]`
- Default source: `<claudeRoot>/cdcc-audit/*.jsonl` (glob; one DB per source dir)
- Default target: `<claudeRoot>/cdcc-audit/audit.sqlite`
- Streams JSONL line-by-line (no readFileSync), batches inserts in transactions of 1000
- Post-migration validation: row count match + checksum

**Step operations:**
1. Author schema.ts (DDL + pragmas constants)
2. Author sqlite-store.ts; init opens DB, runs pragmas, runs schema DDL
3. Author redaction.ts; export DEFAULT_RULES; redactPayload accepts custom rules
4. Author migrate-jsonl.ts; resume via checkpoint
5. Modify audit/index.ts: dispatch to SQLiteAuditStore (preserve old appendEvent signature; new HMAC + redaction wired in)
6. Modify cli/index.ts: add migrate-audit-log subcommand
7. Author tests (unit + integration + property)
8. Run npm test, npm run test:coverage, ensure 100%
9. Run integration concurrent-write test 10x to detect flake; must pass 10/10

**Validation per step:** typecheck pass; tests pass; concurrent-write test exits 0; coverage 100% on src/core/audit/.

**Closes:** gate-22 C-2, H-5, M-1, L-1, L-4, L-7. Insight C added.

**ASAE Threshold:** 3.

---

### §3.06 Stage 06 — Plan-State Store + HMAC (Haiku, Deep)

**Files to create:**
- `src/core/plan-state/store.ts`
- `src/core/plan-state/hmac.ts`
- `src/core/plan-state/types.ts`
- `tests/unit/plan-state/store.test.ts`
- `tests/unit/plan-state/hmac.test.ts`
- `tests/property/plan-state/hmac-properties.test.ts`

**Files to modify:**
- `src/hooks/h1-manifest-validation/index.ts:87` (read via PlanStateStore)
- `src/hooks/h4-model-assignment/index.ts:143` (read via PlanStateStore + HMAC verify)

**Imports:**
```typescript
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import lockfile from 'proper-lockfile';
import writeFileAtomic from 'write-file-atomic';  // ^7.0.1 (used Stage 07; here we use sync variant)
```

**Types (`src/core/plan-state/types.ts`):**
```typescript
export interface PlanState {
  currentStage: string;   // e.g., 'Stage 05'
  assignedModel: 'haiku' | 'sonnet' | 'opus';
  bundleHash: string;
  lastUpdated: string;    // ISO 8601 UTC
  // ... other plan-state fields per existing schema
}
export interface PlanStateOptions {
  jsonPath: string;       // e.g., ~/.claude/plugins/cdcc/plan-state.json
  hmacKeyPath: string;    // e.g., ~/.claude/plugins/cdcc/hmac.key (mode 0600)
}
```

**HMAC module (`src/core/plan-state/hmac.ts`):**
```typescript
export function generateAndStoreKey(keyPath: string): Buffer;  // randomBytes(32); chmod 0600
export function loadKey(keyPath: string): Result<Buffer, KeyError>;
export function computeHmac(payload: Buffer, key: Buffer): Buffer;  // sha256
export function verifyHmac(payload: Buffer, signature: Buffer, key: Buffer): boolean;  // timingSafeEqual
```

**Store module (`src/core/plan-state/store.ts`):**
```typescript
export class PlanStateStore {
  constructor(private opts: PlanStateOptions) { /* ensure key exists */ }
  read(): Result<PlanState, PlanStateError>;       // reads .json + .hmac sidecar; verifies; fails if mismatch
  write(state: PlanState): Result<void, PlanStateError>;  // atomic write + recompute HMAC
}
```

**Errors:**
```typescript
export type PlanStateError =
  | { kind: 'not_found'; path: string; message: string }
  | { kind: 'malformed_json'; message: string }
  | { kind: 'hmac_missing'; message: string }
  | { kind: 'hmac_mismatch'; message: string };
export type KeyError =
  | { kind: 'key_not_found'; path: string; message: string }
  | { kind: 'key_wrong_perms'; path: string; mode: number; message: string };
```

**Test cases (unit):**
1. generateAndStoreKey writes 32 bytes; chmod 0600 verified via `fs.statSync.mode & 0o777 === 0o600`
2. computeHmac + verifyHmac round-trip ok=true
3. Tampered payload → verifyHmac returns false
4. Tampered signature → verifyHmac returns false (timing-safe)
5. read missing file → not_found
6. read with hmac mismatch → hmac_mismatch (fail-closed)
7. write atomic: kill mid-write → file unchanged

**Test cases (property):**
1. Property: ∀ payloads p, verifyHmac(p, computeHmac(p, k), k) === true
2. Property: ∀ payloads p, p', if p !== p' then verifyHmac(p, computeHmac(p', k), k) === false (with high probability — collision resistance)

**Step operations:**
1. Author types.ts
2. Author hmac.ts (key generation, sign, verify)
3. Author store.ts (read+verify+write+sign with proper-lockfile)
4. Modify H1 + H4 to use PlanStateStore (preserve existing read behavior; add hmac verify on path)
5. Tests; coverage 100%

**Closes:** gate-22 H-6. Surprise #2 (read-only → now writable).

**ASAE Threshold:** 3.

---

### §3.07 Stage 07 — Hook Installer + plugin.json single SoT + AC-21 native helper (Haiku + Opus split, Deep)

**Files to create:**
- `src/core/hook-installer/index.ts` (rewrite)
- `src/core/hook-installer/plugin-json-reader.ts`
- `src/core/atomic-write/index.ts`
- `src/core/atomic-write/native-helper.cc` (C++ N-API addon source) — **Opus authors**
- `src/core/atomic-write/native-helper.d.ts`
- `binding.gyp` (node-gyp build config) — **Opus authors**
- `tests/unit/hook-installer/index.test.ts`
- `tests/integration/atomic-write/cross-platform.test.ts`

**Files to modify:**
- `src/cli/index.ts:53-59` — **DELETE** the hardcoded H1-H5 install array
- `plugin.json` (no schema change; runtime read of existing `hooks` array)

**Imports (TS side):**
```typescript
import writeFileAtomic from 'write-file-atomic';  // ^7.0.1
import { tryNativeAtomicWrite } from './native-helper.js';  // optional require with graceful fallback
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
```

**plugin-json-reader signature:**
```typescript
export interface PluginJsonHookEntry { id: string; event: string; handler: string; matcher?: string; }
export function readPluginHooks(pluginJsonPath: string): Result<PluginJsonHookEntry[], PluginJsonError>;
```

**Hook installer signature:**
```typescript
export function installAllHooks(opts: { pluginJsonPath: string; settingsJsonPath: string }): Result<InstalledHooks, InstallError>;
export interface InstalledHooks { hooks: PluginJsonHookEntry[]; settingsJsonHash: string; }
```

**Atomic write (TS wrapper with native fallback):**
```typescript
export async function atomicWrite(path: string, content: string | Buffer): Promise<Result<void, AtomicWriteError>>;
// Strategy:
// 1. Try tryNativeAtomicWrite (Windows-strong; CreateFile + FlushFileBuffers + CloseHandle)
// 2. If native unavailable or fails: fallback to write-file-atomic (POSIX-strong; gracefully handles Windows)
// 3. Both record per-call telemetry to audit log
```

**Native helper (C++ N-API) — Opus authorship scope:**
- Approx 50-100 LOC C++
- Exports `nativeAtomicWriteSync(path: string, content: Buffer)` returning `{ ok: boolean; errorMsg?: string }`
- Windows: CreateFile (CREATE_NEW + temp suffix) + WriteFile + FlushFileBuffers + CloseHandle + ReplaceFile (atomic)
- POSIX: fallback to standard write-tmp + fsync(fd) + fsync(parent_dir) + rename

**binding.gyp:**
```python
{
  "targets": [{
    "target_name": "atomic_write",
    "sources": ["src/core/atomic-write/native-helper.cc"],
    "include_dirs": ["<!(node -p \"require('node-addon-api').include\")"],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
    "conditions": [
      ["OS=='win'", { "defines": ["WIN32"] }],
      ["OS!='win'", { "cflags": ["-O2"] }]
    ]
  }]
}
```

**Errors:**
```typescript
export type PluginJsonError =
  | { kind: 'file_not_found'; path: string; message: string }
  | { kind: 'invalid_json'; message: string }
  | { kind: 'no_hooks_array'; message: string };
export type InstallError =
  | { kind: 'plugin_json_error'; cause: PluginJsonError; message: string }
  | { kind: 'settings_write_failed'; cause: AtomicWriteError; message: string };
export type AtomicWriteError =
  | { kind: 'native_unavailable'; message: string }
  | { kind: 'rename_failed'; from: string; to: string; cause: string; message: string }
  | { kind: 'fsync_failed'; path: string; cause: string; message: string };
```

**Test cases (unit):**
1. readPluginHooks valid file → hooks[].length === 8 (after Stage 02 plugin.json updated to include H8 + H9)
2. readPluginHooks missing hooks array → no_hooks_array
3. installAllHooks valid → settings.json contains all 8 hook entries; hash returned
4. cli/index.ts after change: no string literal "H1" through "H6" (regex grep test)

**Test cases (integration cross-platform):**
1. atomicWrite to fresh path → file exists with content
2. atomicWrite over existing file → original content replaced atomically (concurrent reader sees old or new, never partial)
3. (Windows) Kill process mid-write → file unchanged from pre-write state
4. Native helper present → log shows native path used; absent → falls back gracefully

**Step operations:**
1. **(Haiku)** Author plugin-json-reader.ts + hook-installer/index.ts
2. **(Haiku)** Delete `cli/index.ts:53-59` hardcoded array; replace with `installAllHooks()` call
3. **(Opus)** Author native-helper.cc + binding.gyp (~50-100 LOC C++)
4. **(Haiku)** Author atomic-write/index.ts wrapper with native fallback
5. **(Haiku)** Author tests; run `npm install` to trigger node-gyp build; run tests
6. **(Both)** Cross-platform test on Windows + POSIX (CI matrix)

**Closes:** gate-22 H-1, H-3, M-3, M-11. Q1-lock. Insight B (CLI install list deletion).

**ASAE Threshold:** 3.

---

### §3.08a Stage 08a — H4 Fail-Closed (Haiku, Deep)

**Files to modify:**
- `src/hooks/h4-model-assignment/index.ts:124-137` (5 fail paths each → exit 2)
- `tests/unit/hooks/h4-model-assignment/exit-paths.test.ts` (new)

**Five fail paths (each exit 2 with structured stderr per PRD-AR-NV-01 + PRD-AR-04):**

```typescript
// Path 1: stage-not-found
process.stderr.write(JSON.stringify({
  rule: 'h4_stage_not_found',
  resolution: 'Run `cdcc generate <bundle>` to populate plan-state.json with current stage',
  detected_stage: input.stage,
  available_stages: planState.stages.map(s => s.id),
}) + '\n');
process.exit(2);

// Path 2: plan-state missing
// (similar structure; stderr names file path; resolution: run cdcc generate)

// Path 3: plan-state malformed
// stderr: JSON parse error line + resolution: rerun cdcc generate

// Path 4: HMAC fail
// stderr: hmac_mismatch + resolution: regenerate via cdcc rebuild-plan-state

// Path 5: model mismatch
// stderr: required-model + actual-model + resolution: re-route via correct sub-agent
```

**Test cases:** one per path; each verifies `process.exit(2)` invoked + stderr matches schema.

**Closes:** gate-22 C-3 (H4 fail-open on stage-not-found), H-4 (assignedModel hardcode path; fully closed in conjunction with §3.04). Q3-lock.

**ASAE Threshold:** 3.

---

### §3.08b Stage 08b — Other-hook exit-code audit + fix (Haiku, Deep)

**Files to modify:**
- `src/hooks/h1-manifest-validation/index.ts` (exit 1 → exit 2 on fail; H-2 Array.isArray + null literal guard)
- `src/hooks/h2-deviation-manifest/index.ts` (same)
- `src/hooks/h3-sandbox-hygiene/index.ts` (same)
- `src/hooks/h5-convergence-gate/index.ts` (same)
- `src/hooks/h6-step-reexec/index.ts` (same)
- `tests/unit/hooks/<each-hook>/exit-paths.test.ts` (new for each)

**For each hook:** Identify fail-closed-intent paths returning `process.exit(1)`; convert to `process.exit(2)`; emit structured stderr per Finding 6 idiom (`{ rule, resolution, detected_value, expected_value }`).

**H-2 PARTIAL → CLOSED:** `h2-deviation-manifest/index.ts` add `Array.isArray(value) && value !== null` check (currently has Array.isArray but null literal bypass exists per gate-22).

**Test cases per hook:** unit tests with mocks asserting exit code === 2 on each failure; integration test simulating fail-closed scenario.

**Closes:** Stage 00 sub-agent 3 systemic; gate-22 H-2 PARTIAL→CLOSED.

**ASAE Threshold:** 3.

---

### §3.09 Stage 09 — Protected Files Resolver + H8 (Haiku, Deep)

**Files to create:**
- `src/core/protected-files/resolver.ts`
- `src/core/protected-files/yaml-schema.ts`
- `src/core/protected-files/protected_files.yaml.example`
- `src/hooks/h8-protected-files/index.ts`
- `tests/unit/protected-files/resolver.test.ts`
- `tests/integration/h8-protected-files/end-to-end.test.ts`

**Imports:**
```typescript
import fg from 'fast-glob';  // ^3.3
import { parse as parseYaml } from 'yaml';  // already in deps via Ajv stack? Check; if not, add
```

**Schema (`protected_files.yaml`):**
```yaml
version: 1
rules:
  - id: rule-1
    glob: "**/.env*"
    allowed_personas: []  # blocked for everyone
    deny_message: "Environment files contain secrets — never edited via assistant"
  - id: rule-2
    glob: "**/role-manifests/**"
    allowed_personas: ["claude-the-pek-remediator"]
    deny_message: "Role-manifest edits limited to claude-the-pek-remediator persona"
```

**Resolver signature:**
```typescript
export interface ProtectedFilesResolver {
  precompile(yamlPath: string): Result<void, ResolverError>;  // SessionStart
  match(targetPath: string, currentPersona: string): MatchResult;  // PreToolUse hot path
}
export type MatchResult =
  | { allowed: true }
  | { allowed: false; ruleId: string; denyMessage: string; allowedPersonas: string[] };
```

**H8 hook:**
```typescript
// PreToolUse on Write|Edit|Bash matching destructive ops
const result = resolver.match(targetPath, currentPersona);
if (!result.allowed) {
  process.stderr.write(JSON.stringify({
    rule: result.ruleId,
    path: targetPath,
    persona: currentPersona,
    resolution: `Re-delegate to one of: ${result.allowedPersonas.join(', ')}`,
    deny_message: result.denyMessage,
  }) + '\n');
  process.exit(2);
}
```

**Test cases (unit):**
1. precompile parses valid yaml → ok
2. match `/path/.env` with persona X → allowed:false; ruleId:'rule-1'
3. match `/path/role-manifests/x.yaml` with 'claude-the-pek-remediator' → allowed:true
4. match `/path/role-manifests/x.yaml` with other → allowed:false; allowedPersonas: ['claude-the-pek-remediator']
5. Windows case-insensitive: match `/PATH/.ENV` works

**Test cases (integration):**
1. End-to-end: load real `protected_files.yaml`; invoke H8 with mock PreToolUse payload; verify exit 2 on protected path

**Step operations:**
1. Author resolver.ts (precompile globs at SessionStart, cache in module scope)
2. Author yaml-schema.ts (Ajv validator for protected_files.yaml)
3. Author H8 hook
4. Tests + coverage 100%

**Closes:** A18 + roadmap P3 H8 (canonical per /asae v06; not in gate-22 ledger). Q6-lock UNFLAGGED.

**ASAE Threshold:** 3.

---

### §3.10 Stage 10 — Recovery Verifier + H9 (detection-only) (Haiku, Deep)

**Files to create:**
- `src/core/recovery/verifier.ts`
- `src/core/recovery/recovery-events-schema.ts` (verbatim /asae v06 lines 297-326 schema)
- `src/hooks/h9-recovery-verifier/index.ts`
- `tests/unit/recovery/verifier.test.ts`
- `tests/integration/recovery/asae-roundtrip.test.ts`

**Imports:**
```typescript
import { execSync } from 'node:child_process';
import { SQLiteAuditStore } from '../audit/sqlite-store.js';
```

**recovery_events: schema (verbatim from /asae SKILL.md v06 lines 297-326):**
```typescript
export interface RecoveryEvent {
  stage_id: string;
  violation_type: 'scope_violation' | 'false_attestation' | 'coverage_drop' | 'protected_file_mutation' | 'role_boundary' | 'fabrication';
  detected_by: string;          // 'h9_recovery_verifier' | 'rater_subagent_<id>' | etc.
  revert_target: string;        // 7-40 char hex hash OR literal 'working_tree_state'
  redelegation_spec_diff: string;
  recovery_pass: boolean;
}
```

**Verifier signature:**
```typescript
export function runVerification(stageId: string, opts: { typecheck?: boolean; lint?: boolean; coverage?: boolean; scopeBoundsCheck?: boolean }): VerificationResult;
export interface VerificationResult { passed: boolean; violations: Violation[]; }
export interface Violation { type: RecoveryEvent['violation_type']; description: string; suggestedRevertTarget: string; }
```

**H9 hook (detection-only; per Q4-revised + Insight A-revised + CCC empirical pattern):**
```typescript
// PostToolUse on Stop event:
const result = runVerification(currentStage, { typecheck: true, lint: true, coverage: true, scopeBoundsCheck: true });
if (!result.passed) {
  for (const v of result.violations) {
    auditStore.appendEvent('recovery_events', {
      stage_id: currentStage,
      violation_type: v.type,
      detected_by: 'h9_recovery_verifier',
      revert_target: v.suggestedRevertTarget,  // hex hash OR 'working_tree_state'
      redelegation_spec_diff: v.description,
      recovery_pass: false,
    } satisfies RecoveryEvent);
  }
  process.stderr.write(JSON.stringify({
    rule: 'h9_violations_detected',
    violations: result.violations,
    resolution: 'Parent assistant turn must run `git revert --no-edit <sha>` (hex case) OR `git restore` / `git checkout -- .` (working_tree_state case), then re-delegate via Agent tool. Per Q7-lock: one-shot only; second violation surfaces recovery_pass:false to user.',
  }) + '\n');
  process.exit(2);
}
// H9 does NOT do git revert. H9 does NOT spawn Agent. Parent orchestrates.
```

**Test cases (unit):**
1. runVerification with typecheck=true and clean tree → passed:true
2. runVerification with introduced typecheck error → passed:false; violations[0].type='coverage_drop' or appropriate
3. RecoveryEvent schema TypeScript compile-time check matches /asae v06 lines 297-326 verbatim

**Test cases (integration):**
1. asae-roundtrip: emit RecoveryEvent JSON; pipe through `/asae` commit-msg hook v06 Tier 14 validator; expect parse success + all required fields recognized
2. revert_target hex case + working_tree_state literal case both validated by Tier 14

**Step operations:**
1. Author recovery_events_schema.ts (TypeScript types matching /asae v06 verbatim)
2. Author verifier.ts (typecheck via tsc --noEmit; lint via eslint; coverage via vitest --coverage; scope via role-manifest YAML check)
3. Author H9 hook (detection + audit emission + exit 2; NO git revert; NO Agent spawn)
4. Stage-07 install list addition (H9 entry in plugin.json hooks array)
5. Tests including asae-roundtrip integration

**Closes:** A21 canonical (gate-54 / /asae v06). UNFLAGGED per gate-49. Q4-revised + Insight A-revised + Q7-lock + Q-emergent-1-lock + Q-emergent-2-lock.

**DO NOT extend SAR. DO NOT reintroduce `cdcc.experimental.drr`.**

**ASAE Threshold:** 3.

---

### §3.11 Stage 11 — H6 merged + CLI install list (Haiku, Deep)

**Files to modify:**
- `src/hooks/h6-step-reexec/index.ts` (merge any cost-telemetry from CC v1.1.0 if applicable; otherwise no behavior change)
- (No file modification needed if Stage 07's runtime read is correct — Stage 11 is a verification stage)

**Tests:**
- `tests/integration/hook-installer/h6-registration.test.ts` — verify after `installAllHooks()`, settings.json contains H6 entry from plugin.json

**Step operations:**
1. Verify Stage 07's installer correctly registers H6 (already in plugin.json:30; CLI hardcoded array now deleted)
2. If H6 cost-telemetry merge required (per PRD non-goal revision admitting cost-telemetry): add merge logic
3. Tests pass

**Closes:** N-1 (Insight B specific closure on top of Stage 07's systemic).

**ASAE Threshold:** 3.

---

### §3.12 Stage 12 — CLI subcommands (Haiku, Deep)

**Files to create:**
- `src/cli/commands/explain.ts` (`cdcc explain <event_id>`)
- `src/cli/commands/rollback.ts` (`cdcc rollback <event_id>`)
- `src/cli/commands/migrate.ts` (`cdcc migrate-audit-log`)
- `src/cli/commands/config.ts` (`cdcc config get|set|list|reset`)
- `src/core/config/store.ts` (Plugin Config Store; AVD-AC-22)
- `tests/unit/cli/commands/<each>.test.ts`

**Files to modify:**
- `src/cli/index.ts` — add subcommand routing; standardize exit code cascade
- Existing `cdcc generate` — add overwrite-confirm prompt (L-5)

**Plugin Config Store (`~/.claude/plugins/cdcc/config.json`):**
```typescript
export interface CdccConfig {
  experimental: Record<string, boolean>;  // e.g., { 'feature_x': false } — drr is NOT here per Q2-lock
  defaults: { auditDbPath: string; planStatePath: string; hmacKeyPath: string; };
}
export class CdccConfigStore {
  get(key: string): unknown;
  set(key: string, value: unknown): Result<void, ConfigError>;
  list(): CdccConfig;
  reset(): Result<void, ConfigError>;  // restore defaults
}
```

**Standardized CLI exit codes (Surprise #10):**
- 0: success
- 1: usage error (bad args)
- 2: validation failure (input doesn't satisfy contract; structured stderr)
- 3: state error (plan-state missing/corrupt)
- 4: dependency error (HMAC fail; sqlite locked >5s)
- 5: I/O error (write fails; disk full)
- 6: external command failure (git revert fails; etc.)

**Test cases:** per-subcommand unit + integration with audit DB fixtures.

**Closes:** gate-22 L-5, L-6. Surprise #10. Q2-lock (AC-22 Plugin Config Store; FUTURE flags only — `drr` not applicable).

**ASAE Threshold:** 3.

---

### §3.13 Stage 13 — Timezone fixes (Haiku, Deep)

**Files to modify:**
- `src/core/audit/index.ts:78` (filename derivation: replace `.toISOString().split('T')[0]` with `getUTCFullYear/Month/Date`)
- `src/core/audit/index.ts:131` (lex compare → numeric ms compare via `new Date().getTime()`)
- `eslint.config.js` (custom rule: forbid string-compare on date-typed fields)

**Files to create:**
- `src/core/audit/utc-helpers.ts`
- `eslint-rules/no-date-string-compare.js`
- `tests/unit/audit/utc-helpers.test.ts`

**Function signatures:**
```typescript
export function utcDateStringFromTs(ts: string): string;  // 'YYYY-MM-DD' from getUTC* methods
export function compareTimestamps(a: string, b: string): -1 | 0 | 1;  // numeric ms compare
```

**Test cases:**
1. `utcDateStringFromTs('2026-04-26T23:00:00+05:00')` → `'2026-04-26'` (UTC date is 04-26 18:00:00Z)
2. `utcDateStringFromTs('2026-04-26T23:00:00-05:00')` → `'2026-04-27'` (UTC date is 04-27 04:00:00Z)
3. `compareTimestamps` correct on tz-shifted inputs (uses parsed Date numeric ms)
4. ESLint custom rule flags `tsString1 < tsString2` — error

**Closes:** gate-22 H-7, H-8.

**ASAE Threshold:** 3.

---

### §3.14 Stage 14 — M/L bundled fixes (Haiku, Deep)

**Findings closed (each requires touch + test):**
- M-4: input validation on `cdcc audit --since` (must parse as ISO 8601 + UTC)
- M-5: extract CLI helpers (commonly duplicated arg-parsing logic)
- M-6: settings.json conflict detection (warn if existing hooks at install time)
- M-7: audit log redaction default-off (Stage 05's redaction module shipped enabled by default; M-7 inverts to default-off + opt-in)
- M-8: version skew docs (`package.json:version` 1.0.4 → 1.1.0; `plugin.json:version` 0.1.0 → 1.1.0; clarifying doc explaining intentional plugin-version-mirrors-package-version going forward)
- L-2: improve `cdcc --help` formatting
- L-3: minor CLI output ergonomics (color codes, alignment)

**Files modified per finding:** see gate-22 ledger row references for v1.0.4 line numbers per finding.

**Imports for input validation (M-4):**
```typescript
// in src/cli/commands/audit.ts
import { parseISO, isValid } from 'date-fns';  // ^3 (add to deps; light dep, ~10 KB)
```

**Function signature for `--since` validation (M-4):**
```typescript
export function parseSinceArg(input: string): Result<Date, AuditArgError>;
export type AuditArgError = { kind: 'invalid_iso8601'; message: string } | { kind: 'future_timestamp'; message: string };
```

**Test cases (representative; one per M/L finding):**
1. parseSinceArg('2026-04-26T00:00:00Z') → ok=true; valid Date
2. parseSinceArg('not-a-date') → ok=false; invalid_iso8601
3. parseSinceArg('2099-01-01T00:00:00Z') → ok=false; future_timestamp (M-4 paranoia)
4. M-5 CLI helper extraction: assert duplicate arg-parse code in cli/commands/* deduplicated to `src/cli/helpers/args.ts`
5. M-6 settings.json conflict: existing hook entry → installer warns + offers `--force` flag
6. M-7 redaction default-off: SQLiteAuditStore constructor without `redactionRules` opt → `redactionCount: 0` for all writes
7. M-8 version alignment: `package.json:version` === `plugin.json:version` after Stage 14
8. L-2/L-3: `cdcc --help` formatted output matches snapshot fixture

**Step operations:** Open each gate-22 ledger row for M-4/5/6/7/8 + L-2/L-3; modify identified file at named line; add test per finding; run typecheck + tests + coverage 100% on touched modules.

**Closes:** gate-22 M-1, M-4, M-5, M-6, M-7, M-8 (PARTIAL→CLOSED), L-2, L-3.

**ASAE Threshold:** 3.

---

### §3.15 Stage 15 — Design Polish (Sonnet, Shallow)

**Goal:** Apply UXD voice to all CLI text output, error messages, `cdcc explain` rendering. No new functionality.

**Exit criteria:**
1. UXD voice review of all stderr templates from H1-H6 + H8 + H9
2. UXD voice review of all CLI subcommand output
3. UXD voice review of `cdcc explain` formatted output
4. `/asae` `domain=design` 3 consecutive null cycles strict-3
5. Existing tests still pass (text-only changes; no behavior change)

**Sonnet executor decisions in scope:** specific phrasing per UXD §1.3 voice criteria; consistency across all surfaces.

**ASAE Threshold:** 3 (`/asae` `domain=design`).

---

### §3.QA Stage QA — Convergence Loop (Opus, Deep)

**Files created:** `deprecated/asae-logs/gate-NN-cdcc-v1.1.0-qa-convergence-2026-MM-DD.md` (gate file with strict-5-PASS)

**Files possibly modified:** any remediation needed during convergence loop.

**Convergence cycle (per /asae SKILL.md Stage QA):**

Each cycle:
1. **Phase 1 — Applicable Test Sweep:** run vitest with coverage; assert all thresholds met (TQCD §6.x)
2. **Phase 2 — Applicable Stress Sweep:** Stryker mutation on critical files; concurrent-write test 10x; cross-platform atomic-write test on Windows + POSIX; recovery_events round-trip; gate-22 regression test (29 + N-1 findings)
3. **Phase 3 — Remediation:** fix any issues; re-run

**Exit:** 5 consecutive cycles with zero new issues.

**Final commit:**
```
Stage QA — D2R convergence final summary

29 gate-22 findings + N-1 verified-CLOSED.
A21 canonical; H9 unflagged. /asae v06 round-trip validated.
Stryker mutation 80%+ on Q5-locked files.
Concurrent two-process write passes 10/10.
Cross-platform atomic write passes Windows + POSIX.
Hook latency p95 ≤50ms PreToolUse, ≤200ms PostToolUse.
100% line/branch/function/statement coverage.

ASAE-Gate: strict-5-PASS
Co-Authored-By: Claudette the Code Debugger v01 (Opus 4.7, 1M context) <noreply@anthropic.com>
```

**ASAE Threshold:** 5 (convergence — SKILL.md hard rule).

---

## §4 Hook Configurations (Full)

### §4.1 `.claude/settings.json` (PreToolUse / PostToolUse / Stop / UserPromptSubmit)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": { "tool": ["Write", "Edit"] },
        "command": ".claude/hooks/h3-sandbox-hygiene.sh",
        "blocking": true,
        "timeout": 50
      },
      {
        "matcher": { "tool": ["Write", "Edit"] },
        "command": ".claude/hooks/h4-model-assignment.sh",
        "blocking": true,
        "timeout": 50
      },
      {
        "matcher": { "tool": ["Write", "Edit", "Bash"], "bashPattern": "^(rm|mv|cp|sed -i|chmod|git commit|git push|git revert|git reset).*" },
        "command": ".claude/hooks/h6-step-reexec.sh",
        "blocking": true,
        "timeout": 50
      },
      {
        "matcher": { "tool": ["Write", "Edit"] },
        "command": ".claude/hooks/h8-protected-files.sh",
        "blocking": true,
        "timeout": 50
      }
    ],
    "PostToolUse": [
      {
        "matcher": { "any": true },
        "command": ".claude/hooks/h2-deviation-manifest.sh",
        "blocking": false,
        "timeout": 200
      }
    ],
    "Stop": [
      {
        "command": ".claude/hooks/h5-convergence-gate.sh",
        "blocking": true,
        "timeout": 200
      },
      {
        "command": ".claude/hooks/h9-recovery-verifier.sh",
        "blocking": true,
        "timeout": 200
      }
    ],
    "UserPromptSubmit": [
      {
        "command": ".claude/hooks/h1-manifest-validation.sh",
        "blocking": true,
        "timeout": 50
      }
    ]
  }
}
```

### §4.2 `.githooks/pre-commit`

```bash
#!/usr/bin/env bash
set -euo pipefail
# Format
npx prettier --check . || { echo "prettier failed"; exit 1; }
# Lint
npm run lint || { echo "eslint failed"; exit 1; }
# Type check
npm run typecheck || { echo "typecheck failed"; exit 1; }
# Tests with coverage
npm run test:coverage || { echo "tests/coverage failed"; exit 1; }
# Secret scan
if command -v trufflehog >/dev/null 2>&1; then
  trufflehog filesystem --exclude_paths .trufflehogignore . || { echo "secret scan failed"; exit 1; }
fi
# ASAE log validator
if [ -f .githooks/validate-asae-log.sh ]; then
  .githooks/validate-asae-log.sh || { echo "ASAE log invalid"; exit 1; }
fi
echo "pre-commit passed"
```

### §4.3 `.githooks/pre-push`

```bash
#!/usr/bin/env bash
set -euo pipefail
# Full regression
npm run test:all || { echo "regression failed"; exit 1; }
# Build
npm run build || { echo "build failed"; exit 1; }
# Cross-platform if applicable (CI matrix handles this in practice)
echo "pre-push passed"
```

### §4.4 CI workflow (`.github/workflows/ci.yml`)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }}, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:coverage
      - run: npm run test:e2e
      - name: Verify hook installation
        run: bash .githooks/verify-hooks-installed.sh
  mutation:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'  # nightly only
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run test:mutation
      - run: |
          if [ $(jq '.summary.mutationScore' reports/mutation/mutation-report.json) -lt 80 ]; then
            echo "Mutation score below 80%"; exit 1
          fi
```

---

## §5 README + LICENSE Content Decisions (Sonnet drafts in Stage 02 from these)

### §5.1 README.md content decisions

- **Title:** "CDCC — Claudette Driven Code Confidence"
- **Tagline:** "Methodology governance plugin for Claude Code: hook-orchestrated ASAE gates, plan-state HMAC, A21 DRR recovery audit."
- **One-paragraph overview:** explains CDCC enforces /dare-to-rise-code-plan governance via Claude Code hooks (H1-H6, H8, H9); audit logger is sqlite WAL with HMAC-protected plan-state; A21 DRR recovery (detect-revert-redelegate) emits canonical recovery_events: per /asae v06.
- **Key features (highlight):** plugin.json single source of truth; 8 hooks H1-H6+H8+H9; sqlite WAL audit; HMAC plan-state; A21 DRR; cross-platform atomic writes (Windows + POSIX via AC-21 native helper).
- **Installation:** `npm install` then `cdcc generate <bundle-path>` (existing CLI; Stage 11 verifies all hooks register).
- **Usage examples:** `cdcc generate`, `cdcc audit --since=ISO`, `cdcc explain <event_id>`, `cdcc migrate-audit-log`, `cdcc config get|set`.
- **Methodology link:** to /dare-to-rise-code-plan + /asae SKILL.md (without exposing methodology content; reference-only).
- **License:** MIT (see LICENSE).

### §5.2 LICENSE content decision

- **License:** MIT
- **Rationale:** Permissive open source; suitable for plugin distribution; no IP encumbrance on methodology (methodology lives in skill files, not plugin code).
- **NOTICE file:** "Powered by Martinez Methods" attribution per Martinez Methods convention.

---

## §6 Cross-References

- **Stage 00 Research Summary:** `plugin/docs/planning/v1.1.0/CDCC_D2R_Stage00_Research_Summary_2026-04-26_v01_I.md` (cdcc HEAD 5b43b50)
- **Stage 01a Skeleton:** `plugin/docs/planning/v1.1.0/CDCC_D2R_Stage01a_Skeleton_2026-04-26_v01_I.md` (cdcc HEAD 9d0b5d8)
- **Bundle (gate-49 amended):** PRD/TRD/AVD/TQCD/UXD + BIDX in same dir; cdcc HEAD 1d38110 canonical bundle state
- **gate-22 Adversarial Code Review:** `deprecated/asae-logs/gate-22-cdcc-adversarial-code-review-v1.0.4-2026-04-26.md` (29 findings)
- **/asae v06 canonical methodology:** `~/.claude/skills/asae/SKILL.md` (lines 297-326 = recovery_events schema; gate-54 codification at repos commit 0e44b48)
- **CCC empirical session:** UUID c1632207-ee0e-4378-be01-6eed39b2d3b1 (4 documented git revert + redelegate cycles cited at /asae v06 line 324)

---

**End of Stage 01b Full Plan.** Awaiting strict-3 ASAE gate (n=5 self-audit-edit + rater).
