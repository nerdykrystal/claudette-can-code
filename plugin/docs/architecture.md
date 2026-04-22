# CDCC Architecture — Component Overview

This document describes the 16-component architecture of the Claudette Can Code (Pro) Plugin Form MVP. For the authoritative component diagram, see the AVD (Section 3) in the `inputs/` planning bundle.

---

## Components

### 1. CLI Entry (`src/cli/index.ts`)
The thin entry point. Parses `generate`, `audit`, and `dry-run` subcommands and delegates to core pipeline components. Contains no business logic.

### 2. Bundle Consumer (`src/core/bundle/`)
Reads the four D2R planning documents (PRD, TRD, AVD, TQCD) from a specified planning directory. Parses YAML frontmatter, asserts approval status, and returns a typed `Bundle` or a tagged error. Zero thrown exceptions on expected error paths (Result-type pattern, TRD 6.2).

### 3. Your Setup Catalog (`src/core/catalog/`)
Reads `.claude/settings.json`, lists `.claude/plugins/`, and enumerates declared MCP server entries. Returns a `YourSetupCatalog` used by the Plan Generator and Skill-Gap Checker to understand the user's current Claude Code environment.

### 4. Plan Generator (`src/core/plan-generator/`)
Combines the Bundle and YourSetupCatalog as inputs. Invokes the Backwards-Planning Engine to derive an ordered stage sequence from the declared excellence state. Produces a `Plan` entity conforming to `schemas/plan.schema.json`.

### 5. Backwards-Planning Engine (`src/core/backwards-planning/`)
Pure function: given an excellence specification and constraints, returns an ordered list of stages. Internal to the Plan Generator; mutation-tested independently. Implements the Martinez Methods backwards-planning-from-excellence methodology.

### 6. Skill-Gap Checker (`src/core/skill-gap/`)
Compares the Plan's declared `skillInvocations` against the YourSetupCatalog. Returns a Result indicating which required skills are absent from the user's environment (FR-018).

### 7. Plan Artifact Writer (`src/core/plan-writer/`)
Serializes the Plan to JSON. Validates against `schemas/plan.schema.json` before writing. Uses fsync to guarantee durability. Atomic write via temp-file + rename.

### 8. Hook Installer (`src/core/hook-installer/`)
Writes H1–H5 hook entries into `.claude/settings.json` atomically (temp-file + rename). Preserves all unrelated keys. Rolls back on partial failure.

### 9. Audit Logger (`src/core/audit/`)
Append-only JSON-lines log. fsync on every write. Default path `.claude/cdcc-audit/YYYY-MM-DD.jsonl`. Every entry matches `schemas/audit-entry.schema.json`. Local-only; zero network calls.

### 10. Convergence Gate Engine (`src/core/gate/`)
Internal Martinez Methods ASAE gate. Inputs: scope object with `target`, `sources`, `prompt`, `domain`, `threshold`, `severityPolicy`. Outputs: `ConvergenceGateResult` with `converged`, `counter`, and `findings` array. Mutation-tested. Referenced in the system as "Convergence Gate Engine" — not to be described by generic terminology.

### 11. Sub-Agent Redirector (`src/core/sub-agent-redirector/`)
When H4 blocks a Write/Edit tool call due to model mismatch, the Sub-Agent Redirector emits a structured JSON redirect directive to stdout. The Claude Code harness consumes this directive to invoke the Agent tool with `model=<plan_assigned_model>` and appropriate sub-agent context (AD-009).

### 12. H1 — Input Manifest Handler (`src/hooks/h1-input-manifest/`)
Fires on `UserPromptSubmit`. Enforces `inputManifest.expectedPaths`. Blocks and exits non-zero on any undeclared path.

### 13. H2 — Deviation Manifest Handler (`src/hooks/h2-deviation-manifest/`)
Fires on `Stop` when `BUILD_COMPLETE` sentinel is detected. Requires a signed `DeviationManifest` for detected substitutions. Blocks and exits non-zero on unsigned substitution.

### 14. H3 — Sandbox Hygiene Handler (`src/hooks/h3-sandbox-hygiene/`)
Fires on `PreToolUse`. Enforces the plan's filesystem and network allowlist. Halts or removes disallowed resources per plan configuration.

### 15. H4 — Model Assignment Handler (`src/hooks/h4-model-assignment/`)
Fires on `PreToolUse` for `Write`/`Edit` tool calls. Reads current stage from plan state, compares executing model to `assignedModel`, emits Sub-Agent Redirector directive and exits non-zero on mismatch.

### 16. H5 — Gate Result Handler (`src/hooks/h5-gate-result/`)
Fires on `Stop` at end of each stage. Requires `ConvergenceGateResult.converged === true`. If payload absent or not converged, invokes the Convergence Gate Engine directly, emits block with remediation template, exits non-zero.

---

## Data Flow Summary

```
cdcc generate <planning-dir>
  -> Bundle Consumer -> Your Setup Catalog
  -> Plan Generator (+ Backwards-Planning Engine + Skill-Gap Checker)
  -> Plan Artifact Writer (plan.json, schema-validated, fsync'd)
  -> Hook Installer (writes H1-H5 to .claude/settings.json)

Runtime (Claude Code lifecycle):
  UserPromptSubmit -> H1 (input manifest check) -> Audit Logger
  PreToolUse       -> H3 (sandbox hygiene)       -> Audit Logger
  PreToolUse       -> H4 (model assignment)       -> Sub-Agent Redirector -> Audit Logger
  Stop             -> H5 (gate result)            -> Convergence Gate Engine -> Audit Logger
  Stop             -> H2 (deviation manifest)     -> Audit Logger
```

All hooks write to the Audit Logger on every decision (allow, block, or halt). Zero network calls at runtime. All enforcement exits non-zero on violation.
