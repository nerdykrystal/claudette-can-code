---
name: CDCC v1.1.0 — D2R Stage 00 Research Summary
description: 16+4-track research findings consolidated from 4 parallel sub-agent investigations + 9 locked open-question answers (Q1-Q7 user-discussion + 2 emergent locked via gate-49 amendment) + post-gate-49 amendment alignment. Captures current best practices for the persistence/atomicity/crypto primitives, Claude Code plugin hook lifecycle nuances, current-state map of v1.0.4 source, gate-22 finding verification against current source, and the supersession of pre-gate-49 claims (A21 canonicalization, git revert mechanism, SAR non-reuse for H9). Inputs to Stage 01a skeleton refinement + Stage 01b full plan + all downstream impl stages. This Summary supersedes its own pre-gate-49-amendment claims at the points enumerated in §1 + §5; gate-49 cdcc-repo HEAD 1d38110 is the canonical bundle state.
post_amendment_alignment: gate-49 (cdcc HEAD 1d38110, 2026-04-26)
type: d2r-stage-output
project: CDCC
stage: 00
version: v01_I
date: 2026-04-26
status: I
methodology_version: 0.3.0
owner: Krystal Martinez (krystal@stahlsystems.com)
persona: Claudette the Code Debugger v01 (Claude Opus 4.7, 1M context)
session_chain:
  - kind: gate
    path: cold-read-2026-04-25/claudette-can-code/deprecated/asae-logs/gate-22-cdcc-adversarial-code-review-v1.0.4-2026-04-26.md
    relation: 29-finding remediation backlog this build addresses
  - kind: gate
    path: cold-read-2026-04-25/claudette-can-code/deprecated/asae-logs/gate-48-cdcc-v1.1.0-bundle-authoring-2026-04-26.md
    relation: bundle-authoring convergence gate (PASS strict-3 with rater CONFIRMED)
  - kind: bundle
    path: cold-read-2026-04-25/claudette-can-code/plugin/docs/planning/v1.1.0/
    relation: 5-doc D2R v0.3.0 bundle this Stage 00 research informs
research_method: 4 parallel sub-agent delegations (Agent tool, real invocations) + main-thread synthesis
sub_agents:
  - id: explore-1-sqlite-atomic-crypto
    scope: better-sqlite3 + WAL, HMAC-SHA256, cross-platform atomic writes, JSONL→sqlite migration
    completed: yes
  - id: claude-code-guide-2-plugin-runtime
    scope: plugin.json schema, hook lifecycle + exit codes, PreToolUse + glob, PostToolUse + sub-agent spawn, experimental flags
    completed: yes
  - id: explore-3-codebase-audit
    scope: current v1.0.4 file tree, plugin.json state, hook handlers, CLI surface, audit logger, plan-state code, extractExcellenceSpec, test infra, deps, surprises
    completed: yes
  - id: explore-4-gate22-verification
    scope: cross-check all 29 gate-22 findings against current source for STILL-PRESENT / PARTIALLY-ADDRESSED / CLOSED / N/A verdicts
    completed: yes
---

# CDCC v1.1.0 — D2R Stage 00 Research Summary

## Purpose

Per `/dare-to-rise-code-plan` skill: before any code is written, research current best practices for ALL proposed implementation steps. This document is the canonical research artifact informing Stage 01a skeleton refinement, Stage 01b full plan, and every downstream impl stage. It is the cited source-of-truth for "RESEARCH BASIS" lines in every Stage NN-B commit message.

## Research Method

16 research targets investigated across 4 parallel sub-agent delegations, all real Agent-tool invocations:

- **Sub-agent 1** (Explore subagent_type): persistence + atomicity + crypto (WAL, HMAC, atomic writes, JSONL migration). 4 targets.
- **Sub-agent 2** (claude-code-guide subagent_type): Claude Code plugin runtime (plugin.json, hook lifecycle, glob matching, sub-agent spawn, experimental flags). 5 targets.
- **Sub-agent 3** (Explore subagent_type): codebase exploration of current v1.0.4 (tree, hooks, CLI, audit, plan-state, extractExcellenceSpec, tests, deps, surprises). 10 sub-targets.
- **Sub-agent 4** (Explore subagent_type): gate-22 finding verification against current source. 29 findings audited.

Plus main-thread synthesis (this doc) + 4 plan-skeleton-changing insights flagged at the head of §1.

---

## §1 Plan-Skeleton-Changing Insights (read first)

These four findings change the Stage 01a/01b skeleton authored at the pre-research stage. Stage 01a refinement applies them.

### Insight A — `src/core/sub-agent-redirector/index.ts` already exists (47 LOC) — uncatalogued in bundle, NOT to be extended for H9 (revised post-Q4-discussion)

