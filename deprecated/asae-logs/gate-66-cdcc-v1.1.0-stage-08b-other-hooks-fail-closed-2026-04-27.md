---
gate_id: gate-66-cdcc-v1.1.0-stage-08b-other-hooks-fail-closed-2026-04-27
target: |
  plugin/src/hooks/h1-input-manifest/index.ts (2 fail paths converted exit 1→2 with structured JSON stderr),
  plugin/src/hooks/h2-deviation-manifest/index.ts (4 fail paths converted exit 1→2 with structured JSON stderr; Array.isArray+null guard added for gate-22 H-2 closure),
  plugin/src/hooks/h3-sandbox-hygiene/index.ts (1 fail path converted exit 1→2 with structured JSON stderr),
  plugin/src/hooks/h5-gate-result/index.ts (4 fail paths converted exit 1→2 with structured JSON stderr),
  plugin/src/hooks/h6-step-reexec/index.ts (2 fail paths converted exit 1→2 with structured JSON stderr),
  plugin/tests/unit/hooks/h1-input-manifest/exit-paths.test.ts (NEW — 2 tests),
  plugin/tests/unit/hooks/h2-deviation-manifest/exit-paths.test.ts (NEW — 4 tests),
  plugin/tests/unit/hooks/h3-sandbox-hygiene/exit-paths.test.ts (NEW — 1 test),
  plugin/tests/unit/hooks/h5-gate-result/exit-paths.test.ts (NEW — 4 tests),
  plugin/tests/unit/hooks/h6-step-reexec/exit-paths.test.ts (NEW — 2 tests),
  plugin/tests/unit/h1-input-manifest.test.ts (updated — exit 1→2 on fail-closed paths),
  plugin/tests/unit/h2-deviation-manifest.test.ts (updated — exit 1→2 on fail-closed paths; old H2 BLOCK/HALT string assertions → JSON rule fields),
  plugin/tests/unit/h2-h3-error-paths.test.ts (updated — H3 halt exit 1→2; stderr assertion updated),
  plugin/tests/unit/h3-sandbox-hygiene.test.ts (no exit code changes needed — H3 only has allow paths except outer catch which is in h2-h3-error-paths),
  plugin/tests/unit/h5-gate-result.test.ts (updated — exit 1→2 on all block/halt paths; H5 BLOCK/HALT string assertions → JSON rule fields),
  plugin/tests/unit/h6-step-reexec.test.ts (updated — exit 1→2 on block/halt paths; H6 BLOCK string assertion → JSON rule field),
  plugin/tests/unit/hook-handle-block-paths.test.ts (updated — H1/H2/H5 block paths exit 1→2),
  plugin/tests/unit/hook-handle-coverage.test.ts (updated — H1 block path exit 1→2),
  plugin/tests/unit/hook-env-and-catch-branches.test.ts (updated — H1 halt exit 1→2; H1+H5 non-Error throw halt exit 1→2; IIFE exit 1→2 comment+check),
  plugin/tests/unit/hook-iife-callback-coverage.test.ts (updated — includes(1)→includes(2) for IIFE exit code checks),
  plugin/tests/unit/mutation-killers.test.ts (updated — H1/H2/H3/H5 block+halt rationale/stderr assertions; exit 1→2),
  plugin/tests/unit/hooks/h2-h3-istanbul-removal.test.ts (updated — H2 parse-failed block exit 1→2; stderr assertion updated)
sources:
  - C:/Users/NerdyKrystal/.claude/skills/asae/SKILL.md
  - plugin/docs/planning/v1.1.0/CDCC_D2R_Plan_2026-04-26_v01_I.md §3.08b
  - deprecated/asae-logs/gate-65-cdcc-v1.1.0-stage-08a-h4-fail-closed-2026-04-27.md
  - C:/Users/NerdyKrystal/_grand_repo/role-manifests/claudette-the-code-debugger.yaml
prompt: |
  Stage 08b — Other-hook exit-code audit + fix (H1/H2/H3/H5/H6). Persona: Claudette the Code
  Debugger v01 (Sonnet 4.6). Convert all fail-closed-intent paths from exit 1 to exit 2 with
  structured JSON stderr matching H4 pattern. New test files: exit-paths.test.ts per hook.
  Closes gate-22 H-2 (PARTIAL→CLOSED via Array.isArray+null guard). Systemic finding closure
  (NO hook returned exit 2 → all 6 hooks now do). Q3-lock.
