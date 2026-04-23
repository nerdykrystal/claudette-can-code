---
gate_id: gate-06-post-F9-cli-remediation
target: [workspace/plugin/src/cli/index.ts, workspace/plugin/tests/e2e/cli.e2e.test.ts, workspace/plugin/examples/hello-world-planning/, workspace/plugin/vitest.e2e.config.ts, workspace/plugin/package.json]
sources: [Cody G5 dogfood finding (CLI stubs), F9 sub-agent report (EXIT_* claims), F10 exploratory finding]
prompt: "Verify F9 remediation: CLI is wired + e2e tests exist + dogfood exit codes verified. Threshold 3, severity STRICT per user directive for final pre-sentinel audit."
domain: code
asae_certainty_threshold: 3
severity_policy: strict
invoking_model: opus-4-7 (parent)
---

# ASAE Gate 6 — F9 Remediation Verification (strict)

## Scope respected (F8 verification ✓)

Files changed across commits 71fcfa6 → b7df148:
- `plugin/docs/model-routing-log.md` (new file — minor scope drift, not violation)
- `plugin/examples/hello-world-planning/{PRD,TRD,AVD,TQCD}_2026-04-22_v01_I.md` (4 fixture files)
- `plugin/package.json` (added `test:e2e` + `test:all` scripts)
- `plugin/src/cli/index.ts` (wiring)
- `plugin/tests/e2e/cli.e2e.test.ts` (e2e harness)
- `plugin/vitest.e2e.config.ts` (separate e2e config; triggers build via spawnSync pre-hook)

NOT modified: `src/core/**`, `src/hooks/**`, existing test files, `schemas/**`, `stryker.conf.mjs`, `eslint.config.js`, `tsconfig.json`. F8 PASS.

## Checklist (domain: code, strict)

- **Correctness**: CLI has real `handleGenerate` / `handleDryRun` / help dispatch. Examples fixture present with approved frontmatter per Bundle Consumer contract. ✓
- **E2E test exists**: `tests/e2e/cli.e2e.test.ts` with 12 cases covering help, dry-run, generate, error paths. ✓ for structure; ? for harness-level verification.
- **Harness-level dogfood**: The F9 sub-agent's EXIT_* report is contradictory — see F10 finding. Sub-agent admits `dist/cli/index.js` fails when invoked directly via `node` due to a pre-existing CJS/ESM bug in `src/core/bundle/index.ts` line 2 (`import { glob } from 'fast-glob'` against CommonJS module). That contradicts the claimed `EXIT_GEN=0` on a `npm link`-installed `cdcc generate` invocation — which would route through the same broken `dist/cli/index.js`.
- **Lint exit code**: Sub-agent reported `EXIT_LINT=0` with parenthetical "pre-existing linting errors in unmodified test files". Contradictory (exit 0 means no errors). Not independently verifiable in this gate.

## Findings

- **CRITICAL × 1**: `src/core/bundle/index.ts` line 2 breaks the built CLI at runtime. Direct `node dist/cli/index.js generate <path>` throws `SyntaxError: Named export 'glob' not found`. Step 7 Condition (5) "Plugin is installable" is provably NOT MET.
- **HIGH × 1** (F10-class): Sub-agent's `EXIT_GEN=0` report contradicts its acknowledged DEVIATION about `dist/cli/index.js` failing. Honest state cannot be determined from the report alone.
- **HIGH × 1** (F10-class): Sub-agent's `EXIT_LINT=0` carries a self-contradicting note about pre-existing lint errors.
- **MEDIUM × 1**: Model routing log was created at `plugin/docs/model-routing-log.md` instead of appending to the canonical `workspace/docs/model-routing-log.md`. Minor scope drift; two routing logs now exist in parallel.
- **LOW × 1**: Examples fixtures use filenames `PRD_2026-04-22_v01_I.md` (no `CDCC_` prefix) instead of the `CDCC_<kind>_...` pattern used in the real inputs. Bundle Consumer glob may match either if glob is case-insensitive and matches `<kind>*.md`; check when testing.

Strict policy: CRITICAL + HIGH all reset counter. **Counter = 0.**

## Gate status

**DOES NOT CONVERGE** under strict policy.

The remediation landed real CLI wiring (F9 itself is substantially addressed: code is real, e2e tests exist, examples fixture exists, scope honored) — but shipped with a specific, identified runtime blocker (CJS/ESM import in core/bundle) that prevents the built CLI from running when invoked via `node dist/cli/index.js` or `npm link`-installed `cdcc`. Step 7 Condition (5) cannot be met until this line is fixed AND verified via harness-level exit codes.

## Required residual fix (specific, one-line)

In `plugin/src/core/bundle/index.ts` line 2:

```diff
- import { glob } from 'fast-glob';
+ import fgPkg from 'fast-glob';
+ const { glob } = fgPkg as unknown as { glob: typeof import('fast-glob').default };
```

Or equivalently:

```typescript
import fg from 'fast-glob';
// fast-glob CJS: use default export which IS the glob callable, or `fg.async` depending on v3
const glob = fg.async ?? fg;
```

After fix: `npm run build && node dist/cli/index.js --help` must exit 0 with Usage output; `node dist/cli/index.js generate <tmp-planning-dir>` must exit 0 with plan.json + .claude/settings.json written. Exit codes captured at harness level, not through vitest wrapper.

This fix is strictly ONE line in ONE file under `src/core/**`. It was explicitly out-of-scope for the F9 sub-agent (which correctly refused to modify src/core/**). The fix is the minimum-viable unblocking change and represents the residual for BUILD COMPLETE.

## Decision

Gate-06 HALT. Emit **BUILD HALTED** with this specific residual:
**BUILD HALTED: one-line CJS/ESM import bug in plugin/src/core/bundle/index.ts line 2 blocks runtime CLI invocation; Step 7 Condition (5) "Plugin is installable" NOT MET until fixed and harness-level exit codes verified.**
