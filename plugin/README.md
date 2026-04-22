# Claudette Can Code (Pro) — Plugin Form MVP (CDCC)

Non-bypassable D2R plan enforcement for Claude Code — silent substitution, skill-skipping, and gate-skipping made structurally impossible.

---

## What It Is

CDCC is a Claude Code plugin that reads an approved D2R 4-doc bundle (PRD, TRD, AVD, TQCD) and enforces the resulting plan at the structural level via five hooks (H1–H5). Enforcement is non-bypassable: all violations exit non-zero. There is no warn-only mode.

The plugin eliminates four categories of silent failure:

- Silent model substitution (a cheaper model running a stage assigned to a stronger one)
- Silent skill-skipping (a model writing directly to main session instead of invoking the assigned sub-agent skill)
- Gate-skipping (a stage completing without a converged ASAE Convergence Gate result)
- Ambient contamination (files or network resources not declared in the plan's input manifest)

---

## How It Works

CDCC installs five hooks into your `.claude/settings.json` at `cdcc generate` time. Each hook fires on a specific Claude Code lifecycle event and enforces a specific aspect of the plan.

**H1 — Input Manifest (UserPromptSubmit)**
Before any tool runs, H1 reads the plan's declared `inputManifest` globs and compares them to the ambient filesystem state. Any undeclared input path causes a structured diff to be emitted and the hook exits non-zero, halting execution.

**H2 — Deviation Manifest (Stop on BUILD_COMPLETE sentinel)**
When a stage signals completion, H2 scans the workspace for substitution patterns against the plan. If a substitution is detected without a corresponding signed `DeviationManifest` entry, H2 exits non-zero and blocks the Stop event.

**H3 — Sandbox Hygiene (PreToolUse)**
On session activation, H3 audits the worktree against the plan's allowlist. Any disallowed file or network resource triggers a halt or removal per plan config. Zero ambient contamination is enforced structurally.

**H4 — Model Assignment (PreToolUse on Write/Edit)**
Before any Write or Edit tool call, H4 reads the current stage from the plan state file and compares the executing model identifier to the `assignedModel` declared for that stage. A mismatch causes H4 to emit a structured redirect directive (Sub-Agent Redirector) and exit non-zero.

**H5 — Gate Result (Stop per-stage)**
At the end of each stage, H5 requires a `ConvergenceGateResult` payload with `converged: true`. If the payload is absent or `converged: false`, H5 invokes the Convergence Gate Engine directly, emits a block with a remediation template, and exits non-zero.

---

## Installation

1. Clone this repository: `git clone <repo-url>`
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Register the plugin with Claude Code by adding the plugin directory to Claude Code's plugin path (see Claude Code plugin documentation for your version).
5. In your project root, run: `cdcc generate <path-to-planning-dir>`

The `generate` command reads the 4-doc bundle from `<planning-dir>`, writes a `plan.json` artifact, and installs H1–H5 hook entries into `.claude/settings.json`.

---

## Usage

```
cdcc generate <planning-dir>
```
Consumes the 4-doc D2R bundle in `<planning-dir>`, generates a `plan.json` artifact, and installs all five hooks.

```
cdcc audit [--since=<ISO8601>]
```
Queries the append-only audit log at `.claude/cdcc-audit/`. Optionally filter by timestamp.

```
cdcc dry-run <planning-dir>
```
Validates the 4-doc bundle and generates a preview of the plan without writing any artifacts or installing hooks.

---

## Hook Semantics

**H1 — Input Manifest**: Fires on `UserPromptSubmit`. Reads `inputManifest.expectedPaths` from the plan and validates that only declared globs are present. Blocks on any undeclared path. Remediation: update your planning bundle's input manifest and re-run `cdcc generate`.

**H2 — Deviation Manifest**: Fires on `Stop` when the `BUILD_COMPLETE` sentinel is detected. Requires a signed `DeviationManifest` for every detected substitution. Blocks on unsigned substitution. Remediation: produce a `deviation-manifest.json` documenting the substitution before completing the stage.

**H3 — Sandbox Hygiene**: Fires on `PreToolUse`. Enforces the plan's filesystem and network allowlist. Blocks or removes disallowed resources. Remediation: declare resources in the plan's allowlist before referencing them.

**H4 — Model Assignment**: Fires on `PreToolUse` for `Write`/`Edit` tool calls. Compares the executing model to the stage's `assignedModel`. Emits a Sub-Agent Redirector directive on mismatch. Remediation: invoke the correct model tier via the Agent tool as directed.

**H5 — Gate Result**: Fires on `Stop` at end of each stage. Requires `ConvergenceGateResult.converged === true`. If absent, invokes the Convergence Gate Engine. Emits a remediation template listing open findings. Remediation: address all CRITICAL and HIGH findings and re-run the stage's gate check.

---

## Architecture

See [docs/architecture.md](docs/architecture.md) for a prose description of the 16-component system architecture, including data flow between the Bundle Consumer, Plan Generator, Backwards-Planning Engine, Convergence Gate Engine, hook handlers, and Audit Logger.

---

## License

MIT License. Copyright 2026 Krystal Martinez / Martinez Methods. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for attribution requirements.