**Sub-agent 3 finding + Q4-discussion revision.** A sub-agent-redirector module already exists in v1.0.4 at `src/core/sub-agent-redirector/index.ts` (47 LOC). It is uncatalogued in the bundle (AVD §3.1 doesn't list it; not in BIDX-3 — should be added as AVD-AC-23 in a future bundle amendment). Initial recommendation was to extend SAR's discriminated union to carry `redelegation_spec_diff`. **REVISED post Q4-discussion + CCC-evidence read:** SAR is NOT the right vehicle for H9. CCC empirical session (UUID c1632207-ee0e-4378-be01-6eed39b2d3b1, Apr 26 07:49) shows zero hook-emitted directive events across 16 Agent spawns + 4 git revert events; the proven pattern is parent-orchestrated (assistant Bash + Agent calls), not hook-spawned. SAR's existing `'redirect'` action may itself be unverified end-to-end against the current Claude Code harness — a fact this Insight no longer claims to resolve.

**Applies to:** Stage 10 (Recovery Verifier + H9). H9 detection-only + audit-emission; assistant orchestrates revert + re-delegate. SAR module untouched in this build (its H4-redirect contract may itself be verified or replaced in a separate gate).

**Pitfall:** Do not extend SAR for H9 — would create a parallel mechanism on an unverified base. If `cdcc explain` or future stages need SAR, verify the harness consumption claim first via a small test plugin.

### Insight B — H-3 drift has WORSENED since gate-22

**Sub-agent 4 finding.** Gate-22 noted plugin.json + cli/index.ts duplicated hook IDs. Since gate-22, plugin.json gained H6 (line 30) but cli/index.ts still hardcodes only H1–H5 (lines 53–59). H6 will not be auto-installed by `cdcc generate`. This is a NEW drift not in the gate-22 ledger.

**Applies to:** Stage 11 (H6 merged hook). The Stage 11 plan must include CLI install list update, not just H6 handler implementation. Stage 07 (Hook Installer single-SoT runtime read) closes the entire class, but Stage 11 must verify H6 specifically gets registered after the refactor.

### Insight C — sqlite WAL ALONE insufficient for multi-process safety

**Sub-agent 1 finding.** WAL gives unlimited readers + 1 writer per database, serialized internally. For CDCC's multi-process scenario (CLI invocation + Claude Code plugin runtime both writing to `~/.claude/plugins/cdcc/audit.sqlite` simultaneously), `proper-lockfile` is also required to prevent write-thread collisions. AVD-AD-01 names sqlite WAL but does not name `proper-lockfile`.

**Applies to:** Stage 05 (Audit Logger). The Stage 05 plan must list BOTH `better-sqlite3` AND `proper-lockfile` as dependencies. Add to Stage 05 acceptance criteria: "concurrent two-process write test passes."

**Pitfall:** WAL checkpoint starvation — long-running readers prevent checkpoints; WAL file grows unbounded. Add explicit `wal_checkpoint(RESTART)` invocation when WAL exceeds 100 MB, OR set aggressive `wal_autocheckpoint` pragma.

### Insight D — A21 was canonicalized at gate-54 / /asae SKILL.md v06 BEFORE this bundle was authored; gate-49 amendment removes the experimental flag entirely (revised)

**Cross-thread finding from gate-49 amendment work.** The bundle's AVD-AD-05 + PRD-AS-03 + TRD-NFR-3.9-05 originally specified `cdcc.experimental.drr` as a fallback flag for shipping H9 with A21 in PROPOSED status. **/asae SKILL.md v06 (committed at repos/0e44b48, gate-54 attestation, 2026-04-26 12:12) canonicalized A21 as ACCEPTED methodology before this bundle's gate-49 amendment landed.** Hook v06 Tier 14 is LIVE; the recovery_events: schema is canonical. Therefore: **no flag is needed.** v1.1.0 H9 ships unflagged. Q2 storage-location discussion (env var vs settings.local.json vs dedicated config.json) is preserved for future experimental flags via the new AVD-AC-22 Plugin Config Store, but `drr` is no longer one of them.

**Applies to:** Stage 10 (H9 DRR — unflagged), and Q2 lock for the Plugin Config Store as the storage mechanism for FUTURE experimental flags (cdcc.experimental.* namespace ready for v1.2.0+ use).

**Pitfall:** Do not reintroduce `cdcc.experimental.drr` in any source file. Stage 10's H9 implementation must reference /asae SKILL.md v06 (lines 297-326 + line 322 Tier 14 schema) as the contract source, not the deleted Two-Axis Pitch path.

---

## §2 The 16 Research Findings

### Finding 1 — better-sqlite3 + WAL mode

- **Best practice:** Enable WAL via `db.pragma('journal_mode = WAL')`. Set `synchronous = FULL` for audit-log durability (default `NORMAL` accepts crash-window data loss). Pair with `proper-lockfile` for multi-process coordination (see Insight C).
- **Sources:** [WiseLibs/better-sqlite3 performance.md](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md); [Oldmoe 2024 — Concurrent Write Transactions in SQLite](https://oldmoe.blog/2024/07/08/the-write-stuff-concurrent-write-transactions-in-sqlite/); [proper-lockfile npm](https://www.npmjs.com/package/proper-lockfile).
- **Applies to:** Stage 05 (Audit Logger), Stage 07 (Hook Installer multi-process safety).
- **Pitfalls:** Write serialization illusion (WAL doesn't parallelize writes); checkpoint starvation under long-running readers; cross-database transactions are per-DB atomic, not global; `synchronous = NORMAL` default trades durability for speed (override for audit log).

### Finding 2 — HMAC-SHA256 integrity for plan-state

- **Best practice:** `crypto.createHmac('sha256', secretKey)` over JSON state file content; key in 0600-perm file at `~/.claude/plugins/cdcc/hmac.key`; verify with `crypto.timingSafeEqual()`. Sidecar `.hmac` file (vs trailing JSON field) — clearer error mode if HMAC missing.
- **Sources:** [Node.js crypto docs](https://nodejs.org/api/crypto.html); [Authgear — HMAC signatures](https://www.authgear.com/post/generate-verify-hmac-signatures); [W3Tutorials — Node.js file permissions](https://www.w3tutorials.net/blog/nodejs-restrict-permission-on-file/).
- **Applies to:** Stage 06 (Plan-State Store).
- **Pitfalls:** Never compare HMAC with `===` (timing attack); generate key via `crypto.randomBytes(32)` (not derived from password); no automatic recovery on tamper detection — fail-closed and require manual recovery; key file deletion = data loss (document backup story or accept).

### Finding 3 — Cross-platform atomic file writes

- **Best practice:** Use `write-file-atomic` v7.0.1 (handles Windows EPERM retry on rename via exponential backoff). Manual fallback: write-tmp + fsync(fd) + fsync(parent_dir) + rename, all in same dir. **Parent-dir fsync gap on Windows: write-file-atomic does NOT fsync parent dir on all Windows configs.** Native helper required for absolute crash-safety on Windows; otherwise accept the risk.
- **Sources:** [npm/write-file-atomic](https://github.com/npm/write-file-atomic); [Anthony Male — Atomic File Writes on Windows](https://antonymale.co.uk/windows-atomic-file-writes.html); [GitHub issue: EPERM on fs.rename Windows](https://github.com/npm/write-file-atomic/issues/227).
- **Applies to:** Stage 07 (Hook Installer atomic write — H-1 closure).
- **Pitfalls:** Node `fs.writeFile()` is NOT atomic; Windows NTFS rename contention from antivirus; TxF deprecated; orphan temp files on crash require startup cleanup routine. **Q1-LOCKED:** ship native helper (new AVD-AC-21 N-API addon wrapping CreateFile + FlushFileBuffers + CloseHandle; ~50-100 LOC C++ + JS wrapper with graceful fallback; authored as shared module under `_grand_repo/shared/` for cross-plugin reuse). Marginal cost near-zero given `better-sqlite3` already brings native-binary distribution toolchain.

### Finding 4 — JSONL→sqlite migration tool

- **Best practice:** Stream JSONL line-by-line via Node `readline`. Wrap in transaction. Resumability via `_migration_checkpoint` table tracking byte offset. Batch inserts (1000 rows per `INSERT VALUES`). Post-migration validation: row count + checksum vs source.
- **Sources:** [stream-json](https://github.com/uhop/stream-json); [Ben Nadel — Parsing Large JSONL in Node.js](https://www.bennadel.com/blog/3233-parsing-and-serializing-large-datasets-using-newline-delimited-json-in-node-js.htm); [SQLite WAL docs](https://sqlite.org/wal.html).
- **Applies to:** Stage 05 (Audit Logger — `cdcc migrate-audit-log` subcommand).
- **Pitfalls:** Memory exhaustion (always stream); no resumability = restart penalty; batch size too small (use 1000); no post-validation = silent data loss; concurrent WAL writes during migration block; `synchronous = FULL` recommended during migration (slower but crash-safe).

### Finding 5 — plugin.json single source of truth

- **Best practice:** Declare hook IDs + events + handler paths once in plugin.json `hooks` array. CLI reads at runtime via `import('./plugin.json' assert { type: 'json' })`. Cross-validation test asserts no hardcoded hook ID strings appear in cli/. Closes H-3.
- **Sources:** [Claude Code plugins.md](https://code.claude.com/docs/en/plugins.md); CDCC TRD-FR-05 + AVD-AD-03; current plugin.json (lines 22–31).
- **Applies to:** Stages 07 (Hook Installer), 11 (H6), 12 (CLI commands).
- **Pitfalls:** Handler path resolution conventions (.js vs no extension) vary by Claude Code version; `handlersDir` may default to `hooks/`; per-hook timeout override lives in settings.json not plugin.json; H6 currently in plugin.json but missing from CLI install list (Insight B).

### Finding 6 — Hook exit codes (fail-closed idiom)

- **Best practice:** **Exit 0 = allow; Exit 2 = block (stderr shown to user); Exit 1 = non-blocking error (logged, work continues).** For fail-closed on unknown state: exit 2 with stderr naming the missing condition. CDCC v1.0.4 H4 exits 1 on missing/malformed plan-state.json — that's non-blocking (allows the tool to fire). TRD-FR-03 requires exit 2.
- **Sources:** [Claude Code hooks.md — Exit Code Behavior](https://code.claude.com/docs/en/hooks.md); CDCC TRD-FR-03 + NFR-3.1-03; current `src/hooks/h4-model-assignment/index.ts:124-137`.
- **Applies to:** Stages 08a (H4 fail-closed, 5 paths), 08b (other-hook exit-code audit; H1, H2, H3, H5, H6 currently exit 1), 09 (H8), 10 (H9), 11 (H6).
- **Pitfalls:** Common confusion: exit 1 = "block" (it isn't). Latency budget p95 ≤ 50ms is strict; `readFile + JSON.parse + lookup` may exceed on slow FS. Async hooks in PreToolUse are NOT guaranteed to complete before tool fires; reserve async for PostToolUse.

### Finding 7 — PreToolUse + glob (H8 protected_files use case)

- **Best practice:** SessionStart reads `protected_files.yaml`; pre-compile globs into memory; per-PreToolUse match target path against compiled globs (sync); on match without persona in `allowed_personas`, exit 2 with stderr naming rule + path + persona + resolution. Use `fast-glob` (already in CDCC deps).
- **Sources:** CDCC TRD-FR-07; `package.json` already lists `fast-glob ^3.3`; [Claude Code hooks.md PreToolUse schema](https://code.claude.com/docs/en/hooks.md).
- **Applies to:** Stage 09 (Protected Files Resolver + H8).
- **Pitfalls:** Don't recompile globs per-hook (latency budget). Persona context: from `hookPayload.currentPersonaRole` (verify field name); fail-closed if absent. YAML parsing: cache parsed result at SessionStart; don't re-parse. Glob anchoring + precedence rule (first-match vs longest-match) must be documented in `protected_files.yaml` schema. **Windows case-insensitive paths** — normalize before matching.

### Finding 8 — PostToolUse + parent-orchestrated DRR (H9 DRR use case) — REVISED post Q4-discussion + CCC-evidence read

- **Best practice (revised):** H9 hook is **detection + audit-emission only**. It fires on Stop event, runs the verification suite (typecheck, lint, coverage, scope match per role-manifest), and on violation: emits the `recovery_events:` audit row per /asae v06 schema + exits 2 with structured stderr naming the violation_type + suggested action. The H9 hook does NOT do `git revert`; the H9 hook does NOT spawn an Agent. **The parent assistant turn (next message after H9 fires) reads the stderr, calls Bash to `git revert --no-edit <sha>` (or `git restore` for working_tree_state), then calls Agent tool with the corrected redelegation prompt.** This matches the proven CCC empirical pattern (16 Agent spawns + 4 git revert events all from assistant turn, zero hook-spawned). Conforms to /asae SKILL.md v06 line 326 ("CDCC plugin integration: new hook H9 (Recovery Verifier) fires PostToolUse on parent verification" — H9 = verifier, not orchestrator).
- **Sources:** /asae SKILL.md v06 lines 297-326 (canonical A21 spec); CDCC TRD-FR-08 + TRD-INT-04 (post-gate-49 amended to use `git revert`); CCC empirical session UUID c1632207-ee0e-4378-be01-6eed39b2d3b1 (4 documented revert+redelegate cycles cited at /asae v06 line 324).
- **Applies to:** Stage 10 (Recovery Verifier + H9 detection-only).
- **Pitfalls:** Hooks cannot invoke Agent tool — confirmed by CCC transcript evidence. Non-git workspace: H9 refuses with `recovery_pass: false, reason: "non_git_workspace"` (per TRD-INT-04 amended). No retry loop on redelegation failure (per TRD-NFR-3.2-02). **Recursion risk (Q7-locked):** if redelegation also violates, H9 fires once more, surfaces second `recovery_pass: false` to user, no third attempt. The state-file pattern (recovery_pending.json) is one valid implementation of the assistant-handoff; alternative is structured stderr only — Stage 10 decides which.

### Finding 9 — `recovery_events:` audit-log schema (canonical source updated post-gate-49)

- **Best practice:** Verbatim schema per **/asae SKILL.md v06 lines 297-326** (canonical, gate-54). Block fields: `stage_id`, `violation_type` ∈ {scope_violation, false_attestation, coverage_drop, protected_file_mutation, role_boundary, fabrication}, `detected_by`, `revert_target` (7-40-char hex commit hash OR literal string `"working_tree_state"`), `redelegation_spec_diff`, `recovery_pass` (bool). Emit pre-revert AND post-completion rows. Hook v06 Tier 14 (LIVE in /asae commit-msg hook) validates this schema at commit-time when present in gate-file frontmatter.
- **Sources:** /asae SKILL.md v06 lines 297-326 + line 322 (Tier 14 validator spec) + line 324 (CCC empirical evidence citation). Repos commit `0e44b48` is the canonical methodology commit. Cdcc gate-49 (HEAD `1d38110`, 2026-04-26) updated bundle docs to point to this canonical source. The previously-cited Two-Axis Pitch v02 file no longer exists on disk (content absorbed into /asae v06).
- **Applies to:** Stages 10 (H9 emits), 14 (audit log format docs + `cdcc explain` UI), QA (verifies CDCC-emitted markup matches /asae v06 canonical schema; cross-validate via existing /asae commit-msg hook v06 Tier 14).
- **Pitfalls:** Schema verbatim from /asae v06 — do NOT paraphrase. **A21 IS canonical** (gate-54, /asae v06); v1.1.0 ships H9 unflagged. CCC build's 4 events (session UUID c1632207-ee0e-4378-be01-6eed39b2d3b1) are the empirical evidence base /asae v06 line 324 cites. `revert_target` accepts BOTH hex hash AND `working_tree_state` literal — implement both code paths.

### Finding 10 — proper-lockfile vs flock (cross-platform file locks)

- **Best practice:** `proper-lockfile` (mkdir-based atomic lockfile, stale-lock detection via mtime) for cross-platform Node use. Avoid `flock` (POSIX-only; Windows lock semantics differ). Apply to: plan-state.json writes (Stage 06), settings.json writes (Stage 07), audit.sqlite multi-process coordination (Stage 05 + Insight C).
- **Sources:** [proper-lockfile npm](https://www.npmjs.com/package/proper-lockfile); [LogRocket — Node.js file locking](https://blog.logrocket.com/understanding-node-js-file-locking/); CDCC AVD §6.3.
- **Applies to:** Stages 05, 06, 07, 14 (M-1 closure).
- **Pitfalls:** Stale-lock detection requires reasonable retry config; default 10s mtime threshold may be too aggressive for long-running operations. Lockfile in same dir as target (avoid `/tmp/` cross-device issues).

### Finding 11 — Plugin Config Store schema for FUTURE experimental flags (Q2-locked AVD-AC-22) — `cdcc.experimental.drr` no longer applicable

- **Best practice:** Plugin-owned dedicated config at `~/.claude/plugins/cdcc/config.json` with HMAC trailer (same pattern as plan-state per Stage 06). CLI surface: `cdcc config get|set|list|reset`. Defaults baked into `src/core/config/`. Resolve at session start (one-shot per session). Log resolved state of any consulted flag to audit on first use per session. Reserved namespace: `cdcc.experimental.*` for future flags. **`cdcc.experimental.drr` is NOT one of them — A21 is canonical per /asae v06; H9 ships unflagged.**
- **Sources:** [Claude Code settings.md](https://code.claude.com/docs/en/settings.md) (per the limited-supported-keys discovery — only `agent` + `subagentStatusLine` officially supported in plugin settings.json, motivating the dedicated-config approach); CDCC TRD-NFR-3.9-05 (post-gate-49 amended to remove `drr` from flag list); Q2-discussion lock for plugin config store mechanism.
- **Applies to:** Stage 12 (CLI `cdcc config` subcommands), any future stage adding an `experimental.*` flag (none in v1.1.0; v1.2.0+ candidates from PRD-OS list).
- **Pitfalls:** Default-true is a footgun for any destructive feature — keep all `experimental.*` flags default-OFF. HMAC the config so tampering fails closed. Do not add `drr` to this namespace post-canonicalization — would re-create the experimental-status confusion gate-49 just resolved.

### Finding 12 — Streamed sqlite query with prepared statements

- **Best practice:** Use better-sqlite3 prepared statement `.iterate()` for batch iteration (≤1000 rows in flight); push WHERE filters into SQL not application code; close iterator on early termination. Closes H-5 (current code does `readFileSync` of entire JSONL into memory).
- **Sources:** [better-sqlite3 API docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md); CDCC TRD-FR-12.
- **Applies to:** Stage 05 (Audit Logger query path), Stage 12 (`cdcc audit` CLI command).
- **Pitfalls:** `.all()` materializes full result set — use `.iterate()` for large queries. Prepared statements cached per-connection; reuse across calls. WAL readers see consistent snapshot — long-running iteration safe but holds the snapshot (see checkpoint starvation in Finding 1).

### Finding 13 — UTC normalization + timezone-safe filenames

- **Best practice:** All audit log timestamps stored as ISO 8601 with explicit `Z` suffix (UTC). Filename derivation: convert `entry.ts` to UTC date components (`new Date(ts).getUTCFullYear()` + getUTCMonth + getUTCDate), not `.toISOString().split('T')[0]` on a possibly-non-Z timestamp. Comparisons: parse to Date (numeric ms) then compare; never lex-compare ISO strings unless ALL are normalized to `Z` first. Closes H-7 + H-8.
- **Sources:** [MDN Date.prototype.toISOString](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString); [date-fns/utc](https://github.com/date-fns/utc); CDCC gate-22 H-7/H-8 findings.
- **Applies to:** Stage 13 (timezone-shift fixes for filename derivation + lex compare).
- **Pitfalls:** `.toISOString()` always emits `Z` suffix BUT only if the input Date is interpreted in UTC; if input timestamp has `+05:30` offset, `new Date()` may still work but local-tz logic later breaks. ESLint rule: forbid string compare on date-typed fields (custom rule).

### Finding 14 — Audit-log redaction patterns

- **Best practice:** Redact at emission time (not at query time — avoids stored-PII surface). Pattern: regex match-list at emission, replace with `[REDACTED:<reason>]` token, log a redaction-event row with original-hash for audit trail. Schema: `redaction_events:` block alongside `recovery_events:`.
- **Sources:** CDCC TRD-FR-13 + NFR-3.3-03; common practice in audit log libraries (winston-syslog, pino-redact).
- **Applies to:** Stage 05 (Audit Logger emission path).
- **Pitfalls:** Regex-based redaction misses novel PII patterns; complement with field-level allowlist for known-PII fields. `pino-redact` library uses path-based redaction (faster than regex) — prefer if fields are statically known. HMAC the original-hash to avoid PII reconstruction from hash.

### Finding 15 — Mutation testing for TS plugins

- **Best practice:** `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` (already in CDCC devDeps). Configure mutation score threshold (per TQCD-TC-17 (Mutation Testing) + TQCD-OQ-01 (Stryker threshold provisional 80%): target ≥80%). Run on critical files only (audit/, plan-generator/, hook-installer/, recovery/) — not on every file (slow + low value on schemas/types).
- **Sources:** [Stryker.js docs](https://stryker-mutator.io/); CDCC `package.json` (devDeps already present); CDCC TQCD §2.1 TC-17 (Mutation Testing) + TQCD §11 OQ-01 (Stryker threshold provisional 80%).
- **Applies to:** Stage QA (convergence loop).
- **Pitfalls:** Mutation testing is SLOW (10–60 min per run). Run in CI nightly, not per-PR. Surviving mutants don't always indicate bug; some are equivalent mutants (semantically identical). Document the surviving-mutant baseline so future drift is detectable.

### Finding 16 — Concurrency model for hook hot path

- **Best practice:** Per AVD §6.3: single-writer sqlite WAL (better-sqlite3 enforces); proper-lockfile on plan-state.json + settings.json writes; no async I/O in PreToolUse hot path beyond sqlite write. Verify each hook handler against the 50ms p95 budget (TRD-NFR-3.1-03) under realistic load (1000 sequential calls, p95 measured).
- **Sources:** CDCC AVD §6.3 + TRD-NFR-3.1-03; better-sqlite3 sync-only API design.
- **Applies to:** Stages 05, 06, 07, 08, 09, 10, 11.
- **Pitfalls:** PostToolUse hooks (H2, H5, H9) have looser latency; PreToolUse (H3, H4, H6, H8) is strict. H6 with cost-telemetry merge may push latency — measure before-after at Stage 11.

---

## §3 Codebase Current-State Summary (Sub-agent 3)

Full report retained in this thread's context. Key callouts informing downstream stages:

**File tree (depth 4, ex node_modules/dist/.git/coverage):**
- `src/`: ~2,650 LOC across CLI (180), core (1,010), hooks (1,640)
- `tests/`: ~7,219 LOC across 38 test files (unit, integration, reliability, property, e2e)
- Test runner: vitest + vitest-e2e config; coverage thresholds 100% lines/branches/functions/statements; mutation testing (Stryker) already configured
- Deps: `ajv ^8.17`, `fast-glob ^3.3`. DevDeps include Stryker, fast-check, vitest, eslint, typescript-eslint
- Node target: `>=20.11`; TS strict; ES2022; NodeNext modules

**plugin.json state:**
- `version: 0.1.0` (vs `package.json: 1.0.4` — M-8 version skew)
- 3 commands: generate / audit / dry-run
- 6 hooks declared (H1–H6) with event types + handler paths

**Hook handlers (current behavior):**
- All 6 hooks return only exit 0 or 1 — **NO hook returns exit 2.** Fail-closed-with-block requires exit 2 per Finding 6.
- H1 (UserPromptSubmit, fail-closed via exit 1 — should be exit 2): manifest validation
- H2 (Stop, fail-closed via exit 1): deviation manifest schema
- H3 (PreToolUse, fail-OPEN on marker creation): sandbox hygiene
- H4 (PreToolUse, fail-OPEN on stage-not-found, exit 1 on errors): model assignment — C-3 + H-6 + Finding 6 all converge here
- H5 (Stop, fail-closed via exit 1): convergence gate result
- H6 (PreToolUse, fail-OPEN on history read errors): step-reexec — but **not in CLI install list** (Insight B)

**CLI surface:**
- `cdcc generate <dir>`: cascading exit codes 2,3,4,5,6 (L-6); installs H1–H5 only (Insight B); silently overwrites on re-run (L-5)
- `cdcc dry-run <dir>`: 2,3,4 cascading
- `cdcc audit [--since=ISO8601]`: no input validation; always exits 0
- `cdcc --help`: exits 0 (correct)

**Audit logger current state:**
- File path: `<claudeRoot>/cdcc-audit/<YYYY-MM-DD>.jsonl`
- Write pattern: `open(a) + write + fsync + close` per entry
- **No concurrency primitives** — race confirmed
- Filename derivation from `entry.ts` via `.toISOString().split('T')[0]` — H-7 confirmed at line 78
- Query: `readFileSync` whole file + lex sort + filter — H-5 confirmed at line 117; H-8 lex compare confirmed at line 131

**plan-state.json:**
- Read paths: H1 line 87, H4 line 143
- **Write paths: NONE in src/** — H-6 confirmed
- Stage 06 owns the writer

**extractExcellenceSpec:**
- `src/core/plan-generator/index.ts:22-47` — no args, 5 hardcoded QA criteria + 5 hardcoded constraints, never inspects bundle — C-1 confirmed
- Stage 04 fix

**Surprises (10 noted):**
1. H6 missing from CLI install list (→ Insight B)
2. plan-state.json read but never written (→ Stage 06)
3. No audit-log concurrency locks (→ Stage 05)
4. H3 fail-open on marker FS error (intentional per comment, but unusual for security gate)
5. Test file `h2-h3-istanbul-removal.test.ts` looks like artifact
6. `src/core/gate/` (98 LOC) implemented but not called by plan-generator (→ Stage 04 wires it up)
7. **100% coverage threshold + Stryker already configured** (Stage QA inherits)
8. No TODO/FIXME markers (clean codebase)
9. **`backwards-planning/index.ts` returns deterministic stage set, ignores bundle content** — same F13 pattern as extractExcellenceSpec (→ Stage 04 also fixes)
10. CLI exit code cascade unstandardized (→ Stage 12)
11. **Recovery semantics use `git revert --no-edit <sha>` (additive) per /asae SKILL.md v06 + CCC empirical, NOT `git reset --hard` (destructive).** v06 schema also accepts `working_tree_state` literal as `revert_target` for uncommitted-changes case (use `git restore` / `git checkout -- .`). Bundle was amended at gate-49 to align; this Summary captures the canonical mechanism for any code path Stage 10 / 14 implements.

---

## §4 Gate-22 Finding Verification Summary (Sub-agent 4)

Full 29-row table retained in thread context.

**Verdict counts:**
- **STILL-PRESENT: 27** (C-1, C-2, C-3, H-1, H-3, H-4, H-5, H-6, H-7, H-8, M-1, M-2, M-3, M-4, M-5, M-6, M-7, M-9, M-10, M-11, L-1, L-2, L-3, L-4, L-5, L-6, L-7)
- **PARTIALLY-ADDRESSED: 2** — H-2 (added Array.isArray guard but null literal still bypasses); M-8 (version skew unchanged, no clarifying doc)
- **CLOSED: 0**
- **N/A: 0**

**Operational impact:** all 29 findings remain in scope for v1.1.0 build. Bundle's TQCD §5.2 traceability table is accurate. No findings can be dropped from the plan.

**New finding NOT in gate-22 ledger:** H6 in plugin.json but NOT in CLI install list (Insight B). Add as **N-1 (Newly Discovered)** to the v1.1.0 backlog. Stage 11 closes via Insight B mechanism.

---

## §5 Resolved Questions (Q1-Q7 + 2 emergent — all locked via user discussion + gate-49 amendment)

All open questions surfaced during Stage 00 research were resolved via user discussion (Q1-Q7) and/or gate-49 bundle amendment (Q2-emergent / Q4-emergent supersession). This table preserves the question + locked answer + resolution citation for downstream stages and future audit.

| # | Question | Affected Stage | LOCKED ANSWER | Resolution Source |
|---|---|---|---|---|
| Q1 | Windows parent-dir fsync gap: accept or ship native helper? | Stage 07 | **Ship native helper.** New AVD-AC-21 native atomic-write helper (~50-100 LOC C++ N-API addon wrapping CreateFile + FlushFileBuffers + CloseHandle) + JS wrapper with graceful fallback. Author as shared module under `_grand_repo/shared/` for cross-plugin reuse. | User discussion 2026-04-26; rationale: shipping fragile-by-design code is methodologically inconsistent with v1.1.0's purpose; `better-sqlite3` already brings native-binary distribution toolchain so marginal cost is near-zero. |
| Q2 | `cdcc.experimental.drr` storage location? | Stage 10 + 12 | **SUPERSEDED by gate-49.** A21 is canonical per /asae v06; no flag needed for `drr`. Plugin Config Store (AVD-AC-22) authored anyway for future `cdcc.experimental.*` flags via `~/.claude/plugins/cdcc/config.json` + HMAC trailer + `cdcc config get/set/list/reset` CLI surface. | User discussion 2026-04-26 + gate-49 cdcc HEAD `1d38110`. |
| Q3 | H4 currently exits 1; TRD-FR-03 requires exit 2 — is exit 1 ever intentional? | Stage 08a + 08b (split) | **No, exit 1 was never intentional.** Stage 08 splits: 08a = H4-specific 5 failure paths (stage-not-found, plan-state missing, malformed, HMAC fail, model mismatch) each with distinct diagnostic stderr per PRD-AR-NV-01 + PRD-AR-04 templates. 08b = audit + fix all other hooks (H1-H3, H5-H6) for exit-1-fail-closed-intent (none of the 6 hooks return exit 2 today). | User discussion 2026-04-26. |
| Q4 | SAR schema extension for `redelegation_spec_diff`, or different mechanism? | Stage 10 | **REVISED — different mechanism.** Do NOT extend SAR. CCC empirical session (UUID c1632207-ee0e-4378-be01-6eed39b2d3b1) shows hooks don't spawn agents; assistant orchestrates. H9 = detection + audit + structured-stderr + exit-2 only. Parent assistant turn does revert + redelegate. | User discussion 2026-04-26 + CCC session evidence + /asae SKILL.md v06 line 326. |
| Q5 | Mutation-testing scope: critical files or full src/? | Stage QA | **Critical files only** — audit/, plan-generator/, hook-installer/, recovery/, plan-state/, protected-files/, atomic-write/ (new AVD-AC-21), config/ (new AVD-AC-22). ≥80% mutation score target per TQCD-TC-17 (Mutation Testing) + TQCD-OQ-01 (Stryker threshold provisional 80%). Stryker already in devDeps. | User discussion 2026-04-26. |
| Q6 | H8 also flag-gated per PRD-AS-03? | Stage 09 | **No flag — H8 unflagged.** SUPERSEDED via gate-49: A18 + roadmap P3 H8 are methodology-canonical now per /asae SKILL.md v06; no experimental status. | User discussion 2026-04-26 + gate-49. |
| Q7 | Recovery loop semantics: H9 re-fires on redelegation that also violates? | Stage 10 | **One-shot.** H9 fires on first violation, parent reverts + re-delegates, parent re-verifies; if second-attempt also violates, H9 fires once more, surfaces second `recovery_pass: false` to user, no third attempt. Per TRD-NFR-3.2-02 + Q7 lock. | User discussion 2026-04-26. |
| **Q-emergent-1** | `git reset --hard` vs `git revert --no-edit` for revert mechanism? | Stages 10, 14, all docs | **`git revert --no-edit <sha>` for hex case + `git restore`/`git checkout -- .` for `working_tree_state` literal case.** Per /asae SKILL.md v06 line 313-322 schema + CCC empirical session 4 documented cycles. | Discovered during Q4 discussion (CCC session re-read) + locked via gate-49 amendment claim #3. |
| **Q-emergent-2** | A21 status — PROPOSED PENDING /asae canonicalization, or already canonical? | Stages 10 (status), 14 (markup), QA (validation) | **A21 IS CANONICAL** per /asae SKILL.md v06 (gate-54 attestation, repos/0e44b48, 2026-04-26 12:12). Gate-49 confirmed for the bundle. v1.1.0 ships H9 unflagged with recovery_events: markup matching v06 schema. | Discovered during Q4 discussion + locked via gate-49 amendment claim #1. |

**No remaining open questions.** Stage 01a refinement applies all locks above; Stage 01b plan integrates each into the named target stage.

---

## §6 Cross-Reference Map: Research → Stages → Closures

| Stage | Research Findings | gate-22 Closures | Insights Applied |
|---|---|---|---|
| 02 (Scaffold) | 5, 15, 16 | (foundation; none directly) | — |
| 03 (Bundle Parser) | (no new research; existing parser path) | M-9 | — |
| 04 (Plan Generator + extractExcellenceSpec) | (no new research; existing pattern) | C-1, M-2, M-10, H-4 (assignedModel hardcode) | Surprise #6 + #9 |
| 05 (Audit Logger sqlite + migration) | 1, 4, 10, 12, 14, 16 | C-2, H-5, M-1, L-7, L-1, L-4 | Insight C |
| 06 (Plan-State + HMAC) | 2, 10, 16 | H-6 | Surprise #2 |
| 07 (Hook Installer atomic + plugin.json single SoT) | 3, 5, 16 | H-1, H-3, M-3, M-11 | Q1-locked (native helper, AVD-AC-21) |
| 08a (H4 fail-closed, 5 paths) | 6 | C-3 (stage-not-found path), H-6 (plan-state HMAC path) | Q3-locked |
| 08b (other-hook exit-code audit) | 6 | (codebase-wide finding from sub-agent 3 surprise; none of 6 hooks return exit 2) | Q3-locked |
| 09 (Protected Files + H8) | 7, 16 | (A18 + roadmap P3 H8 mechanism; canonical per /asae v06; not in gate-22 ledger) | Q6-locked (unflagged) |
| 10 (Recovery Verifier + H9, detection-only) | 8 (revised), 9 (revised), 16 | (A21 canonicalization; not in gate-22 ledger; ships per /asae v06 line 326) | Insight A-revised + Insight D-revised + Q4-revised + Q7-locked + Q-emergent-1 + Q-emergent-2 |
| 11 (H6 merged) | 5, 6, 16 | (H6 merge + Insight B drift) | Insight B (CLI install list) |
| 12 (CLI explain/rollback/migrate/config) | 5, 11 (Plugin Config Store), 12 | L-5, L-6 | Surprise #10 + Q2-Plugin-Config-Store |
| 13 (Timezone fixes) | 13 | H-7, H-8 | — |
| 14 (M/L bundled) | 10, 16 | M-1, M-4, M-5, M-6, M-7, M-8, L-2, L-3 | — |
| 15 (Design Polish — minimal) | (UXD voice, no new research) | (UX coverage; not in gate-22 ledger) | — |
| QA (Convergence) | 15 | (regression; all findings verified-closed; recovery_events markup validated against /asae commit-msg hook v06 Tier 14) | Q5-locked (mutation testing critical files only, ≥80% per TQCD-TC-17 + TQCD-OQ-01) + gate-54 already canonicalized A21 — Stage QA verifies CDCC v1.1.0 emits matching markup that the LIVE /asae commit-msg hook v06 Tier 14 accepts |

---

## §7 Provenance + Honest Gaps

**Authored:** 2026-04-26 by Claudette the Code Debugger v01 (Claude Opus 4.7, 1M context), main thread, post 4-parallel-sub-agent synthesis.

**Sub-agent IDs:** Recorded in frontmatter `sub_agents:` block. Reports are in this thread's context window (not separate files); cited verbatim where load-bearing in §1–§4.

**Honest gaps:**
1. RESOLVED — sub-agent 2's H9-sub-agent-spawn-protocol uncertainty was settled by CCC empirical session re-read during Q4 discussion. CCC session UUID c1632207 shows zero hook-spawned agents across 16 Agent invocations + 4 git revert events; H9 is detection-only, parent orchestrates. Stage 10 no longer needs a verification spike for SAR — it's not using SAR at all.
2. Sub-agent 1's WAL+lockfile recommendation extends AVD-AD-01; the AVD did not name `proper-lockfile`. This is a research-time amendment, captured here. AVD update at Stage 02 (or Stage 05 kick-off). Bundle gate-49 amendment did not address this (out of scope for that gate); add to v1.1.0 build's first AVD-touching stage's task list.
3. RESOLVED — `src/core/sub-agent-redirector/index.ts` was read during Q4 discussion (47 LOC pure module, single `'redirect'` action with `RedirectDirective` shape carrying `assignedModel` + `originalTool` + `originalArgs`). Decision: do NOT extend for H9 (CCC empirical evidence shows hooks-spawn-agents is unverified pattern). SAR module remains untouched in v1.1.0 build; its existing `'redirect'` action's harness-consumption claim may itself need verification in a separate gate.
4. PARTIALLY RESOLVED — sub-agent 2 used in-repo Claude Code docs + general knowledge, not a fresh WebFetch of code.claude.com. CCC empirical session (Apr 26 07:49) provides observational evidence of CURRENT Claude Code behavior (16 Agent spawns work; hook-emitted directives unobserved). For specific harness-API behaviors not exercised in CCC, gap remains.
5. Mutation-testing scope (Q5-locked) = "critical files only" — audit/, plan-generator/, hook-installer/, recovery/, plan-state/, protected-files/, atomic-write/ (new AVD-AC-21), config/ (new AVD-AC-22). ≥80% target per TQCD-TC-17 (Mutation Testing) + TQCD-OQ-01 (Stryker threshold provisional 80%). If full-src/ mutation desired later, Stage QA budget needs 5–10× expansion — separate decision for v1.2.0+.
6. **NEW honest gap (post-amendment):** The bundle was authored against /asae SKILL.md v05.x (pre-A21-canonicalization); /asae v06 + gate-54 + gate-49 amendment landed mid-build. Future bundles authored against v06+ canonical methodology won't have this skew. The single-thread-author + single-model-family caveat carried forward from v03 scoreboard honest-gap #4 still applies; multi-vendor federated rater integration deferred to v1.2.0+ per AVD-TD-04.

**No PII or secrets in this document.**

---

## §8 Compliance Checklist (per /dare-to-rise-code-plan Stage 00)

- [x] All implementation targets researched (16 findings + 4 insights cover Stages 02–QA)
- [x] Best-practice + Sources + Applies-to + Pitfalls captured per finding
- [x] Stage 00 Research Summary saved as a file at canonical bundle location
- [x] Filename follows project-prefix-first grammar (`CDCC_D2R_Stage00_Research_Summary_2026-04-26_v01_I.md`)
- [x] Frontmatter complete (name, description, type, project, stage, version, date, status, methodology_version, owner, persona, session_chain, research_method, sub_agents)
- [x] Plan-skeleton-changing insights flagged at head of §1
- [x] All Stage 00 open questions resolved + locked in §5 (Q1-Q7 + 2 emergent); no remaining user-call needed before Stage 01a
- [x] Cross-reference map (§6) explicit on which findings inform which stages (post Stage-08-split)
- [x] Honest gaps (§7) documented (3 RESOLVED, 1 PARTIALLY-RESOLVED, 1 standing, 1 NEW post-amendment)
- [x] Frontmatter includes `post_amendment_alignment: gate-49` field documenting cdcc-repo HEAD `1d38110` as canonical bundle state
- [x] No PII, no secrets

---

**End of Stage 00 Research Summary.** Proceed to Stage 00-A (n=5 self-audit-edit gate against this document).
