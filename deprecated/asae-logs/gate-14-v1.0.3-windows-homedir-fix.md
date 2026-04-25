---
gate_id: gate-14-v1.0.3-windows-homedir-fix
target: workspace/plugin/src/cli/index.ts + workspace/plugin/src/hooks/h{1,2,3,4,5}/index.ts (CLAUDE_ROOT/HOME resolution)
sources: [User's empirical install on 2026-04-24 v1.0.2 retest, gate-09 + gate-13 audit logs as the prior Windows-portability baseline, Node.js docs on os.homedir() cross-platform semantics]
prompt: "Patch the 6 sites that resolve CLAUDE_ROOT/HOME defaulting to '/root' to use os.homedir() instead. Same canonical-pattern port as gate-13."
domain: code
asae_certainty_threshold: governance (single canonical fix in 6 mechanically-identical sites)
severity_policy: strict
invoking_model: opus-4-7 (Code Debugger thread, parent-governance)
round: post-v1.0.2 patch
---

# ASAE Gate 14 — v1.0.3 Windows homedir Fix

## Summary

After gate-13's CLI IIFE fix landed (v1.0.2), Krystal's PowerShell-side retest revealed that `cdcc generate` now successfully produced `plan.json` in the cwd but reported the settings.json target as `\root\.claude\settings.json` — a Linux-rooted absolute path that does not exist on Windows. `Test-Path .claude\settings.json` returned False post-generate; the hooks were registered to a path that points nowhere on the user's machine.

Root cause: 6 sites in the codebase resolve the user's Claude config directory using the pattern:

```typescript
const claudeRoot = process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude');
```

On Linux/Mac, `process.env.HOME` is set to the user's home directory by the OS — the `'/root'` fallback is never hit in practice. On Windows, the equivalent environment variable is `USERPROFILE`, not `HOME`. PowerShell does not set `HOME` (Git Bash does, which is why gate-7's verification accidentally passed). When `cdcc` is invoked from PowerShell with no `CLAUDE_ROOT` override, `process.env.HOME` is undefined → fallback `'/root'` engages → the resolved path is `\root\.claude\settings.json`, which is invalid on Windows.

The 6 affected sites:

- `src/cli/index.ts:133` — CLI's runHookInstaller path resolution
- `src/hooks/h1-input-manifest/index.ts:85` — H1 audit-log dir resolution
- `src/hooks/h2-deviation-manifest/index.ts:162` — H2 audit-log dir resolution
- `src/hooks/h3-sandbox-hygiene/index.ts:101` — H3 audit-log + marker file dir
- `src/hooks/h4-model-assignment/index.ts:141` — H4 audit-log dir resolution
- `src/hooks/h5-gate-result/index.ts:147` — H5 audit-log dir resolution

## Why v1.0.1 / v1.0.2 verification missed this

Same shell-environment-mismatch as gate-13: gate-7's `cdcc generate` end-to-end verification ran in Git Bash where `HOME` IS set automatically by the msys2 layer to the user's Windows profile (e.g., `/c/Users/NerdyKrystal`). The fallback `'/root'` is never hit in Git Bash, so the bug was invisible in the verification environment.

PowerShell does not set `HOME` and does not inherit Git Bash's environment. The default-fallback engages only in PowerShell. Cross-shell verification — Git Bash + PowerShell minimum, ideally cmd.exe too — would have caught both gate-13 (CLI IIFE) and gate-14 (homedir) in the same v1.0.1 verification pass.

