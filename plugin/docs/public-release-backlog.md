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

## Maintenance

New public-release concerns get appended as items below. Each item follows the shape: observed + current workaround + why this needs revisit + options + recommended decision point + related.
