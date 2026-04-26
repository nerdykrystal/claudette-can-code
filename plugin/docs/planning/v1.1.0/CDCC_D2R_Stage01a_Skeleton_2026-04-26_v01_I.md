---
name: CDCC v1.1.0 — D2R Stage 01a Skeleton
description: Stage 01a metadata-level plan skeleton per /dare-to-rise-code-plan SKILL.md Steps 1-5. (1) Excellent End State, (2) QA-First Design (TQCD↔Stage-00 cross-check), (3) 16-stage backwards-planned skeleton with per-stage metadata, (4) Hook configuration summary, (5) Plan skeleton presented in table form for explicit user approval gate. Authored against gate-49-amended bundle + Stage 00 Research Summary (cdcc HEAD 5b43b50, Stage 00-A strict-3-PASS).
type: d2r-stage-output
project: CDCC
stage: 01a
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
    path: plugin/docs/planning/v1.1.0/CDCC_D2R_Stage00_Research_Summary_2026-04-26_v01_I.md
    relation: Stage 00 research basis (16 findings + 4 insights + 9 Q-locks); cdcc HEAD 5b43b50 strict-3-PASS
  - kind: bundle
    path: plugin/docs/planning/v1.1.0/
    relation: 5-doc bundle (PRD/TRD/AVD/TQCD/UXD) + BIDX scoping the plan
  - kind: gate
    path: deprecated/asae-logs/gate-22-cdcc-adversarial-code-review-v1.0.4-2026-04-26.md
    relation: 29-finding remediation backlog the implementation stages address
  - kind: gate
    path: deprecated/asae-logs/gate-48-cdcc-v1.1.0-bundle-authoring-2026-04-26.md
    relation: bundle convergence (PASS strict-3 with rater CONFIRMED)
  - kind: gate
    path: deprecated/asae-logs/gate-49-cdcc-v1.1.0-bundle-amendment-post-asae-v06-canonicalization-2026-04-26.md
    relation: post-A21-canonicalization bundle amendment; canonical state for this plan
stage_count: 16
parallelizable_stages: 7
sequential_dependencies: 9
asae_threshold_default: 3
asae_threshold_qa: 5
---

# CDCC v1.1.0 — D2R Stage 01a Skeleton

This document is the Stage 01a output per `/dare-to-rise-code-plan` SKILL.md (methodology v0.3.0). It executes Steps 1-5 of the Stage 01a Authorship Protocol against the gate-49-amended CDCC v1.1.0 bundle and the Stage 00 Research Summary. Stage 01a exits through the ASAE gate (threshold 2 per SKILL.md; elevated to strict-3 by repo `.asae-policy` for non-code public-going commits) AND the user approval gate. Stage 01b does not begin until both gates clear.

---

## Step 1 — Define Excellent End State

Per SKILL.md Step 1: describe in concrete operational terms what excellent looks like for the final output. Functional + non-functional + specific exit criteria tied to Stage 00 standards/benchmarks + the prerequisite TQCD.

### Functional Capability At Excellence

CDCC v1.1.0 is excellent when, against the v1.0.4 codebase audited at gate-22:

- **All 29 gate-22 findings closed:** 27 STILL-PRESENT findings + 2 PARTIALLY-ADDRESSED findings (H-2, M-8) verified-CLOSED at Stage QA regression
- **N-1 closed:** the new finding from Stage 00 Insight B (H6 in `plugin.json` line 30 but missing from CLI install list `cli/index.ts:53-59`) closed via Stage 07's `plugin.json` single-source-of-truth refactor + Stage 11 verification
- **A21 DRR shipped UNFLAGGED:** H9 Recovery Verifier hook (detection-only) emits `recovery_events:` audit rows matching /asae SKILL.md v06 lines 297-326 schema verbatim; assistant orchestrates `git revert --no-edit <sha>` (hex case) OR `git restore`/`git checkout -- .` (`working_tree_state` literal case) per Q-emergent-1-lock
- **A18 + roadmap P3 H8 shipped UNFLAGGED:** H8 Protected Files Resolver fail-closed at exit 2 with structured stderr (rule + path + persona + resolution) per Finding 7 + Q6-lock
- **`plugin.json` is single source of truth for hooks:** zero hardcoded hook IDs in `cli/`; H1-H6 + H8 + H9 read from `plugin.json.hooks` array at runtime (closes H-3 systemically + Insight B)
- **All 6 (now 8) hooks return exit 2 on fail-closed paths:** Stage 00 sub-agent 3 confirmed NO hook returns exit 2 today; Q3-lock fixes via Stage 08a (H4 5 paths) + Stage 08b (H1/H2/H3/H5/H6 audit)
- **Audit logger is sqlite WAL store with proper-lockfile multi-process coordination:** closes C-2, H-5, M-1, L-1, L-4, L-7; HMAC-redaction at emission (not query); `cdcc migrate-audit-log` subcommand streams legacy JSONL with byte-offset checkpointing (Finding 4)
- **Plan-state.json is HMAC-protected:** plan-state writer exists in `src/` (H-6 was: read-only, never written); HMAC-SHA256 sidecar; `crypto.timingSafeEqual()` comparison; key file at 0600 (Finding 2)
- **Atomic writes work on Windows:** AVD-AC-21 native helper (~50-100 LOC C++ N-API addon: CreateFile + FlushFileBuffers + CloseHandle) with JS fallback; closes H-1 + Q1-lock
- **CLI subcommands complete:** `cdcc explain <event_id>`, `cdcc rollback <event_id>`, `cdcc migrate-audit-log`, `cdcc config get|set|list|reset` (Plugin Config Store AVD-AC-22 for FUTURE flags only — Q2-lock)