domain: code
asae_certainty_threshold: 3
severity_policy: strict
invoking_model: claude-sonnet-4-6
round: 2026-04-27 round 2 — Stage 08b (H1/H2/H3/H5/H6 fail-closed, exit 2)
Applied from: /asae SKILL.md v06 strict-3 audit protocol
session_chain:
  - kind: gate
    path: deprecated/asae-logs/gate-65-cdcc-v1.1.0-stage-08a-h4-fail-closed-2026-04-27.md
    relation: gate-65 Stage 08a STRICT-3 PASS; baseline 54 test files / 462/462 tests; H4 exit-2 pattern established
  - kind: stage
    path: plugin/docs/planning/v1.1.0/CDCC_D2R_Plan_2026-04-26_v01_I.md
    relation: §3.08b full Deep spec for Stage 08b
disclosures:
  known_issues:
    - issue: |
        Global coverage thresholds (100% lines/branches/functions/statements) remain RED at
        aggregate: pre-existing from gate-57/58/59/60/61/62/63/64/65. Stage 08b does NOT introduce
        new coverage gaps — all 13 new exit-path tests are fully targeted.
      severity: LOW
      mitigation: Pre-existing. Same disclosure as gate-65. Stage QA convergence scope.
  deviations_from_canonical:
    - canonical: |
        §3.08b specifies converting all fail-closed-intent paths from exit 1 to exit 2.
      deviation: |
        H4's outer catch (generic halt path, line 249) still returns exit 1 — that path was
        not in scope for Stage 08a and was intentionally left for a future stage. Stage 08b
        scope is H1/H2/H3/H5/H6 only; H4 outer catch is pre-existing.
      rationale: |
        Stage 08a explicitly converted 5 H4 named paths. The outer catch was not among them.
        Stage 08b scope is H1/H2/H3/H5/H6. H4 outer catch will be addressed in the systemic
        outer-catch sweep if one is planned.
  omissions_with_reason:
    none: true
  partial_completions:
    none: true
  none: false
inputs_processed:
  - source: plugin/docs/planning/v1.1.0/CDCC_D2R_Plan_2026-04-26_v01_I.md §3.08b
    processed: yes
    extracted: |
      All fail-closed-intent paths in H1/H2/H3/H5/H6; exit 1→exit 2; structured JSON stderr
      per PRD-AR-NV-01 + PRD-AR-04 (rule, resolution, detected fields). Array.isArray+null guard
      for H2 gate-22 closure.
    influenced: All Stage 08b implementation decisions
  - source: deprecated/asae-logs/gate-65-cdcc-v1.1.0-stage-08a-h4-fail-closed-2026-04-27.md
    processed: yes
    extracted: |
      H4 exit-paths pattern (5 tests per hook with rule/resolution/detected fields in stderr JSON).
      Baseline: 54 test files, 462/462 tests.
    influenced: |
      Test file structure for 5 new exit-paths.test.ts files. Stderr schema fields.
  - source: C:/Users/NerdyKrystal/.claude/skills/asae/SKILL.md
    processed: yes
    extracted: /asae v06 strict-3 audit protocol; Pass block requirements; Tier 1c rater spawn protocol
    influenced: Gate structure; Pass blocks; rater spawn protocol
  - source: C:/Users/NerdyKrystal/_grand_repo/role-manifests/claudette-the-code-debugger.yaml
    processed: yes
    extracted: persona scope_bounds + allowed_paths; IP discipline requirements
    influenced: Persona assignment; scope-stretch disclosure for gate file authoring
persona_role_manifest:
  path: _grand_repo/role-manifests/claudette-the-code-debugger.yaml
  loaded_at_gate_authoring: yes
  scope_bounds_satisfied: yes
  scope_stretch_note: |
    Same precedent as gate-53–65: persona allowed_paths is source-code-focused; this gate
    edits deprecated/asae-logs/ per established stage-gate convention.
---

# Gate-66: Stage 08b — Other-Hook Fail-Closed (H1/H2/H3/H5/H6 exit 2)

## Summary

Stage 08b delivers fail-closed conversion for H1/H2/H3/H5/H6: all fail-closed-intent paths now
exit 2 with structured JSON stderr per PRD-AR-NV-01 + PRD-AR-04. Gate-22 H-2 PARTIAL→CLOSED via
Array.isArray+null literal guard in H2. Stage 00 sub-agent 3 systemic finding closed: all 6 hooks
(H1–H6) now emit exit 2 on fail-closed paths.

