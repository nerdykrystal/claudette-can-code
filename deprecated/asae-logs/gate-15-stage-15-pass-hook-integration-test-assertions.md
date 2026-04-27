---
gate_id: gate-15-stage-15-pass-hook-integration-test-assertions
target: [workspace/plugin/tests/integration/hook-cli-spawn.test.ts after commit TBD]
sources: [Stage 08a/08b hook refactor (hooks exit 2 on all block/halt paths), Stage 15 task description (4 failing integration tests)]
prompt: "Stage 08a/08b converted hook exit codes from 1→2 (fail-closed). 4 integration tests in hook-cli-spawn.test.ts still asserted exit 1. Update assertions to match current post-Stage-08 hook behavior. Verify all 657 tests pass, lint clean, typecheck clean."
domain: code
asae_certainty_threshold: 3
severity_policy: strict
invoking_model: haiku-4-5-20251001 (Claudette Code Debugger)
applied_from: Stage 15 (Claudette the Code Debugger v01, Haiku 4.5, 1M context)
---

# gate-15: Stage 15 Pass — Hook Integration Test Assertions (Stage 08 Carry-Forward Closure)

**Status:** PASS-3 SELF-AUDIT (strict-3 ASAE gate, domain=code)

## Scope

Stage 15 follow-up: Fix 4 integration tests that still asserted Stage 07 behavior after Stage 08 hook refactor:

- `plugin/tests/integration/hook-cli-spawn.test.ts` line 73: H1 block test, expected exit 1 → corrected to 2
- `plugin/tests/integration/hook-cli-spawn.test.ts` line 135: H1 halt test, expected exit 1 → corrected to 2
- `plugin/tests/integration/hook-cli-spawn.test.ts` line 145: H4 halt test, expected exit 1 → corrected to 2
- `plugin/tests/integration/hook-cli-spawn.test.ts` line 155: H5 block test, expected exit 1 → corrected to 2

---

## Audit Definition (Defined ONCE, Applied Identically Each Pass)

/asae domain=code full checklist:

1. **Hook source verification** — H1/H4/H5 index.ts files reviewed; exit codes on block/halt paths confirmed to return 2
2. **Assertion accuracy** — Each test's `.toBe()` assertion matches source exit code behavior
3. **Stderr pattern matching** — Each test's stderr expectation matches actual hook JSON payload rule keys
4. **Build success** — `npm run build` succeeds; TypeScript compilation clean
5. **Test execution** — `npx vitest run` shows all 657 tests passing
6. **Lint clean** — `npm run lint` (eslint) exits 0
7. **Typecheck clean** — `npx tsc --noEmit` exits 0
8. **No unrelated changes** — Only hook-cli-spawn.test.ts modified; no other files touched

---

## Pass 1 — Full audit (full /asae domain=code)

**Issues found at strict severity:**

### Hook source verification
- H1 (plugin/src/hooks/h1-input-manifest/index.ts): lines 77 (block) and 91 (halt) both return `exitCode: 2`. Confirmed. ✓
- H4 (plugin/src/hooks/h4-model-assignment/index.ts): lines 103, 131, 171 all block paths return `exitCode: 2`. Confirmed. ✓
- H5 (plugin/src/hooks/h5-gate-result/index.ts): lines 77, 93, 129, 142 all block/halt paths return `exitCode: 2`. Confirmed. ✓

### Assertion accuracy
- H1 line 73: `expect(res.status).toBe(2)` now matches source line 77 block exit code. ✓
- H1 line 135: `expect(res.status).toBe(2)` now matches source line 91 halt exit code. ✓
- H4 line 145: `expect(res.status).toBe(2)` now matches source line 103 block exit code. ✓
- H5 line 155: `expect(res.status).toBe(2)` now matches source line 77 block exit code. ✓

### Stderr pattern matching
- H1 block test: `toContain('h1_no_input_manifest')` matches source line 76 payload rule key. ✓
- H1 halt test: `toContain('h1_handler_error')` matches source line 90 payload rule key. ✓
- H4 halt test: `toContain('h4_plan_state_missing')` matches source line 65 payload rule key. ✓
- H5 block test: `toContain('h5_parse_error')` matches source line 76 payload rule key. ✓

### Build success
- `npm run build` in plugin/: completed successfully. TypeScript compilation zero errors. ✓

### Test execution
- `npx vitest run --reporter=basic`: **Test Files: 73 passed (73), Tests: 657 passed (657)**.
- All 4 previously failing hook-cli-spawn tests now pass. ✓

### Lint clean
- `npm run lint` (eslint src tests): zero errors, zero warnings. ✓

### Typecheck clean
- `npx tsc --noEmit`: zero errors. ✓

### No unrelated changes
- Only plugin/tests/integration/hook-cli-spawn.test.ts modified (4 test assertions updated).
- No other files in plugin/ or elsewhere modified. ✓

**Issues found at strict severity: 0**

**Full audit complete.** Counter: 1/3.

---

## Pass 2 — Full audit (full /asae domain=code)

Same comprehensive scope. Same items, same harness. Per /asae SKILL.md Step 1: full domain checklist, repeated identically.

**Issues found at strict severity:**

Re-checking all 8 items against the same implementation:

1. Hook source verification: H1/H4/H5 exit codes on block/halt paths confirmed 2. PASS. ✓
2. Assertion accuracy: all four `.toBe(2)` match source behavior. PASS. ✓
3. Stderr pattern matching: all four rule keys match source JSON payload keys. PASS. ✓
4. Build success: npm run build succeeds, tsc clean. PASS. ✓
5. Test execution: 657/657 tests passing. All 4 previously failing now pass. PASS. ✓
6. Lint clean: eslint zero errors. PASS. ✓
7. Typecheck clean: tsc --noEmit zero errors. PASS. ✓
8. No unrelated changes: only hook-cli-spawn.test.ts 4 assertions modified. PASS. ✓

**Issues found at strict severity: 0**

**Full audit complete.** Counter: 2/3.

---

## Pass 3 — Full audit (full /asae domain=code)

Same comprehensive scope. Same items, same harness.

**Issues found at strict severity:**

Final verification against all 8 criteria:

1. Hook source verification: all three hooks (H1/H4/H5) verified to return exitCode 2 on block/halt. PASS. ✓
2. Assertion accuracy: H1 line 73 → 2, H1 line 135 → 2, H4 line 145 → 2, H5 line 155 → 2. PASS. ✓
3. Stderr pattern matching: h1_no_input_manifest, h1_handler_error, h4_plan_state_missing, h5_parse_error all confirmed. PASS. ✓
4. Build success: `npm run build` succeeded. PASS. ✓
5. Test execution: vitest run 657/657 passing. Previously failing 4 tests now passing. PASS. ✓
6. Lint clean: eslint returned 0. PASS. ✓
7. Typecheck clean: tsc --noEmit returned 0. PASS. ✓
8. No unrelated changes: 1 file modified, 4 assertions changed. PASS. ✓

**Issues found at strict severity: 0**

**Full audit complete.** Counter: 3/3.

---

## Converged

Gate **CONVERGES** at Pass 3 under strict-3 policy. All criteria verified in triplicate.

**Status: PASS** — Stage 15 follow-up closure complete. 657/657 tests passing.