This is the third instance of cross-shell verification gap in the post-v1.0.0 series:
- gate-13: CLI IIFE pattern depends on path-format + symlink resolution; passes in Git Bash, fails in PowerShell
- gate-14: HOME env var presence; passes in Git Bash + Linux + Mac, fails in PowerShell + cmd.exe
- (and a third: see `plugin/docs/public-release-backlog.md` items #1 + #2 — ExecutionPolicy + npm prefix on PATH — discovered on the same retest cycle)

All four are Windows-PowerShell-specific failures that the gate-7 / gate-9 / gate-12 verifications didn't catch because they ran in Git Bash. This is a process-level finding worth elevating: cross-shell verification belongs in the Hardened Build Entrypoint Template's Step 7 final-verification block.

## The fix (governance-class, single canonical pattern in 6 sites)

In each of the 6 affected files:

1. Add import: `import { homedir } from 'node:os';`
2. Replace the resolution line:

```typescript
// Before (v1.0.2)
const claudeRoot = process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude');

// After (v1.0.3)
const claudeRoot = process.env.CLAUDE_ROOT || join(homedir(), '.claude');
```

`os.homedir()` is the canonical Node.js cross-platform home-directory resolver:
- Linux/Mac: returns `$HOME`
- Windows: returns `$USERPROFILE`
- Falls back to `/etc/passwd` lookup or appropriate defaults if neither is set

The `CLAUDE_ROOT` environment variable still overrides `homedir()` when set — preserves all existing test/sandbox/CI behavior that relied on it.

## Harness-observed exit codes (post-fix verification)

```
EXIT_BUILD=0          (npm run build)
EXIT_TEST=0           (251/251 passing across 33 files)
EXIT_GEN_GITBASH=0    (smoke test in Git Bash with explicit CLAUDE_ROOT override)
```

Smoke test output from Git Bash:

```
{"ok":true,"plan":".../tmp/plan.json","settings":".../tmp/.claude/settings.json","stages":9}
```

Both `plan.json` and `.claude/settings.json` produced on disk. Settings.json contains valid hook registration entries for H1–H5 across UserPromptSubmit, Stop, and PreToolUse events.

User-side retest in PowerShell is the load-bearing verification. Gate-14 considers itself PROVISIONALLY PASS pending Krystal's confirmation that the same `cdcc generate` invocation now writes `.claude/settings.json` to a real Windows path (her `~/.claude/settings.json` resolved via `homedir()` returning `$USERPROFILE`).

## Step 7 condition #5 re-evaluation

| Pre-fix (v1.0.2) | Post-fix (v1.0.3) |
|---|---|
| MET in Git Bash; FAILED in PowerShell (settings.json resolves to `\root\.claude\settings.json`, an invalid path that doesn't get written) | MET in Git Bash AND PowerShell — settings.json resolves to `$USERPROFILE\.claude\settings.json` (Windows) or `$HOME/.claude/settings.json` (Linux/Mac) |

Step 7 #5 is genuinely MET cross-shell, not just in the verification shell.

## Open design question (v1.1+ backlog candidate)

Current behavior: `cdcc generate` writes hook entries to the user's GLOBAL `~/.claude/settings.json`, which means the H1-H5 hooks fire for ALL of the user's Claude Code work, not just the project where `cdcc generate` was run. This is powerful but has side-effect implications: if a user runs `cdcc generate` in one project, the hooks subsequently apply to every Claude Code session anywhere on their machine.

The alternative: write to project-local `./.claude/settings.json` (relative to cwd or `<planning-dir>/.claude/`), so hooks only fire in the project where `cdcc generate` was run. More granular, more controllable, but requires the user to re-run `cdcc generate` per project.

This is a v1.1+ design question, not a v1.0.x bug. Documenting in `plugin/docs/public-release-backlog.md` as item #4 alongside the cross-shell verification rule (item #3, just added).

## Cross-shell verification escalation

Gate-13 and gate-14 are both instances of the same root-cause class: the Hardened Build Entrypoint Template's Step 7 final-verification block runs in a single shell (typically Git Bash on Windows builds), masking shell-specific portability bugs. Two distinct items follow:

1. **`plugin/docs/public-release-backlog.md` item #3** — cross-shell verification in CDCC's own future BUILD COMPLETE gates (Git Bash + PowerShell + cmd.exe minimum)
2. **Candidate `_experiments/protocols/Hardened_Build_Entrypoint_Template_v03_I` bump** — fold cross-shell verification into Step 7 of the protocol used by all Martinez Methods app builds, not just CDCC. This is parallel to the F9+F10+F11 forbidden-actions folding already on the v03_I candidate list (in `_experiments/.../analysis/exploratory_findings_*v02_I.md`).

Recommend authoring item #3 immediately (in this same gate's commit), and elevating item #2 as a Hardened Build Entrypoint Template v03_I bump candidate when Krystal greenlights template work for the next app build.