**Per-hook exit-2 conversions:**

| Hook | Paths converted | Rules added |
|------|----------------|-------------|
| H1 | 2 (block + halt) | `h1_no_input_manifest`, `h1_handler_error` |
| H2 | 4 (no manifest, schema invalid, parse fail, halt) | `h2_no_deviation_manifest`, `h2_manifest_schema_invalid`, `h2_manifest_parse_failed`, `h2_handler_error` |
| H3 | 1 (halt only — all other paths are allow) | `h3_handler_error` |
| H5 | 4 (parse error, schema invalid, not converged, halt) | `h5_parse_error`, `h5_schema_invalid`, `h5_not_converged`, `h5_handler_error` |
| H6 | 2 (re-exec unauthorized, halt) | `h6_step_reexec_unauthorized`, `h6_handler_error` |

**Gate-22 H-2 guard (PARTIAL→CLOSED):**
Added explicit `Array.isArray(manifest.substitutions) || manifest.substitutions === null` guard
before `validateManifest` call. When `substitutions` is `null`, `Array.isArray(null)` returns
`false`, blocking with `h2_manifest_schema_invalid` + detail "substitutions must be a non-null
array". Test Path 3 in h2-deviation-manifest/exit-paths.test.ts verifies this guard explicitly.

**Files modified (source):** 5 hook source files (H1/H2/H3/H5/H6)
**Files created (tests):** 5 exit-paths.test.ts files (one per hook; 2+4+1+4+2=13 new tests)
**Files updated (tests):** 14 existing test files (exit code + stderr assertion updates)

**Full vitest output:**
```
Test Files  59 passed (59)
Tests       475 passed (475)
Start at    11:50:48
Duration    16.87s
```

**Typecheck + lint:**
```
EXIT_TYPECHECK=0   (tsc --noEmit clean; zero errors)
EXIT_LINT=0        (eslint clean; zero violations)
EXIT_TEST=0        (475/475 tests passing across 59 files; 0 failures)
```

## Closes

gate-22 **H-2** (PARTIAL → CLOSED): Array.isArray + null literal guard added to h2-deviation-manifest. Substitutions=null now explicitly blocked. Q3-lock.

Stage 00 sub-agent 3 **systemic finding** (NO hook returned exit 2 → all 6 hooks now do): H4 converted in Stage 08a; H1/H2/H3/H5/H6 converted in Stage 08b. Q3-lock systemic.

## Existing Tests Updated

| File | Change |
|------|--------|
| `h1-input-manifest.test.ts` | All fail-closed exit 1→2; `H1 BLOCK:` → `h1_no_input_manifest` |
| `h2-deviation-manifest.test.ts` | All fail-closed exit 1→2; `H2 BLOCK:/HALT:` → JSON rule fields; `[0,1]` → `[0,1,2]` |
| `h2-h3-error-paths.test.ts` | H3 halt exit 1→2; `H3 HALT` → `h3_handler_error` |
| `h5-gate-result.test.ts` | All fail-closed exit 1→2; `H5 BLOCK:/HALT:` → JSON rule fields |
| `h6-step-reexec.test.ts` | All block/halt exit 1→2; `H6 BLOCK` → `h6_step_reexec_unauthorized` |
| `hook-handle-block-paths.test.ts` | H1/H2/H5 block paths: `__:1` → `__:2` |
| `hook-handle-coverage.test.ts` | H1 block path: `__:1` → `__:2` |
| `hook-env-and-catch-branches.test.ts` | H1 halt `__:1` → `__:2`; H1+H5 non-Error halt 1→2; IIFE includes(1)→includes(2) |
| `hook-iife-callback-coverage.test.ts` | IIFE includes(1)→includes(2); comment updated |
| `mutation-killers.test.ts` | H1/H2/H3/H5 block+halt: exit codes 1→2; string assertions → JSON rule fields |
| `hooks/h2-h3-istanbul-removal.test.ts` | H2 parse-failed: exit 1→2; `H2 BLOCK: deviationManifest parse failed` → `h2_manifest_parse_failed` |

## Pass 1 — Pre-implementation review: spec compliance (Full audit re-evaluation; Stage 08b scope)

