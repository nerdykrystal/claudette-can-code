---
document_type: Public Release Backlog
target_version: v1.1+ public release
created: 2026-04-24
author: Krystal Martinez (Martinez Methods)
authored_by: Claudette the Code Debugger (Opus 4.7, 1M context)
status: ACTIVE — consult during the first CDCC plugin overhaul and first public release cycle
---

# Public Release Backlog — CDCC Plugin

Deferred items that need resolution before or during CDCC's first public release. Captured during the v1.0 / v1.0.1 build series to avoid losing track when the public-release overhaul work begins.

This doc is not closed by editing. When an item is resolved in a v1.1+ release, the corresponding resolution note goes in the gate audit log for that release, and the item below gets a status update (e.g., "RESOLVED in v1.1 — see `deprecated/asae-logs/gate-XX-<name>.md`").

## Items

### 1. Windows PowerShell execution-policy friction on install

**Observed:** 2026-04-24, during Krystal's own fresh install attempt immediately after v1.0.1 BUILD COMPLETE. Default PowerShell execution policy on Windows (`Restricted`) blocks `npm.ps1` (and by extension `cdcc.ps1` after `npm link`) with `UnauthorizedAccess` / `PSSecurityException`. The user-visible error:

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded. The file ... is not digitally signed.
You cannot run this script on the current system.
```

Every `npm install` / `npm run build` / `npm link` / `cdcc --help` call fails until the policy is loosened.

**Current workaround (v1.0.1):** user runs, once per machine:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

One-time, persists across sessions, no admin prompt needed. Allows unsigned locally-installed scripts (like `npm.ps1`) while still requiring signed scripts for anything downloaded from the internet. Microsoft-recommended policy for dev machines.

Alternative workaround: call `.cmd` shims directly (`npm.cmd ...`, `cdcc.cmd ...`), bypassing PowerShell's script-signing check since `.cmd` files are not subject to it.

**Why this needs revisit at public release:**

- Every Windows user on default policy hits this on first install. Unacceptable friction for a public-facing tool.
- A documentation-only fix (install-notes callout in README) reduces but does not eliminate the problem — new users still encounter the cryptic SecurityException before they find the note.
- The `npm.ps1` shim itself is produced by npm, not by CDCC, so CDCC cannot sign it directly. CDCC can only influence the `cdcc.ps1` / `cdcc.cmd` shims generated during install, and even those are subject to the same execution-policy check.

**Options for v1.1+ evaluation:**

1. **Code-sign the `cdcc.ps1` + `cdcc.cmd` shims** produced by `npm link` / `npm install -g cdcc`. Requires a code-signing certificate (approximately $100–500/year from a CA such as DigiCert, Sectigo, or Certum; or free via the Microsoft Store publishing path if CDCC is distributed there). Does NOT solve the upstream `npm.ps1` issue — users still need either a loosened execution policy OR must invoke `cdcc.cmd` directly.

2. **Ship CDCC as a standalone native binary** via `pkg`, `nexe`, `bun build --compile`, or `deno compile`. Eliminates the npm-shim dependency entirely. Each platform gets its own signed executable. More release-engineering overhead per release but cleaner end-user experience and no PowerShell policy interaction.

3. **Document the friction** as a "Windows install requirements" section in `README.md` Installation. Cheapest option. Still hits users before they read the doc — friction reduced not eliminated.

4. **Distribute via Claude Code's plugin system** (if/when that system provides signed installation paths). Punts the shim problem to the Claude Code distribution layer. Requires verifying Claude Code actually solves this on Windows — check before committing.

5. **Publish to npm registry + document `npm install -g cdcc` as canonical install.** Same execution-policy issue would apply since npm's generated shims are still unsigned; this on its own does NOT solve the friction. Combine with option 1 or option 2.

**Recommended decision point:** at the v1.1+ overhaul planning stage, pick between option 1 (code-signing CDCC's own shims), option 2 (standalone binary), or option 4 (Claude Code plugin distribution). Option 3 is a fallback, not a primary answer. Option 5 alone is insufficient.

**Related:**

- CDCC `plugin/README.md` — Installation section currently documents npm-link workflow only; candidate for a Windows-caveat addendum even before v1.1, as a low-effort stopgap
- `_grand_repo/docs/Pre_Publication_IP_Scrub_Checklist_2026-04-22_v02_I.md` — separate public-release gate (IP-clean) that should be consulted alongside this backlog at first public release

### 2. Windows npm global-prefix not on PATH after install

**Observed:** 2026-04-24, immediately after the ExecutionPolicy issue in item #1 was resolved and `npm link` completed successfully. The `cdcc`, `cdcc.cmd`, and `cdcc.ps1` shims were correctly placed in `C:\Users\<user>\AppData\Roaming\npm\` — but that directory is not on the user's `PATH` in a fresh PowerShell session, so `cdcc --help` returns `CommandNotFoundException`.

This is a known and long-standing npm-on-Windows paper cut. Node's Windows installer sometimes fails to add the npm global prefix (`%APPDATA%\npm`) to user PATH depending on installer version, previous-install state, or user permissions. A clean reinstall of Node doesn't reliably fix it.

**Current workaround (v1.0.1):** user runs, once per machine, in PowerShell:

```powershell
[Environment]::SetEnvironmentVariable("PATH", "$env:APPDATA\npm;" + [Environment]::GetEnvironmentVariable("PATH", "User"), "User")
```

Then restarts PowerShell. Persists across reboots. No admin prompt needed.

Alternatives considered:
- `setx PATH "%APPDATA%\npm;%PATH%"` — simpler syntax but truncates at 1024 characters and merges SYSTEM + USER PATH incorrectly; unreliable.
- Per-session `$env:PATH = "$env:APPDATA\npm;$env:PATH"` — works but doesn't persist; user must repeat every new shell.
- Invoking by full path (`& "$env:APPDATA\npm\cdcc.cmd"`) — works without any PATH change but is unusable ergonomically for a CLI tool intended for daily use.

**Why this needs revisit at public release:**

- Compounds with item #1. A Windows user installing CDCC from source via `npm link` hits BOTH the ExecutionPolicy error AND the PATH-not-updated problem. The first is cryptic (`UnauthorizedAccess`); the second is user-friendly-looking but wrong (`cdcc is not recognized`) after the user believes install succeeded. Double friction.
- Documentation-only fix has the same weakness as item #1 — the error hits before the doc is read.
- A distribution model that does NOT rely on `npm link` / `npm install -g` side-steps this problem entirely.

**Options for v1.1+ evaluation:**

The options significantly overlap with item #1. Evaluating them together is correct; they share a root cause (npm-on-Windows shim distribution).

1. **Standalone native binary** (item #1 option 2) — single strongest fix for BOTH item #1 and item #2. `pkg` / `nexe` / `bun build --compile` / `deno compile` produces a signed binary placed in a known location; bypasses npm shims AND PowerShell execution policy entirely. Installer handles PATH registration.

2. **Windows installer (.msi or .exe via Inno Setup / WiX / Squirrel.Windows)** — explicit PATH manipulation during install, Start Menu shortcut, uninstall flow. Higher release-engineering cost; cleanest Windows-native experience.

3. **Claude Code plugin system distribution** (item #1 option 4) — only viable if Claude Code's plugin installer handles both shim signing AND PATH registration on Windows. Requires verification.

4. **Documentation-only with post-install diagnostics** — CDCC could ship a `cdcc-doctor` or equivalent diagnostic that detects missing PATH entry and prints the exact `[Environment]::SetEnvironmentVariable` command to run. Doesn't prevent the first failure but shortens recovery to a single copy-paste. Low-cost stopgap if the bigger options are deferred.

**Recommended decision point:** at the v1.1+ overhaul planning stage, evaluating items #1 and #2 jointly. A standalone binary (option 1) resolves both; a Windows installer (option 2) resolves both with a nicer install flow at higher engineering cost; the plugin-system path (option 3) resolves both IF Claude Code provides the guarantees; documentation + doctor (option 4) is the fallback for everything.

**Related:**

- Item #1 in this same doc — ExecutionPolicy friction, same distribution root cause
- CDCC `plugin/README.md` — Installation section currently documents neither friction point; candidate for a Windows-install subsection even before v1.1 as a low-effort stopgap

### 3. Cross-shell verification discipline missing from CDCC's own BUILD COMPLETE gates

**Observed:** 2026-04-24 v1.0.1 → v1.0.2 → v1.0.3 patch series. Krystal's PowerShell-side install retest after BUILD COMPLETE surfaced THREE separate Windows-PowerShell-specific failures that gate-7 / gate-9 / gate-12 verification all missed: ExecutionPolicy (item #1), npm prefix not on PATH (item #2), and TWO distinct code-level bugs requiring v1.0.2 (CLI IIFE — see `gate-13`) and v1.0.3 (HOME env var fallback — see `gate-14`) patches in rapid succession.

All four bugs share a root-cause class: gate verifications ran exclusively in Git Bash on Windows (where the Hardened Build Entrypoint Template's Step 7 commands execute via `bash` tool integrations), masking shell-specific portability bugs. Git Bash sets `HOME` automatically, resolves paths POSIX-style, and treats `/c/Users/...` differently from native Windows path resolution. PowerShell does none of those things. The verification environment did not include the user-install environment.

**Current workaround (v1.0.3):** none — Krystal must re-test in PowerShell manually each release cycle and patch-commit a hotfix when she encounters Windows-specific bugs. This worked for v1.0.2 + v1.0.3 but is unsustainable.

**Why this needs revisit at public release:**

- For a Claude Code plugin that targets a developer audience that includes Windows + PowerShell users, ANY pre-public-release BUILD COMPLETE that hasn't been verified in PowerShell is a hidden ticking-time-bomb release. v1.0.1's BUILD COMPLETE was emitted with two latent Windows-PowerShell crashes; only Krystal's same-day install caught them. A public user encountering the same surface on day one of a public release would have no recourse — `cdcc generate` exits 0, claims success, writes nothing to disk.
- The fix surface is a process discipline addition, not a code addition: enforce cross-shell verification in CDCC's gate-N final-verification block.

**Options for v1.1+ evaluation:**

1. **Add PowerShell verification to CDCC's gate-final block.** Each future BUILD COMPLETE gate runs the harness-level smoke test in BOTH Git Bash AND PowerShell (via `pwsh` or `powershell.exe` invocation from the build session). Fails the gate if either shell errors. Estimated cost: ~5 minutes added to each gate; trivial relative to the bug-discovery timeline post-release.

2. **Add cmd.exe verification.** Some Windows users prefer or default to cmd.exe; behavior again differs (e.g., backtick handling, PATH semantics). A full Windows-three-shell matrix (Git Bash + PowerShell + cmd.exe) catches more failures than two.

3. **Add Mac + Linux verification as well.** CDCC is intended to be cross-platform; right now verification is Windows-only (because the build runs on Krystal's Windows machine). Linux/Mac users may hit different bugs — most likely none in this codebase, but unverified is unverified.

4. **CI-based cross-platform/cross-shell matrix** — eventually CDCC's CI should run the test suite + harness smoke test on Linux + Mac + Windows × bash + PowerShell + cmd, on every commit. Higher up-front cost; pays for itself the first time a public user would have hit a bug it caught.

**Recommended decision point:** option 1 (PowerShell-in-gate-final) is the minimum bar for any v1.1+ release, and should be added to the Hardened Build Entrypoint Template (in `_experiments/protocols/`) as a parallel concern — it benefits all Martinez Methods app builds, not just CDCC. Option 4 (CI matrix) is the eventual public-release standard; estimable as a v1.2+ deliverable.

**Related:**

- `deprecated/asae-logs/gate-13-v1.0.2-windows-cli-iife-fix.md` — first instance (CLI IIFE)
- `deprecated/asae-logs/gate-14-v1.0.3-windows-homedir-fix.md` — second instance (HOME env var)
- Items #1 and #2 in this same doc — shell-installer-environment friction (ExecutionPolicy + npm PATH)
- `_experiments/protocols/Hardened_Build_Entrypoint_Template_2026-04-22_v02_I.md` — the template that governs Step 7 final-verification across all Martinez Methods app builds; candidate v03_I bump should fold this in alongside F9 + F10 + F11 forbidden-actions language

### 4. cdcc generate default install target — global vs project-local

**Observed:** 2026-04-24 v1.0.3 review of homedir-fix scope. The `cdcc generate` command currently writes hook entries to the user's GLOBAL `~/.claude/settings.json` (when no `CLAUDE_ROOT` override is set). This means H1–H5 hooks fire for ALL of the user's Claude Code work on the machine, not just the project where `cdcc generate` was run.

**Current behavior:** global by default; CLAUDE_ROOT overrides for sandboxing.

**Design question for v1.1+:** is global-by-default the correct semantics, or should CDCC default to project-local `./.claude/settings.json` (write hooks alongside the `plan.json` it produces in cwd)?

**Trade-offs:**

- **Global default (current):** powerful — one `cdcc generate` covers all subsequent Claude Code work. Drawback: side-effects across unrelated projects; users with multiple Martinez Methods projects can't have per-project plans without per-invocation CLAUDE_ROOT manipulation.
- **Project-local default:** scoped — hooks only fire in the project where they were generated. Drawback: requires re-running `cdcc generate` per project; users new to CDCC may not realize hooks are only project-scoped and wonder why their other Claude Code work isn't gated.
- **Both, with explicit flag:** `cdcc generate <planning-dir>` defaults to one, `cdcc generate --global <planning-dir>` or `cdcc generate --project <planning-dir>` for the other. Most flexible; requires UX decision on which is default.

**Recommended decision point:** at v1.1+ overhaul planning, decide based on intended primary user pattern. If CDCC is for "discipline this specific project's Claude Code work" → project-local default. If CDCC is for "discipline ALL my Claude Code work" → global default. Currently global by accident-of-implementation, not by deliberate choice.

**Related:**

- `gate-14-v1.0.3-windows-homedir-fix.md` Open Design Question section — first capture of this concern
- `plugin/README.md` Installation section — currently does not clearly state this default; either decision should be reflected in user docs

### 5. Support 5-doc D2R prerequisite bundle (PRD + TRD + AVD + TQCD + UXD) — required for v1.1+

**Observed:** 2026-04-25, after the CCC v1.0 → v1.0.1 schema-fix cycle. Krystal flagged that the implementation passed all functional acceptance tests + 100/100/100/100 coverage but the UI was "absolutely not production or deployment ready or even MVP ready" — bland-React-component-library-grade output despite the methodology shipping. Diagnosis: the 4-doc D2R prerequisite bundle (PRD + TRD + AVD + TQCD) is missing the visual + interaction reality anchor. Implementation falls back to generic-component-library defaults regardless of what the 4 docs specify because no doc constrains visual character.

This is the F13-equivalent failure at the design layer (F13 = test fixtures synthesized from schema → tests pass against fictional inputs; design-layer analog = UI built from prose specs without reference design assets → app passes acceptance tests but fails standard-of-excellence review).

**Resolution authored 2026-04-25 in the methodology layer:**

- New 5th input doc: **UXD** (User Experience Document) — covers visual design system + interaction patterns + accessibility-as-delight + reference design assets + polish criteria
- New skill: `/write-uxd`
- New ASAE domain: `design`
- New D2R stage: **Stage NN+1 Design Polish** between final implementation stage and Stage QA, runs at `/asae` `domain=design` threshold 3 strict
- Updated `/ideate-to-d2r-ready` Phase 1 with 3 additional UXD-readiness questions (reference apps + brand voice + anti-pattern targets)
- Updated `/ideate-to-d2r-ready` Phase 3 cross-doc audit with 3 new UXD-related checks + the three-way TRD↔UXD↔TQCD standards alignment check (the 6-layer accessibility hardwiring chain)
- Documented 6-layer accessibility model in `/dare-to-rise-code-plan` skill

See: `repos/.claude/skills/dare-to-rise-code-plan/references/UXD_Template_2026-04-25_v01_I.md` (template); `repos/.claude/skills/write-uxd/SKILL.md` (authorship skill); updated `repos/.claude/skills/asae/SKILL.md` (adds `domain: design` checklist); updated `repos/.claude/skills/dare-to-rise-code-plan/SKILL.md` (adds Stage NN+1 Design Polish + 6-layer accessibility hardwiring); updated `repos/.claude/skills/ideate-to-d2r-ready/SKILL.md` (adds Phase 1 Q6-Q8 + Phase 2 Step 2.5 + Phase 3 three-way standards alignment).

**Why this needs revisit at v1.1+:** the CDCC plugin currently consumes a 4-doc D2R bundle. The plan-generation pipeline + the H1-H5 hooks operate on the 4-doc inputs. With the 5th doc added at the methodology layer, CDCC v1.0.x is silently behind the methodology — a project authored with the new 5-doc methodology hands CDCC something CDCC's plan generator doesn't know to read. The UXD will be ignored at plan generation time, defeating the purpose.

**Options for v1.1+ evaluation:**

1. **Extend Bundle Consumer to read UXD as 5th input** — primary fix. The Bundle Consumer (Stage 03 library code) currently reads PRD + TRD + AVD + TQCD; v1.1+ extends it to also read UXD. Plan generator passes UXD-derived constraints to subsequent stages.

2. **Add Stage NN+1 Design Polish to the plan template** — when CDCC generates a plan from a 5-doc bundle, the plan must include a Stage NN+1 Design Polish stage between final implementation and Stage QA. Sonnet-routed by default per the methodology spec.

3. **Update H1 Input Manifest hook** — H1 currently validates ambient filesystem against `inputManifest` declared in the plan. With UXD in the bundle, the input manifest must include UXD's reference design assets directory, OR H1 must be relaxed to permit asset directories under a documented path (e.g., `inputs/uxd-assets/`).

4. **Add `/asae` `domain=design` recognition** — the H5 Gate Result hook validates ConvergenceGateResult payloads. v1.1+ must recognize `domain: design` payloads as valid (not just `code` / `document` / etc.). The Convergence Gate Engine's domain checklist enumeration needs the design checklist added.

5. **Update `cdcc generate` CLI** — currently expects a 4-doc bundle directory; v1.1+ should expect a 5-doc bundle directory with optional reference design assets subdirectory. CLI help text + error messages updated to reflect.

**Recommended decision point:** v1.1.0 release should bundle items 1-4 as a coherent "5-doc bundle support" feature. Item 5 (CLI updates) follows naturally. Stage 05 CDCC residual list (PostToolUse hooks blocking incomplete-stub tokens, etc.) can be addressed in v1.0.x patches; the 5-doc support is a v1.1.0 minor-version-bump scope feature.

**Related:**

- `repos/.claude/skills/dare-to-rise-code-plan/references/UXD_Template_2026-04-25_v01_I.md` — UXD template
- `repos/.claude/skills/write-uxd/SKILL.md` — UXD authorship skill
- `repos/.claude/skills/dare-to-rise-code-plan/SKILL.md` — D2R skill with 5-doc prerequisite + Stage NN+1 Design Polish + 6-layer accessibility hardwiring
- `repos/.claude/skills/asae/SKILL.md` — `/asae` skill with `domain: design` checklist
- `repos/.claude/skills/ideate-to-d2r-ready/SKILL.md` — orchestrator with UXD-readiness Phase 1 questions + Phase 3 three-way standards alignment
- F13 corpus entry in `_experiments` — the design-layer reality-anchor argument that motivates UXD; `_experiments/experiments/d2r_methodology_factorial/analysis/exploratory_findings_2026-04-22_prompt-variance_v03_I.md` (or whatever version is current when v1.1.0 plans)

## Maintenance

New public-release concerns get appended as items below. Each item follows the shape: observed + current workaround + why this needs revisit + options + recommended decision point + related.
