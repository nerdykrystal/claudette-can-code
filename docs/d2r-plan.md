---
name: CDCC Plugin MVP — D2R Code Plan (Stage 01a + 01b consolidated)
project: Claudette Can Code (Pro) — Plugin Form MVP
stage: 01
authoring_model: opus-4-7
date: 2026-04-22
version: v01_I
upstream: stage00-research-findings.md + CDCC PRD/TRD/AVD/TQCD
---

# D2R Code Plan — Claudette Can Code (Pro) Plugin Form MVP

## Excellent End State

An installable Claude Code plugin that, from a single-artifact install, reads an approved D2R 4-doc bundle and structurally enforces plan adherence via five non-bypassable hooks (H1–H5). Silent substitution (F3), silent skill-skipping / direct-main-session writes (F6), heterogeneous HALT interpretation (F2), gate-skipping (F6), and ambient contamination (F5) are all structurally impossible — not advisory. All enforcement exits non-zero on violation (no warn-only). Audit logs are append-only, fsync'd, local-only. 100% line + branch coverage on testable surface; mutation score ≥ 80% on correctness-critical modules (Convergence Gate Engine, Backwards-Planning Engine, H1–H5, Skill-Gap Checker, Sub-Agent Redirector). Zero network calls at runtime.

## QA-First Specification (from TQCD)

Every FR-001…FR-019 has a functional test. Every BR-001…BR-006 has a behavioral test. Every PRD journey J1/J2/J3 + E1/E2/E3/E4 has an E2E test. Performance budgets per TQCD 7.x enforced via benchmark tests. Reliability benchmarks (TQCD 4.4 — crash rate, hook miss rate, audit-log loss rate, plan-artifact corruption, RTO/RPO) covered by dedicated tests. Fuzz: 10,000 iterations on bundle parser + 10,000 on hook payload validators (may run in CI-weekly mode in MVP per StrykerJS cadence).

## Stage Skeleton (Backwards-Planned from Excellence)

| Stage | Purpose | Model | Depth | ASAE Threshold | Severity |
|---|---|---|---|---|---|
| 00 | Five-track research | Opus | — | 2 | standard |
| 01a | Plan skeleton + user approval | Opus | — | 2 | standard |
| 01b | Full plan content (this doc) | Opus | — | 3 | standard |
| 02 | Project Scaffold (plugin.json, package.json, tsconfig, vitest.config, hook stubs, directory structure, README, LICENSE) | **Sonnet** | Medium | 3 | standard |
| 03 | Bundle Consumer + YourSetupCatalog + Plan Generator + Plan Artifact Writer | **Haiku** | Deep | 3 | standard |
| 04 | Hook Installer + Audit Logger + H1–H5 hook handlers + Convergence Gate Engine + Sub-Agent Redirector | **Haiku** | Deep | 3 | standard |
| 05 | Reliability tests (crash, hook-miss, audit-loss, corruption, RTO/RPO) + CI wiring | **Haiku** | Deep | 3 | standard |
| QA | Convergence loop across Testing Taxonomy applicable sweep | Opus judge / Sonnet remediate / Haiku transcribe | — | 5 | standard |

Parallelization: Stages 03 and 04 can run in parallel after Stage 02 completes (independent file trees: `src/core/` vs `src/hooks/`). Stage 05 depends on 03 + 04.

## Stage 02 — Project Scaffold (Sonnet, Medium depth)

**Artifacts to produce (all under `workspace/plugin/`):**