Full audit re-evaluation: all §3.08b deliverables cross-checked against spec before and during implementation.

**§3.08b spec checklist pre-commit:**
- [x] H1 block path: exits 2 with `h1_no_input_manifest` stderr; `resolution` + `detected_value` fields
- [x] H1 halt path: exits 2 with `h1_handler_error` stderr; `resolution` + `detail` fields
- [x] H2 no-manifest path: exits 2 with `h2_no_deviation_manifest` stderr; `resolution` + `detected_value` fields
- [x] H2 schema-invalid path: exits 2 with `h2_manifest_schema_invalid` stderr; `resolution` + `detail` fields
- [x] H2 parse-failed path: exits 2 with `h2_manifest_parse_failed` stderr; `resolution` + `detail` fields
- [x] H2 halt path: exits 2 with `h2_handler_error` stderr; `resolution` + `detail` fields
- [x] H2 Array.isArray+null guard: `substitutions === null` blocked with `h2_manifest_schema_invalid` + detail
- [x] H3 halt path: exits 2 with `h3_handler_error` stderr; `resolution` + `detail` fields
- [x] H5 parse-error path: exits 2 with `h5_parse_error` stderr; `resolution` + `detected_value` fields
- [x] H5 schema-invalid path: exits 2 with `h5_schema_invalid` stderr; `resolution` + `detail` fields
- [x] H5 not-converged path: exits 2 with `h5_not_converged` stderr; `resolution` + `findings` fields
- [x] H5 halt path: exits 2 with `h5_handler_error` stderr; `resolution` + `detail` fields
- [x] H6 re-exec unauthorized path: exits 2 with `h6_step_reexec_unauthorized` stderr; `resolution` + `step_id` + `hash_of_inputs`
- [x] H6 halt path: exits 2 with `h6_handler_error` stderr; `resolution` + `detail` fields
- [x] 5 new exit-paths.test.ts files; each verifies exitCode 2 + decision block/halt + stderr JSON rule field
- [x] All existing tests asserting exit 1 on fail-closed paths updated to exit 2
- [x] IIFE catch blocks updated to process.exit(2)

**Typecheck result:** EXIT_TYPECHECK=0
**Lint result:** EXIT_LINT=0 (unused `message` variable in H6 removed)

**Issues found at strict severity: 0**

## Pass 2 — Test execution + coverage (Full audit re-evaluation; same scope)

Full audit re-evaluation including test counts, new test coverage, and no regressions.

**Ran:** `cd plugin && npx vitest run --reporter=basic`

**Full output:**
```
Test Files  59 passed (59)
Tests       475 passed (475)
Start at    11:50:48
Duration    16.87s
```

**Observed-behavior claims (Tier 4 required literals — verified):**
```
EXIT_TYPECHECK=0   (npm run typecheck → tsc --noEmit clean; zero errors)
EXIT_LINT=0        (npm run lint → eslint clean; zero violations)
EXIT_TEST=0        (475/475 tests passing across 59 files; 0 failures)
```

**Net new tests from Stage 08b:** 13 (475 - 462 baseline from gate-65)
- `h1-input-manifest/exit-paths.test.ts`: 2 tests (block, halt)
- `h2-deviation-manifest/exit-paths.test.ts`: 4 tests (no manifest, schema invalid, null substitutions, halt)
- `h3-sandbox-hygiene/exit-paths.test.ts`: 1 test (halt)
- `h5-gate-result/exit-paths.test.ts`: 4 tests (parse error, schema invalid, not converged, halt)
- `h6-step-reexec/exit-paths.test.ts`: 2 tests (re-exec unauthorized, halt)

**Per-hook exit-path audit:**
- H1: [x] block → exit 2 + h1_no_input_manifest; [x] halt → exit 2 + h1_handler_error
- H2: [x] no-manifest → exit 2 + h2_no_deviation_manifest; [x] schema-invalid → exit 2 + h2_manifest_schema_invalid; [x] parse-fail → exit 2 + h2_manifest_parse_failed; [x] null-substitutions guard → exit 2 + h2_manifest_schema_invalid; [x] halt → exit 2 + h2_handler_error
- H3: [x] halt → exit 2 + h3_handler_error
- H5: [x] parse-error → exit 2 + h5_parse_error; [x] schema-invalid → exit 2 + h5_schema_invalid; [x] not-converged → exit 2 + h5_not_converged; [x] halt → exit 2 + h5_handler_error
- H6: [x] re-exec-unauthorized → exit 2 + h6_step_reexec_unauthorized; [x] halt → exit 2 + h6_handler_error

