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

## Maintenance

New public-release concerns get appended as items below. Each item follows the shape: observed + current workaround + why this needs revisit + options + recommended decision point + related.