- `plugin.json` — Claude Code plugin manifest (fields: `name: "cdcc"`, `version: "0.1.0"`, `description`, `commands`, `hooks` pointer)
- `package.json` — npm package with deps: `ajv@^8.17`, `fast-glob@^3.3`; devDeps: `typescript@^5.5`, `vitest@^1.6`, `@vitest/coverage-v8@^1.6`, `fast-check@^3.19`, `@stryker-mutator/core@^8`, `@stryker-mutator/vitest-runner@^8`, `eslint@^9`, `typescript-eslint@^8`; scripts: `build`, `test`, `test:coverage`, `test:mutation`, `lint`, `typecheck`
- `tsconfig.json` — strict mode, `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `declaration: true`, `sourceMap: true`, `outDir: dist`
- `vitest.config.ts` — coverage thresholds `lines: 100, branches: 100, functions: 100`; include `src/**/*.ts`; exclude generated + type-only files
- `eslint.config.js` — typescript-eslint strict + complexity rule (max 15)
- `stryker.conf.mjs` — StrykerJS config scoped to `src/core/gate/**`, `src/core/backwards-planning/**`, `src/hooks/**`, `src/core/skill-gap/**`, `src/core/sub-agent-redirector/**`; mutation score threshold 80
- `.gitignore` — `node_modules`, `dist`, `coverage`, `.stryker-tmp`
- `README.md` — Per Opus content decision below
- `LICENSE` — MIT with Martinez Methods attribution in NOTICE
- `NOTICE` — Martinez Methods / Krystal Martinez attribution
- Directory skeleton: `src/core/{bundle,catalog,plan-generator,gate,backwards-planning,skill-gap,audit,sub-agent-redirector}/`, `src/hooks/{h1-input-manifest,h2-deviation-manifest,h3-sandbox-hygiene,h4-model-assignment,h5-gate-result}/`, `src/cli/`, `tests/{unit,integration,e2e,property,reliability}/`, `schemas/` (JSON schemas), `docs/` (plugin docs)
- `schemas/plan.schema.json` — JSON Schema v07 for the Plan artifact (Stages with model/depth/gate fields)
- `schemas/audit-entry.schema.json` — schema for AuditLogEntry
- `schemas/deviation-manifest.schema.json`, `schemas/convergence-gate-result.schema.json`, `schemas/input-manifest.schema.json`
- Initial commit on main: "Stage 02 scaffold — CDCC plugin MVP"

**README content (Opus-decided):**

- Title: **Claudette Can Code (Pro) — Plugin Form MVP (CDCC)**
- Tagline: Non-bypassable D2R plan enforcement for Claude Code — silent substitution, skill-skipping, and gate-skipping made structurally impossible.
- Installation: clone → `npm install` → register plugin via Claude Code's plugin directory
- Usage: `cdcc generate <planning-dir>` — consumes 4-doc bundle, writes Plan artifact, installs hooks
- Hook semantics: H1 UserPromptSubmit, H2 Stop-BUILD-COMPLETE, H3 sandbox-init, H4 PreToolUse Write/Edit, H5 Stop per-stage
- License: MIT + Martinez Methods attribution (NOTICE)

**LICENSE decision:** MIT permissive with NOTICE file for Martinez Methods attribution.

## Stage 03 — Core Plan-Generation Pipeline (Haiku, Deep depth)

**Files (Haiku transcribes at Deep spec):**

### `src/core/bundle/consumer.ts`

```typescript
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type BundleDoc = { kind: 'PRD' | 'TRD' | 'AVD' | 'TQCD'; path: string; content: string; frontmatter: Record<string, unknown> };
export type Bundle = { prd: BundleDoc; trd: BundleDoc; avd: BundleDoc; tqcd: BundleDoc };
export type BundleError = { code: 'MISSING_DOC' | 'NOT_APPROVED' | 'PARSE_FAIL'; detail: string };

export async function consume(planningDir: string): Promise<{ ok: true; bundle: Bundle } | { ok: false; error: BundleError }> {
  // Read all 4 docs; parse YAML frontmatter; assert status contains "Approved" or "PASS"; return
}
```

Error types: `BundleError` tagged union. No thrown exceptions for expected paths (TRD 6.2 Result-type).

Tests (`tests/unit/bundle-consumer.test.ts`): happy path (valid 4-doc bundle); missing doc; unapproved doc; malformed frontmatter; cross-doc frontmatter inconsistency; every FR-001 acceptance criterion asserted.

### `src/core/catalog/your-setup.ts`

```typescript
export type YourSetupCatalog = { skills: string[]; plugins: string[]; mcpServers: string[]; source: { settingsPath: string; pluginsDir: string } };
export async function buildCatalog(claudeRoot: string): Promise<YourSetupCatalog> { /* parse .claude/settings.json + list .claude/plugins/ + list MCP entries */ }
```

Tests: empty catalog; rich catalog; missing settings.json; malformed JSON (graceful fallback to empty arrays per FR-017).

### `src/core/plan-generator/generate.ts`

Applies backwards-planning-from-excellence. Input: Bundle + YourSetupCatalog. Output: Plan entity matching `schemas/plan.schema.json`. Stage ordering derived from TQCD excellence-state backward.

Tests: deterministic output on same input (FR/TQ-006); schema-valid output; every stage has `assigned_model` + `effort_level` + `spec_depth` + `gate` (FR-003, FR-004, FR-005).

### `src/core/backwards-planning/engine.ts`

Pure function: (excellenceSpec, constraints) → orderedStages. Mutation-tested.

### `src/core/skill-gap/checker.ts`

`check(plan, catalog): Result<void, SkillGap[]>`. FR-018.

### `src/core/plan-writer/writer.ts`

Serializes Plan to JSON at user-specified path; validates against schema pre-write; fsync.

## Stage 04 — Enforcement Layer (Haiku, Deep depth)

### `src/core/audit/logger.ts`

Append-only JSON-lines. fsync-on-write. Default path `.claude/cdcc-audit/YYYY-MM-DD.jsonl`. Every entry `{ts, hookId, stage, decision, rationale, payload}` matching schema. FR-015, FR-016, SR-002.

### `src/core/gate/engine.ts`

Internal convergence-gate (ASAE methodology). Inputs: scope {target, sources, prompt, domain, threshold, severity_policy}. Output: `ConvergenceGateResult {converged: boolean, counter: number, findings: Finding[]}`. FR-012. Mutation-tested.

### `src/core/sub-agent-redirector/redirect.ts`

When H4 blocks: emit a structured redirect directive consumable by Claude Code harness (JSON stdout) requesting Agent-tool invocation with `model=<plan_assigned_model>` + subagent context. AD-009.

### Hook handlers (each under `src/hooks/hN-*/index.ts`)

- **H1** `input-manifest`: reads plan's expected InputManifest, compares to ambient fs, emits structured diff on mismatch, exits non-zero.
- **H2** `deviation-manifest`: on Stop, scans workspace vs plan for substitution patterns (framework swap, input swap), requires structured DeviationManifest payload — reject empty manifest + detected substitution with exit non-zero.
- **H3** `sandbox-hygiene`: on activation, scans worktree vs allowlist from plan; halt or remove per config.
- **H4** `model-assignment`: PreToolUse on Write/Edit — reads current stage from plan state file, compares executing model to `plan_assigned_model`, emits redirect directive + exit non-zero on mismatch.
- **H5** `gate-result`: Stop per-stage — requires structured ConvergenceGateResult payload with `converged: true`; if missing, invokes Convergence Gate Engine directly; emits block + template on non-convergence.

Each hook: `<50 LOC handler` + exhaustive tests covering allow/block/malformed-payload paths. Per-hook performance test asserts p99 budget from TQCD 7.2.

### `src/core/hook-installer/install.ts`

Writes H1–H5 entries into `.claude/settings.json` atomically (temp-file + rename). Preserves existing config. Tests: preserves unrelated keys; rolls back on partial failure (reliability target).

### `src/cli/index.ts`

Commands: `cdcc generate <planning-dir>` (BR-001); `cdcc audit [--since=...]` (BR-003); `cdcc dry-run <planning-dir>` (BR-005, shippable).

## Stage 05 — Reliability + CI (Haiku, Deep depth)

### Reliability tests (`tests/reliability/`)

- `crash-recovery.test.ts` — kill process mid-gen; re-invoke; assert p95 ≤ 5s (TQCD 4.4 RTO). Invariant: source bundle SHA-256 unchanged pre/post (RPO).
- `hook-miss-rate.test.ts` — synthetic qualifying events per H1–H5; assert 1:1 firing.
- `audit-log-loss-rate.test.ts` — fire 1000 events; assert 1000 entries with fsync'd persistence; simulate crash after fsync, assert zero loss.
- `plan-artifact-corruption.test.ts` — generate → parse-back → deep-equal round-trip.
- `stress-fault-injection.test.ts` — malformed bundle fields, corrupted settings.json, hook-composition-order edge cases.

### CI (`.github/workflows/ci.yml`)

Jobs: `typecheck`, `lint`, `test-unit`, `test-integration`, `test-e2e`, `test-property` (fast-check 10k iters), `test-reliability`, `benchmark` (thresholds enforced), `coverage-floor` (100%/100%), `no-network-runtime` (run tests with `--no-network`-equivalent env), `no-dynamic-exec-static-check`, `secret-scan` (gitleaks). Weekly: `mutation` (StrykerJS, threshold 80).

### Pre-commit (`.githooks/pre-commit`)

lint + typecheck + test-unit + coverage-floor + secret-scan. Install via `npm run prepare`.

## Hook Composition Order (AD-008 default)

On `Stop`: H5 (per-stage gate result) runs first; if block, short-circuit. H2 (BUILD COMPLETE deviation-manifest) runs only when sentinel pattern detected — mutually exclusive in practice.

## Cross-references

Every FR/BR/SR/AD traced to implementation file + test file in `tests/README.md` (Stage 05 deliverable).

## Deviations

None at this authoring time.

## Stage 01b Exit Gate

ASAE threshold 3 (plan-content gate). Findings from self-audit recorded in `workspace/deprecated/asae-logs/stage-01b-gate.md`.