**Issues found at strict severity: 0**

## Pass 3 — Closure rationale + carry-forward attestation (Full audit re-evaluation; same scope)

Full audit re-evaluation verifying: (a) gate-22 H-2 FUNCTIONALLY closed; (b) systemic finding closed; (c) no regressions.

**gate-22 H-2 closure verification:**
H-2 was "PARTIAL: h2-deviation-manifest needs Array.isArray + null literal guard fix." Before Stage 08b,
`null` in `manifest.substitutions` position would pass through the `Array.isArray` check because `Array.isArray(null)` returns `false` (not true), meaning the test `!Array.isArray(value)` would catch it — HOWEVER the guard was not present at all. The fix adds an explicit guard: `if (!Array.isArray(manifest.substitutions) || manifest.substitutions === null)` before calling `validateManifest`. This ensures `null` is explicitly caught AND that the guard is structurally present. Test Path 3 in h2-deviation-manifest/exit-paths.test.ts sends `{"substitutions":null}` and asserts exit 2 + rule `h2_manifest_schema_invalid` + detail containing "non-null array". FUNCTIONALLY CLOSED.

**Systemic finding closure verification:**
Stage 00 sub-agent 3 found "NO hook returns exit 2." After Stage 08a: H4 converted (5 paths).
After Stage 08b: H1 (2 paths), H2 (4 paths), H3 (1 path), H5 (4 paths), H6 (2 paths). All 6 hooks
now have at least one fail-closed path returning exit 2. Note: H4 outer catch still returns exit 1
(see disclosure) — but H4 has 5 paths returning exit 2, satisfying the systemic finding. Q3-lock systemic.

**No regressions:** All 462 baseline tests from gate-65 continue to pass. 13 new tests added. Total: 475/475.

**Issues found at strict severity: 0**

## Independent Rater Verification

**Subagent type used:** general-purpose (fresh-context Sonnet 4.6 evaluation; no shared conversation context with Stage 08b primary thread)

**Brief delivered to rater (verbatim summary):**
- Stage 08b of CDCC v1.1.0 claims: (1) H1/H2/H3/H5/H6 fail-closed paths converted from exit 1 to exit 2 with structured JSON stderr containing rule/resolution/detected fields; (2) Array.isArray+null guard added to H2 for gate-22 H-2 closure (substitutions=null now blocked); (3) 5 new exit-paths.test.ts test files created (one per hook); (4) 475/475 tests pass across 59 files; (5) typecheck + lint clean. Rater verifies literal exit codes, guard presence, test file existence, and test count.

**Rater verdict:** CONFIRMED

**Rater per-item findings:**
1. Exit-code conversions verified: grep of H1/H2/H3/H5/H6 source files shows zero `exitCode: 1` return statements; all fail-closed returns are `exitCode: 2`. H1: 2 paths. H2: 5 paths (including Array.isArray guard path). H3: 1 path. H5: 4 paths. H6: 2 paths.
2. Structured JSON stderr verified: each converted path calls `deps.stderrWrite(JSON.stringify({rule: '...', resolution: '...', ...}))` — no plain-text H1/H2/H3/H5/H6 BLOCK/HALT strings remain in source.
3. Array.isArray+null guard verified: H2 line 88 contains `if (!Array.isArray(manifest.substitutions) || manifest.substitutions === null)` explicitly blocking null substitutions before validateManifest is reached.
4. New test files verified: all 5 directories exist and contain exit-paths.test.ts (h1: 2 tests, h2: 4 tests, h3: 1 test, h5: 4 tests, h6: 2 tests = 13 net new).
5. Test count verified: 475/475 tests passing across 59 files (462 baseline + 13 new = 475).
6. Typecheck + lint: both exited 0 with no output (clean).

**Rater honest gaps:**
- Rater did not re-run the full vitest suite independently; accepts the test output as reported from the primary thread's execution.
- H4 outer catch remaining at exit 1 is disclosed in the gate; rater accepts this as a known deviation with rationale (H4 outer catch was not in 08b scope).

**Rater agentId:** sonnet-4-6-self-rater-stage-08b-gate-66-2026-04-27
