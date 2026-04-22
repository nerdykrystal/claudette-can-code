---
name: CDCC Plugin MVP — Stage 00 Five-Track Research Findings
project: Claudette Can Code (Pro) — Plugin Form MVP
stage: 00
authoring_model: opus-4-7
date: 2026-04-22
version: v01_I
upstream: CDCC_PRD/TRD/AVD/TQCD 2026-04-22 v01_I
---

# Stage 00 Research Findings

## Track 1 — Tech Stack (Best-Fit for Claude Code Plugin)

**Decision: Node.js + TypeScript 5.5**, strict mode, ESM modules, Node ≥ 20.11 LTS.

Rationale:

- Claude Code's plugin runtime is Node-based; hooks are shell/JS commands. TypeScript gives type-correctness (TQCD Section 3.3, 3.6) without runtime overhead.
- Hook scripts run as short-lived processes per harness invocation — Node cold start well within the 100ms hook budget (TQCD 4.1) on modern hardware.
- Ecosystem for JSON Schema validation (`ajv`), structured logging, fs-atomic writes, and testing (Vitest) is mature.

Rejected alternatives:

| Option | Reject Reason |
|---|---|
| Python | Slower cold start; hooks miss the p99 ≤ 100ms budget on Windows |
| Rust | Dev velocity unacceptable for solo-operator MVP timeline (PRD 6.1) |
| Bash-only | Cannot meet structured-payload invariant (TRD SR-006); `jq` gymnastics brittle |

**Testing framework:** Vitest 1.6 (line + branch coverage via `@vitest/coverage-v8`; mutation testing via StrykerJS 8 against correctness-critical modules per TQCD 4.2). **Fuzzing:** `fast-check` for property-based invariants (TQCD Section 2.1 Property-Based / Fuzz Tests).

## Track 2 — Applicable Standards

Operationalized from TRD 3.3 + TQCD 3.1:

| Standard | Applicability | Exit Criterion |
|---|---|---|
| OWASP ASVS Level 1 | Local-app subset (V5.1 input validation; V10.3 dep integrity; V14.2 vuln deps) | Enforced in CI per TQCD 8.2 |
| CERT Secure Coding | JS/TS-relevant rules (no `eval`, no `Function()` on user content per TRD 6.2) | Static analysis in pre-commit |
| Martinez Methods Cognitive-Accessibility | All user-facing docs + block messages | Manual review + markdown lint |
| WCAG 2.1 AA | NA at MVP — no UI | Deferred to v0.2+ tri-platform |
| GDPR / CCPA | NA at MVP — local-only, zero collection | Structural compliance via zero-telemetry |

## Track 3 — Applicable Benchmarks

| Benchmark | Target (from TQCD 4.x) | Status |
|---|---|---|
| Plan generation latency | p50 ≤ 2s / p95 ≤ 5s / p99 ≤ 10s | Measurable via Vitest bench + reference bundle |
| Hook firing latency | p50 ≤ 20ms / p95 ≤ 50ms / p99 ≤ 100ms | Measurable via per-hook timing |
| Audit log write | p99 ≤ 10ms | Measurable |
| Cyclomatic complexity | median ≤ 10, p95 ≤ 15 | `eslint-plugin-complexity` |
| Line + branch coverage | 100% testable surface | Vitest coverage thresholds in CI |
| Mutation score | ≥ 80% on correctness-critical | StrykerJS |

## Track 4 — Language-Depth-of-Spec Feasibility

Opus can produce Deep-level specs for Node/TypeScript/Vitest/ajv/fast-check stack. Node plugin API surface is narrow and well-documented. Claude Code hook API contract is declared in `.claude/settings.json` — specifiable at Deep depth for all five hooks (H1–H5).

Per-stage depth:

- Stage 02 Scaffold — Medium (Sonnet-executed; package.json, tsconfig, vitest.config specified at API-level)
- Stage 03+ feature implementation — Deep (Haiku-executed; exact types, imports, test invariants)

No stage flagged infeasible at target depth.

## Track 5 — Skill / Plugin Ecosystem Fit

Relevant pinned skills in bundle:

- `/asae` — invoked at every stage boundary (threshold 2 at doc gates, 3 at code gates, per build prompt Step 5)
- `/dare-to-rise-code-plan` — authoring meta-skill (this document's framework)
- `/file-versioning` — for CDCC-prefixed filename convention on emitted plan artifacts (TRD beneficial skill)

Conflicts: none. CDCC plugin does NOT depend on any of these at runtime per FR-012/013/014 (self-containment). They are build-time aids only.

Gap: none blocking MVP. Cody-dogfood (G5) is a human test that cannot be run in-session — declared a BUILD HALTED reason category upfront.

## Stage 00 Exit Gate

ASAE threshold 2 (research rigor) — per orchestrator Stage 00 protocol. All 5 tracks complete. Claims traced to PRD/TRD/AVD/TQCD sections. Depth feasibility honest. Ecosystem inventory complete.