### Non-Functional Properties At Excellence

| Property | Target | Source |
|---|---|---|
| Performance — PreToolUse hook latency p95 | ≤ 50ms under 1000-sequential-call load | TRD-NFR-3.1-03 |
| Concurrency — multi-process safety | sqlite WAL + proper-lockfile + concurrent-2-process-write test passes | Stage 00 Insight C |
| Atomicity — Windows + POSIX | write-file-atomic on POSIX + AC-21 native helper on Windows; orphan temp cleanup at startup | Finding 3 + Q1-lock |
| Security — plan-state + config integrity | HMAC-SHA256, timing-safe comparison, fail-closed on tamper | Finding 2 |
| Accessibility — CLI text + `cdcc explain` rendering | UXD voice + structural review (no UI surface, but text output WCAG-relevant where applicable) | UXD §5 |
| Reliability — recovery loop | one-shot per Q7-lock; second violation surfaces `recovery_pass: false` to user, no third attempt | TRD-NFR-3.2-02 + Q7-lock |
| Maintainability — hook-ID single SoT | zero hardcoded hook ID strings in `cli/`; runtime read of `plugin.json.hooks` | Finding 5 + Insight B |

### Specific Exit Criteria (Tied To Standards + Benchmarks + TQCD)

- 100% line/branch/function/statement coverage (current vitest config; per Stage 00 Surprise #7)
- ≥80% mutation score on critical files (TQCD-TC-17 + TQCD-OQ-01; Q5-lock scope: audit/, plan-generator/, hook-installer/, recovery/, plan-state/, protected-files/, atomic-write/ NEW, config/ NEW)
- All 29 gate-22 findings + N-1 verified-CLOSED at Stage QA regression
- All `recovery_events:` markup the plugin emits parses cleanly through the LIVE /asae commit-msg hook v06 Tier 14 validator (cross-validation at Stage QA)
- Property tests pass on envelope math (geometric/Bernoulli) + sentinel calibration per TQCD §5.2 Wave-3 IBM-fatal MAST stress-tests
- Hook installation verification CI job passes per SKILL.md "Hook Installation Verification" requirement

---

## Step 2 — Design QA First (Per Testing Taxonomy + TQCD)

Per SKILL.md Step 2: design the QA that verifies the excellent end state BEFORE designing implementation stages. The TQCD already declared Testing Taxonomy applicability per category at gate-48. Stage 01a cross-checks TQCD declarations against Stage 00 research and surfaces discrepancies.

### TQCD Categories Cross-Checked Against Stage 00 Research

| TQCD § | Category | Stage 00 corroboration | Stage QA Exit Criterion | Discrepancy |
|---|---|---|---|---|
| §2.1 TC-1 | Unit testing | Surprise #7 (vitest 100% threshold already configured); Finding 16 | 100% line/branch/function/statement coverage | None |
| §2.1 TC-3 | Integration testing | Finding 6 (exit codes); Finding 9 (recovery_events schema) | All 8 hooks integration-tested for exit 2 paths; recovery_events markup round-trips through /asae v06 hook | None |
| §2.1 TC-12 | Property-based testing | Finding 14 (audit redaction); TQCD §5.2 Wave-3 envelope math | fast-check property tests pass on envelope math + sentinel calibration | None |
| §2.1 TC-17 | Mutation testing | Finding 15 (Stryker config in devDeps); Q5-lock (critical files only) | ≥80% mutation score on critical files; Stryker baseline documented | None |
| §2.1 TC-19 | Concurrency / race testing | Insight C (WAL + proper-lockfile); Findings 1, 10 | Concurrent two-process write test passes (NEW exit criterion added to Stage 05) | NEW: Insight C added proper-lockfile + concurrent-write test not declared in pre-amendment AVD-AD-01; resolved by AVD update at Stage 02 |
| §2.1 TC-25 | Cross-platform testing | Finding 3 (Windows EPERM + parent-dir fsync); Q1-lock (native helper) | AVD-AC-21 native helper passes Windows + POSIX atomic-write tests | NEW: AC-21 native helper added by Q1-lock; not in pre-discussion bundle |

### QA Specification (Stage QA Exit Criteria In Advance Of Implementation)

Stage QA exits when ALL of:

1. **Convergence loop:** ASAE Certainty Threshold of 5 consecutive null-cycle QA sweeps reached (per SKILL.md Stage QA Exit)
2. **Coverage gates:** 100% line/branch/function/statement coverage on src/; vitest passes
3. **Mutation gates:** ≥80% Stryker mutation score on Q5-locked critical files; Stryker baseline doc committed
4. **Concurrency gate:** Two-process simultaneous-write test passes (NEW — added per Insight C)
5. **Cross-platform gate:** AC-21 native helper atomic-write test passes on Windows + POSIX
6. **A21 cross-validation gate:** Sample `recovery_events:` markup emitted from H9 round-trips through LIVE /asae commit-msg hook v06 Tier 14 validator (no parse errors, all required fields, revert_target validates as hex hash OR `working_tree_state` literal)
7. **gate-22 regression gate:** All 29 findings + N-1 (Insight B) verified-CLOSED via row-by-row attestation in `gate-NN-cdcc-v1.1.0-qa-convergence-2026-MM-DD.md`
8. **Hook-installation verification CI job passes** per SKILL.md requirement

---

## Step 3 — Backwards-Plan Implementation Stages (Skeleton-Level Metadata Only)

Per SKILL.md Step 3: backwards-planned from §1 Excellent End State + §2 QA Spec. Per stage: metadata only (Stage 01b authors full content). Stage 02 = Sonnet (SKILL.md hard rule). Stage 03+ = Haiku at Deep depth (SKILL.md default; deviations justified per Stage 00 Track 4).

### §3.02 Stage 02 — Project Scaffold + Bundle-Required Dependency Updates

- **Purpose:** Update `package.json` deps (add `proper-lockfile`, `write-file-atomic`, `node-addon-api` for AC-21); scaffold new module dirs (`src/core/atomic-write/`, `src/core/config/`, `src/core/protected-files/`, `src/core/recovery/`); update `plugin.json` schema if needed; refresh AVD-AD-01 (proper-lockfile added per Stage 00 honest-gap #2)
- **Inputs:** Stage 00 Research Summary; gate-49-amended bundle; current `package.json` + `plugin.json`
- **Outputs:** Updated `package.json` + `plugin.json`; scaffolded empty module dirs with `index.ts` stubs; AVD-AD-01 amendment commit
- **Model:** Sonnet | **Effort:** low | **Depth:** Shallow | **ASAE Threshold:** 3
- **Hook config summary:** none added in this stage (Stage 07 owns H1-H6 + H8 + H9 install logic)
- **Coverage exit:** N/A (scaffold only) | **A11y exit:** N/A
- **Parallelization:** sequential — must complete before any Stage 03+
- **Traceability:** Insight C (proper-lockfile in AVD); Q1-lock (AC-21 dir); Q2-lock (config dir); Stage 00 honest-gap #2

### §3.03 Stage 03 — Bundle Parser (M-9 fix)

- **Purpose:** Make bundle parser inspect actual bundle content (currently deterministic; ignores input — gate-22 M-9)
- **Inputs:** Stage 02 scaffold; current `src/core/bundle-parser/` (if any)
- **Outputs:** Bundle parser reads PRD/TRD/AVD/TQCD/UXD + BIDX; returns parsed AST
- **Model:** Haiku | **Effort:** low | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** none
- **Coverage exit:** 100% on `src/core/bundle-parser/` | mutation excluded (parser = pure transform; low-risk)
- **Parallelization:** parallel-cluster-A (with §3.04, §3.06, §3.09, §3.14) after §3.02
- **Traceability:** gate-22 M-9; Surprise #6 (gate module unwired)

### §3.04 Stage 04 — Plan Generator + extractExcellenceSpec rewrite (C-1 + Surprise #9)

- **Purpose:** Rewrite `extractExcellenceSpec` (currently 5 hardcoded QA criteria; never inspects bundle); rewrite `backwards-planning/index.ts` (same F13 pattern); wire `src/core/gate/` (98 LOC currently unused)
- **Inputs:** Stage 03 parsed bundle AST; TQCD-declared excellence criteria
- **Outputs:** Plan generator that derives stages from bundle content; backwards-planner that uses TQCD-declared excellence; wired gate module
- **Model:** Haiku | **Effort:** medium | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** none
- **Coverage exit:** 100% on plan-generator + backwards-planning + gate modules | mutation INCLUDED (Q5-locked critical file)
- **Parallelization:** parallel-cluster-A (depends on §3.03 output schema)
- **Traceability:** gate-22 C-1, M-2, M-10, H-4 (assignedModel hardcode); Surprise #6, #9

### §3.05 Stage 05 — Audit Logger sqlite + JSONL→sqlite migration

- **Purpose:** Replace JSONL append-write audit log with better-sqlite3 WAL-mode store + proper-lockfile multi-process coordination + `cdcc migrate-audit-log` subcommand; HMAC-redaction at emission
- **Inputs:** Stage 02 scaffold; Findings 1, 4, 10, 12, 14, 16; Insight C; current `src/core/audit/`
- **Outputs:** sqlite WAL audit logger; `cdcc migrate-audit-log` with byte-offset checkpointing; `recovery_events:` schema row support
- **Model:** Haiku | **Effort:** high | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** none (audit logger consumed by hooks; no new hook here)
- **Coverage exit:** 100% on `src/core/audit/` | mutation INCLUDED (Q5-locked critical file) | concurrent two-process write test required (NEW exit criterion per Insight C)
- **Parallelization:** sequential after §3.02 (foundation for §3.06, §3.10, §3.12, §3.13)
- **Traceability:** gate-22 C-2, H-5, M-1, L-1, L-4, L-7; Insight C; Findings 1/4/10/12/14/16

### §3.06 Stage 06 — Plan-State Store + HMAC

- **Purpose:** Implement plan-state.json writer (currently NONE in `src/` — H-6); HMAC-SHA256 sidecar; integrate with proper-lockfile
- **Inputs:** Stage 02 scaffold; Findings 2, 10, 16; current H1+H4 read paths
- **Outputs:** Plan-state writer with HMAC sidecar; key generation at first run; HMAC verification on read
- **Model:** Haiku | **Effort:** medium | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** none (consumed by H1+H4)
- **Coverage exit:** 100% on `src/core/plan-state/` | mutation INCLUDED (Q5-locked critical file)
- **Parallelization:** parallel-cluster-A
- **Traceability:** gate-22 H-6; Surprise #2; Findings 2/10/16

### §3.07 Stage 07 — Hook Installer atomic + plugin.json single SoT + AC-21 native helper

- **Purpose:** Read hook list from `plugin.json` at runtime (zero hardcoded array); use write-file-atomic on POSIX + AC-21 native helper on Windows for settings.json mutation; orphan-temp-file startup cleanup
- **Inputs:** Stages 05+06 (lockfile + atomic patterns); Findings 3, 5, 16; current `src/core/hook-installer/` + `src/cli/index.ts:53-59` (the hardcoded array to delete)
- **Outputs:** Hook installer reading `plugin.json.hooks`; AVD-AC-21 native helper authored as shared module under `_grand_repo/shared/` per Q1-lock; JS fallback wrapper
- **Model:** Haiku for JS wrapper + installer logic; **Opus low-effort for the C++ N-API native helper** (justified: native code outside Haiku Deep-spec depth feasibility per Stage 00 Track 4)
- **Effort:** high | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** installer-side logic for H1-H6 + H8 + H9 single-SoT runtime read
- **Coverage exit:** 100% on `src/core/hook-installer/` + `src/core/atomic-write/` | mutation INCLUDED (Q5-locked critical file) | cross-platform atomic write test required (Windows + POSIX)
- **Parallelization:** sequential after §3.05+§3.06
- **Traceability:** gate-22 H-1, H-3, M-3, M-11; Q1-lock; Insight B (CLI install list deletion); Findings 3/5/16

### §3.08a Stage 08a — H4 Fail-Closed (5 paths, exit 2 with PRD-AR-NV-01 + PRD-AR-04 stderr)

- **Purpose:** Convert H4 from exit 1 to exit 2 on all 5 failure paths: stage-not-found, plan-state missing, plan-state malformed, HMAC fail, model mismatch
- **Inputs:** Stage 06 (plan-state HMAC); Stage 04 (plan-generator); current `src/hooks/h4-model-assignment/index.ts:124-137`; Finding 6
- **Outputs:** H4 with 5 distinct exit-2 paths each emitting structured stderr per PRD-AR-NV-01 + PRD-AR-04
- **Model:** Haiku | **Effort:** medium | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** H4 modifications
- **Coverage exit:** 100% on `src/hooks/h4-model-assignment/` | mutation INCLUDED (Q5-locked) | 5 path-specific exit-2 integration tests required
- **Parallelization:** parallel-cluster-B (with §3.08b) after §3.06
- **Traceability:** gate-22 C-3, H-4, H-6 (plan-state HMAC path); Q3-lock

### §3.08b Stage 08b — Other-hook exit-code audit + fix (H1, H2, H3, H5, H6)

- **Purpose:** Audit H1/H2/H3/H5/H6 — all currently exit 1 on fail-closed-intent paths (Stage 00 sub-agent 3 systemic finding); convert to exit 2 with structured stderr
- **Inputs:** Stage 00 sub-agent 3 finding; Finding 6
- **Outputs:** H1/H2/H3/H5/H6 with corrected exit-2 paths + structured stderr; H-2 PARTIAL closure (Array.isArray + null literal guard)
- **Model:** Haiku | **Effort:** medium | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** H1/H2/H3/H5/H6 modifications
- **Coverage exit:** 100% on each hook handler | mutation excluded (thin handlers; integration-tested)
- **Parallelization:** parallel-cluster-B (disjoint hook surfaces from §3.08a)
- **Traceability:** Stage 00 sub-agent 3 systemic finding; Finding 6; Q3-lock; gate-22 H-2 PARTIAL→CLOSED

### §3.09 Stage 09 — Protected Files Resolver + H8

- **Purpose:** SessionStart-loaded `protected_files.yaml` glob resolver + new H8 PreToolUse hook with persona-not-allowed fail-closed exit 2 + structured stderr (rule + path + persona + resolution)
- **Inputs:** Stage 02 scaffold; Findings 7, 16; existing `fast-glob ^3.3` dep; persona context from `hookPayload.currentPersonaRole`
- **Outputs:** `src/core/protected-files/` resolver; new H8 handler at `src/hooks/h8-protected-files/index.ts`; `protected_files.yaml` schema doc; Stage-07 install-list addition
- **Model:** Haiku | **Effort:** medium | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** H8 (NEW PreToolUse); SessionStart pre-compile glob into memory
- **Coverage exit:** 100% on `src/core/protected-files/` + `src/hooks/h8-protected-files/` | mutation INCLUDED (Q5-locked) | Windows case-insensitive path normalization tested
- **Parallelization:** parallel-cluster-A
- **Traceability:** A18 + roadmap P3 H8 (canonical per /asae v06; not in gate-22 ledger); Finding 7; Q6-lock (UNFLAGGED)

### §3.10 Stage 10 — Recovery Verifier + H9 (detection-only) — UNFLAGGED PER GATE-49

- **Purpose:** New H9 PostToolUse(Stop) hook = detection + audit-emission only. Runs verification suite (typecheck, lint, coverage, scope-vs-role-manifest). On violation: emits `recovery_events:` audit row per /asae v06 schema verbatim + exits 2 with structured stderr naming violation_type + suggested action. **H9 does NOT do `git revert`; H9 does NOT spawn an Agent.** Parent assistant turn does revert + redelegate per CCC empirical pattern (UUID c1632207-ee0e-4378-be01-6eed39b2d3b1).
- **Inputs:** Stage 05 (audit logger with recovery_events: schema); Findings 8 (revised), 9 (revised), 16; /asae SKILL.md v06 lines 297-326; Insights A-revised + D-revised; Q4-revised, Q7-lock, Q-emergent-1-lock, Q-emergent-2-lock
- **Outputs:** `src/hooks/h9-recovery-verifier/index.ts` (detection + audit + exit 2 only); `src/core/recovery/` verifier suite; Stage-07 install-list addition
- **Model:** Haiku | **Effort:** high | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** H9 (NEW PostToolUse on Stop)
- **Coverage exit:** 100% on `src/core/recovery/` + `src/hooks/h9-recovery-verifier/` | mutation INCLUDED (Q5-locked) | recovery_events markup round-trips through /asae v06 hook (Stage QA cross-validation)
- **Parallelization:** sequential after §3.05
- **Traceability:** A21 canonical per /asae v06 (gate-54); Insights A-revised + D-revised; Q4-revised; Q7-lock; Q-emergent-1-lock (`git revert --no-edit <sha>` for hex; `git restore` for `working_tree_state`); Q-emergent-2-lock (UNFLAGGED). **DO NOT extend SAR; DO NOT reintroduce `cdcc.experimental.drr`.**

### §3.11 Stage 11 — H6 merged + CLI install list closure (N-1 NEW finding)

- **Purpose:** Verify H6 (already in `plugin.json:30` since gate-22) registers after Stage 07's runtime-read refactor; add cost-telemetry merge logic if H6 PostToolUse design changed; close N-1 (H6 missing from CLI) systemically via Insight B mechanism
- **Inputs:** Stage 07 (single-SoT installer); Insight B; current `plugin.json:30` (H6) + `cli/index.ts:53-59` (now-deleted hardcoded array)
- **Outputs:** H6 registration verified post-Stage-07 refactor; cost-telemetry merge if applicable
- **Model:** Haiku | **Effort:** low | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** H6 verification (no new hook; closes drift)
- **Coverage exit:** 100% on `src/hooks/h6-step-reexec/` | mutation excluded (thin handler; integration-tested via Stage 07's single-SoT registration test)
- **Parallelization:** sequential after §3.07
- **Traceability:** Insight B (Stage 11-specific closure on top of Stage 07's systemic H-3 closure)

### §3.12 Stage 12 — CLI explain/rollback/migrate/config (L-5, L-6 + Q2 Plugin Config Store)

- **Purpose:** Add `cdcc explain <event_id>`, `cdcc rollback <event_id>`, `cdcc migrate-audit-log`, `cdcc config get|set|list|reset`; standardize CLI exit code cascade (Surprise #10); add overwrite-confirm on `cdcc generate` re-run (L-5)
- **Inputs:** Stages 05 (audit logger), 06 (plan-state), 11 (H6); Findings 5, 11, 12; Q2-lock
- **Outputs:** New CLI subcommands; standardized exit code cascade; overwrite-confirm prompt; `src/core/config/` Plugin Config Store (AVD-AC-22)
- **Model:** Haiku | **Effort:** medium | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** none
- **Coverage exit:** 100% on `src/cli/` + `src/core/config/` | mutation INCLUDED on `src/core/config/` (Q5-locked) | `recovery_events:` markup format-test for `cdcc explain`
- **Parallelization:** sequential after §3.05+§3.06+§3.11
- **Traceability:** gate-22 L-5, L-6; Surprise #10; Q2-lock (Plugin Config Store; AVD-AC-22; FUTURE flags only — `drr` NOT applicable)

### §3.13 Stage 13 — Timezone fixes (H-7, H-8)

- **Purpose:** Fix `audit/index.ts:78` filename derivation (use `getUTCFullYear/getUTCMonth/getUTCDate` not `.toISOString().split('T')[0]`); fix `audit/index.ts:131` lex-compare (parse to Date numeric ms before compare); add ESLint custom rule forbidding string-compare on date-typed fields
- **Inputs:** Stage 05 (sqlite migration may obviate some H-7/H-8 paths; UTC normalization helpers needed regardless); Finding 13; current `audit/index.ts:78,131`
- **Outputs:** UTC-normalized timestamp helpers in `src/core/audit/`; ESLint custom rule
- **Model:** Haiku | **Effort:** low | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** none
- **Coverage exit:** 100% on UTC helpers | mutation INCLUDED (Q5-locked critical-file portion)
- **Parallelization:** sequential after §3.05 (same module)
- **Traceability:** gate-22 H-7, H-8; Finding 13

### §3.14 Stage 14 — M/L bundled fixes (M-1, M-4, M-5, M-6, M-7, M-8, L-2, L-3)

- **Purpose:** Bundle remaining MEDIUM + LOW gate-22 findings: M-4 (input validation on `cdcc audit --since`), M-5 (CLI helper extraction), M-6 (settings.json conflict detection), M-7 (audit log redaction default-off), M-8 (version skew docs — `package.json` 1.0.4 vs `plugin.json` 0.1.0), L-2/L-3 (minor CLI ergonomics)
- **Inputs:** Findings 10, 16; gate-22 ledger M/L rows
- **Outputs:** All M/L findings closed; M-8 version-alignment commit + clarifying doc; ESLint passes
- **Model:** Haiku | **Effort:** medium | **Depth:** Deep | **ASAE Threshold:** 3
- **Hook config summary:** none
- **Coverage exit:** 100% on touched modules | mutation per-file (only INCLUDED on critical-file overlaps)
- **Parallelization:** parallel-cluster-A (mostly disjoint; coordinate with §3.12 for M-5/M-6 overlap)
- **Traceability:** gate-22 M-1/M-4/M-5/M-6/M-7/M-8 PARTIAL→CLOSED/L-2/L-3; Findings 10, 16

### §3.15 Stage 15 — Design Polish (UXD voice, minimal — Stage NN+1 per SKILL.md)

- **Purpose:** Apply UXD voice to all CLI text output, error messages, and `cdcc explain` rendering; verify error message tone matches UXD prescriptions; no new functionality
- **Inputs:** All implementation stages complete; UXD doc; current CLI + hook stderr messages
- **Outputs:** Tone-aligned CLI text + error messages
- **Model:** Sonnet (justified per SKILL.md model tier table: visual + content/tone work — "Haiku is too generic for aesthetic-quality work per CCC empirical evidence"; CDCC has no UI surface, but UXD voice application is content judgment)
- **Effort:** low | **Depth:** Shallow | **ASAE Threshold:** 3 (with `/asae` `domain=design` per SKILL.md Stage NN+1 spec — applied to CLI text output as the closest analog to "UI surface")
- **Hook config summary:** none
- **Coverage exit:** N/A (text-only; existing tests cover behavior) | A11y exit: structural review of CLI text per UXD §5
- **Parallelization:** sequential after ALL implementation stages (per SKILL.md Stage NN+1 hard rule)
- **Traceability:** UXD voice prescriptions; SKILL.md Stage NN+1 protocol

### §3.QA Stage QA — Convergence Loop

- **Purpose:** Convergence-loop verification of §1 Excellent End State + §2 QA Spec. Re-audit all 29 gate-22 findings + N-1 → CLOSED. Run Stryker mutation testing on critical files → ≥80%. Run vitest with 100% coverage threshold. Run concurrent-two-process-write test. Round-trip recovery_events markup through LIVE /asae v06 commit-msg hook Tier 14 validator. Run property tests on envelope math per TQCD §5.2.
- **Inputs:** All implementation + Stage 15 Design Polish complete; §1 Excellent End State; Findings 15 (Stryker); Q5-lock; TQCD §5.2 Wave-3 IBM-fatal MAST stress-tests
- **Outputs:** `gate-NN-cdcc-v1.1.0-qa-convergence-2026-MM-DD.md` ASAE-gate file with strict-5-PASS attestation; Stryker baseline doc; 29-row + N-1 gate-22 closure attestation
- **Model:** Opus (per SKILL.md model tier — ASAE judgment + audit work)
- **Effort:** high | **Depth:** Deep | **ASAE Threshold:** 5 (convergence — SKILL.md Stage QA exit)
- **Hook config summary:** Stage QA gate triggers /asae commit-msg hook v06 Tier 14 validation cross-check
- **Coverage exit:** all metrics validated at thresholds (100% line/branch/func/stmt; ≥80% mutation on Q5 critical files; 0 fail tests; concurrent-write passes)
- **Parallelization:** sequential after §3.15
- **Traceability:** §1 Excellent End State; gate-22 ledger + N-1; TQCD §5.2 + §11 OQ-01; Q5-lock; Q-emergent-2 (Stage QA cross-validates emitted markup against /asae v06)

---

## Step 4 — Hook Configuration Summary (Full Content Authored In Stage 01b / Stage 07)

Per SKILL.md Step 4: name hook configurations to install in Stage 02 (full hook content authored in Stage 01b; installer logic in Stage 07).

| Hook | Event | Source File | Behavior Summary | Authored / Modified In |
|---|---|---|---|---|
| H1 | UserPromptSubmit | `src/hooks/h1-manifest-validation/` | Manifest validation; exit 2 on fail (was exit 1) | §3.08b |
| H2 | Stop | `src/hooks/h2-deviation-manifest/` | Deviation manifest schema check; exit 2 on fail (was exit 1) + Array.isArray + null literal guard (H-2 closure) | §3.08b |
| H3 | PreToolUse | `src/hooks/h3-sandbox-hygiene/` | Marker creation; exit 2 on fail (was exit 1) | §3.08b |
| H4 | PreToolUse | `src/hooks/h4-model-assignment/` | Model assignment; 5 fail-closed paths each exit 2 with PRD-AR-NV-01/04 stderr | §3.08a |
| H5 | Stop | `src/hooks/h5-convergence-gate/` | Convergence gate result; exit 2 on fail (was exit 1) | §3.08b |
| H6 | PreToolUse | `src/hooks/h6-step-reexec/` | Step re-execution guard + cost telemetry; exit 2 on fail (was exit 1); CLI install list verified post-refactor | §3.08b + §3.11 |
| H8 | PreToolUse | `src/hooks/h8-protected-files/` (NEW) | Protected-files glob match; exit 2 with rule+path+persona+resolution stderr on persona-not-allowed | §3.09 |
| H9 | PostToolUse(Stop) | `src/hooks/h9-recovery-verifier/` (NEW) | Detection-only verifier; on violation emit `recovery_events:` audit row per /asae v06 verbatim + exit 2; **does NOT do git revert; does NOT spawn Agent** | §3.10 |

**Single-SoT runtime read** from `plugin.json.hooks` array installed at §3.07 (Insight B + H-3 systemic closure). CLI hardcoded array at `cli/index.ts:53-59` deleted.

**SKILL.md Hook Installation Verification** (per "Hook Installation Verification" section): every D2R repo must ship with `.claude/settings.json` PreToolUse/PostToolUse/Stop/UserPromptSubmit, `.githooks/pre-commit` + `pre-push`, package.json `prepare` script installing git hooks path, CI verification job. CDCC v1.0.4 has these in skeletal form; Stage 02 audits + brings to spec; Stage 07 wires runtime read.

---

## Step 5 — Plan Skeleton For User Approval (Table Form)

Per SKILL.md Step 5: present skeleton in table form. Wait for explicit user approval (`✓` or redirect) before Stage 01b begins.

### 5.1 Stage Master Table

| Stage | Name | Model | Effort | Depth | ASAE Th. | Cluster / Sequence | Closes |
|---|---|---|---|---|---|---|---|
| 02 | Project Scaffold + Bundle Deps | Sonnet | low | Shallow | 3 | seq (root) | scaffold; AVD-AD-01 amend |
| 03 | Bundle Parser | Haiku | low | Deep | 3 | parallel-A | M-9 + Surprise #6 |
| 04 | Plan Generator + extractExcellenceSpec | Haiku | medium | Deep | 3 | parallel-A | C-1, M-2, M-10, H-4 |
| 05 | Audit Logger sqlite + JSONL→sqlite migration | Haiku | high | Deep | 3 | seq after 02 | C-2, H-5, M-1, L-1, L-4, L-7 |
| 06 | Plan-State Store + HMAC | Haiku | medium | Deep | 3 | parallel-A | H-6 |
| 07 | Hook Installer + plugin.json single SoT + AC-21 | Haiku + Opus(low) | high | Deep | 3 | seq after 05+06 | H-1, H-3, M-3, M-11; Q1-lock; Insight B systemic |
| 08a | H4 Fail-Closed (5 paths) | Haiku | medium | Deep | 3 | parallel-B after 06 | C-3, H-4 |
| 08b | Other-hook exit-code audit | Haiku | medium | Deep | 3 | parallel-B after 06 | H-2 PARTIAL→CLOSED + systemic exit-2 |
| 09 | Protected Files + H8 | Haiku | medium | Deep | 3 | parallel-A | A18/H8 (UNFLAGGED) |
| 10 | Recovery Verifier + H9 (detection-only) | Haiku | high | Deep | 3 | seq after 05 | A21 (UNFLAGGED) |
| 11 | H6 merged + CLI install list | Haiku | low | Deep | 3 | seq after 07 | N-1 (Insight B specific) |
| 12 | CLI explain/rollback/migrate/config | Haiku | medium | Deep | 3 | seq after 05+06+11 | L-5, L-6, Surprise #10, Q2 Plugin Config Store |
| 13 | Timezone fixes | Haiku | low | Deep | 3 | seq after 05 | H-7, H-8 |
| 14 | M/L bundled fixes | Haiku | medium | Deep | 3 | parallel-A | M-1/M-4/M-5/M-6/M-7/M-8/L-2/L-3 |
| 15 | Design Polish (UXD voice) | Sonnet | low | Shallow | 3 (`/asae` domain=design) | seq after ALL impl | UXD voice in CLI text |
| QA | Convergence Loop | Opus | high | Deep | 5 | seq after 15 | All gates verified |

### 5.2 Parallelization Map

```
[02 Scaffold]  (Sonnet, root)
   |
   +-- parallel-cluster-A (after 02): [03 Bundle Parser] [04 Plan Generator] [06 Plan-State+HMAC] [09 Protected Files+H8] [14 M/L bundled]
   |
   +-- [05 Audit Logger sqlite] (seq after 02; foundation for 06/10/12/13)
   |        |
   |        +-- [10 Recovery+H9] (seq after 05)
   |        +-- [13 Timezone fixes] (seq after 05; same module)
   |        +-- [12 CLI subcmds] (seq after 05+06+11)
   |
   +-- [07 Hook Installer + AC-21] (seq after 05+06)
   |        |
   |        +-- [11 H6 merged + CLI install list] (seq after 07; pre-cond for 12)
   |
   +-- parallel-cluster-B (after 06): [08a H4 fail-closed] [08b other hooks fail-closed]
              |
              v
   [15 Design Polish]  (Sonnet, seq after ALL implementation)
              |
              v
   [QA Convergence]  (Opus, seq after 15)
```

7 parallelizable stages (cluster A: 03, 04, 06, 09, 14 = 5; cluster B: 08a, 08b = 2). 9 sequential stages. Critical path: 02 → 05 → 10 → 15 → QA.

### 5.3 Methodology Compliance Summary

| SKILL.md Requirement | Stage 01a Compliance | Notes |
|---|---|---|
| Excellence as the floor | §1 backwards-plans from concrete exit criteria, not MVP | ✓ |
| ASAE governance every stage boundary | All 16 stages have ASAE Threshold assigned (3 default, 5 for QA) | ✓ |
| Accessibility hardwired | UXD voice + 6-layer accessibility chain; CDCC has no UI surface so layers 1-5 audit CLI text | ✓ (no-UI caveat documented) |
| Test coverage hardwired | 100% line/branch/func/stmt; mutation Q5-locked critical files ≥80% | ✓ |
| Model awareness per stage | Stage 02 = Sonnet (hard rule); 03+ default Haiku Deep; 07 Opus(low) for native; 15 Sonnet; QA Opus | ✓ |
| Plan-spec-depth parameter | All stages tagged Shallow/Medium/Deep with justification | ✓ (14 Deep, 2 Shallow with explicit justification) |
| Hook orchestration 3-layer | Layer 1 (.claude/settings.json) + Layer 2 (.githooks/) + Layer 3 (/asae) summarized in Step 4 | ✓ |
| Stage 02 = Project Scaffold (Sonnet) | §3.02 | ✓ |
| Stage 03+ default Haiku Deep | §3.03-§3.14 | ✓ |
| Stage NN+1 Design Polish | §3.15 (Sonnet) | ✓ |
| Stage QA convergence threshold 5 | §3.QA | ✓ |
| User approval gate | This §5 | ✓ awaiting `✓` |

### 5.4 Stage 01a Exit Criteria (Per SKILL.md)

ASAE gate audits:
- [x] All stages traceable to Stage 00 research findings + prerequisite TRD (per §3 traceability lines)
- [x] QA designed from Testing Taxonomy + prerequisite TQCD (§2 cross-check table)
- [x] Model + depth + ASAE threshold assigned per stage with justification (§5.1 master table)
- [x] Stage 02 is present and assigned to Sonnet (§3.02)
- [x] Stage 03+ exist and default to Haiku unless justified otherwise (§3.03-§3.14; §3.07 Opus + §3.15 Sonnet justified inline)
- [x] No stage missing skeleton-level metadata (every stage has Purpose / Inputs / Outputs / Model / Effort / Depth / ASAE Threshold / Hook config summary / Coverage exit / A11y exit / Parallelization / Traceability)

User approval gate awaits explicit decision. Per SKILL.md Step 5 + Exit:
- On `✓`: proceed to Stage 01b (Opus full-plan authorship per stage's declared depth)
- On redirect: remediate per user direction; re-run Stage 01a gate

---

**End of Stage 01a Skeleton.** Awaiting user approval gate per /dare-to-rise-code-plan SKILL.md Step 5.
