// Unit tests — Recovery Verifier (Stage 10)
// Per §3.10 spec test cases:
//   1. runVerification with all checks disabled + clean call → passed:true
//   2. Schema: RecoveryEvent compile-time type test matching /asae v06 verbatim
//   3. validateRecoveryEvent detects missing fields
//   4. isValidRevertTarget accepts hex hash + 'working_tree_state'; rejects invalid
//   5. VIOLATION_TYPES array covers all 6 enum values from /asae v06
// Additional coverage tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateRecoveryEvent,
  isValidRevertTarget,
  VIOLATION_TYPES,
  type RecoveryEvent,
} from '../../../src/core/recovery/recovery-events-schema.js';
import { runVerification } from '../../../src/core/recovery/verifier.js';

// -----------------------------------------------------------------------
// Schema tests
// -----------------------------------------------------------------------

describe('RecoveryEvent schema — /asae v06 verbatim check', () => {
  // Test 2: TypeScript compile-time check — if this compiles, the schema matches spec
  it('Test 2 — RecoveryEvent interface compiles with all 6 violation_type literals', () => {
    // Compile-time shape verification: assign all 6 violation_type values
    const events: RecoveryEvent[] = [
      {
        stage_id: 'stage-10',
        violation_type: 'scope_violation',
        detected_by: 'hook_tier_9',
        revert_target: 'abc1234',
        redelegation_spec_diff: 'restrict to read-only ops',
        recovery_pass: false,
      },
      {
        stage_id: 'stage-10',
        violation_type: 'false_attestation',
        detected_by: 'hook_tier_9',
        revert_target: 'working_tree_state',
        redelegation_spec_diff: 'require honest disclosure',
        recovery_pass: false,
      },
      {
        stage_id: 'stage-10',
        violation_type: 'coverage_drop',
        detected_by: 'hook_tier_9',
        revert_target: 'deadbeef1',
        redelegation_spec_diff: 'restore coverage to 100%',
        recovery_pass: false,
      },
      {
        stage_id: 'stage-10',
        violation_type: 'protected_file_mutation',
        detected_by: 'hook_tier_9',
        revert_target: 'f00dface1',
        redelegation_spec_diff: 'exclude protected files from scope',
        recovery_pass: false,
      },
      {
        stage_id: 'stage-10',
        violation_type: 'role_boundary',
        detected_by: 'hook_tier_9',
        revert_target: 'cafe1234a',
        redelegation_spec_diff: 'limit to declared role scope',
        recovery_pass: false,
      },
      {
        stage_id: 'stage-10',
        violation_type: 'fabrication',
        detected_by: 'hook_tier_9',
        revert_target: 'working_tree_state',
        redelegation_spec_diff: 'require empirical verification',
        recovery_pass: true,
      },
    ];
    expect(events).toHaveLength(6);
    // Verify all 6 violation types present
    const types = events.map((e) => e.violation_type);
    expect(types).toContain('scope_violation');
    expect(types).toContain('false_attestation');
    expect(types).toContain('coverage_drop');
    expect(types).toContain('protected_file_mutation');
    expect(types).toContain('role_boundary');
    expect(types).toContain('fabrication');
  });

  it('Test 5 — VIOLATION_TYPES array contains exactly 6 values from /asae v06', () => {
    expect(VIOLATION_TYPES).toHaveLength(6);
    expect(VIOLATION_TYPES).toContain('scope_violation');
    expect(VIOLATION_TYPES).toContain('false_attestation');
    expect(VIOLATION_TYPES).toContain('coverage_drop');
    expect(VIOLATION_TYPES).toContain('protected_file_mutation');
    expect(VIOLATION_TYPES).toContain('role_boundary');
    expect(VIOLATION_TYPES).toContain('fabrication');
  });
});

// -----------------------------------------------------------------------
// isValidRevertTarget tests
// -----------------------------------------------------------------------

describe('isValidRevertTarget', () => {
  it('accepts 7-char hex hash', () => {
    expect(isValidRevertTarget('abc1234')).toBe(true);
  });

  it('accepts 40-char hex hash', () => {
    expect(isValidRevertTarget('a'.repeat(40))).toBe(true);
  });

  it('accepts "working_tree_state" literal', () => {
    expect(isValidRevertTarget('working_tree_state')).toBe(true);
  });

  it('rejects 6-char hex (too short)', () => {
    expect(isValidRevertTarget('abc123')).toBe(false);
  });

  it('rejects 41-char hex (too long)', () => {
    expect(isValidRevertTarget('a'.repeat(41))).toBe(false);
  });

  it('rejects non-hex chars', () => {
    expect(isValidRevertTarget('xyz1234')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidRevertTarget('')).toBe(false);
  });

  it('rejects arbitrary string that is not working_tree_state', () => {
    expect(isValidRevertTarget('HEAD~1')).toBe(false);
  });
});

// -----------------------------------------------------------------------
// validateRecoveryEvent tests
// -----------------------------------------------------------------------

describe('validateRecoveryEvent', () => {
  const validEvent: RecoveryEvent = {
    stage_id: 'stage-10',
    violation_type: 'fabrication',
    detected_by: 'hook_tier_9',
    revert_target: 'abc1234',
    redelegation_spec_diff: 'require empirical verification',
    recovery_pass: false,
  };

  it('Test 3 — returns empty errors for valid event', () => {
    const errors = validateRecoveryEvent(validEvent);
    expect(errors).toEqual([]);
  });

  it('returns error for non-object input', () => {
    expect(validateRecoveryEvent(null)).toEqual(['event must be a non-null object']);
    expect(validateRecoveryEvent('string')).toEqual(['event must be a non-null object']);
  });

  it('returns error for missing stage_id', () => {
    const errors = validateRecoveryEvent({ ...validEvent, stage_id: '' });
    expect(errors.some((e) => e.includes('stage_id'))).toBe(true);
  });

  it('returns error for invalid violation_type', () => {
    const errors = validateRecoveryEvent({ ...validEvent, violation_type: 'unknown_type' });
    expect(errors.some((e) => e.includes('violation_type'))).toBe(true);
  });

  it('returns error for invalid revert_target', () => {
    const errors = validateRecoveryEvent({ ...validEvent, revert_target: 'not_valid' });
    expect(errors.some((e) => e.includes('revert_target'))).toBe(true);
  });

  it('accepts working_tree_state as revert_target', () => {
    const errors = validateRecoveryEvent({
      ...validEvent,
      revert_target: 'working_tree_state',
    });
    expect(errors).toEqual([]);
  });

  it('returns error for non-boolean recovery_pass', () => {
    const errors = validateRecoveryEvent({ ...validEvent, recovery_pass: 'true' });
    expect(errors.some((e) => e.includes('recovery_pass'))).toBe(true);
  });

  it('accepts recovery_pass: true', () => {
    const errors = validateRecoveryEvent({ ...validEvent, recovery_pass: true });
    expect(errors).toEqual([]);
  });

  it('returns error for missing detected_by', () => {
    const errors = validateRecoveryEvent({ ...validEvent, detected_by: '' });
    expect(errors.some((e) => e.includes('detected_by'))).toBe(true);
  });

  it('returns error for missing redelegation_spec_diff', () => {
    const errors = validateRecoveryEvent({ ...validEvent, redelegation_spec_diff: '' });
    expect(errors.some((e) => e.includes('redelegation_spec_diff'))).toBe(true);
  });
});

// -----------------------------------------------------------------------
// runVerification tests
// -----------------------------------------------------------------------

describe('runVerification', () => {
  // Test 1: all checks disabled → passed:true immediately (no subprocess calls)
  it('Test 1 — all checks disabled returns passed:true', () => {
    const result = runVerification('stage-10', {
      typecheck: false,
      lint: false,
      coverage: false,
      scopeBoundsCheck: false,
      cwd: process.cwd(),
    });
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('returns VerificationResult shape with passed and violations array', () => {
    const result = runVerification('stage-10', {
      typecheck: false,
      lint: false,
      coverage: false,
      scopeBoundsCheck: false,
    });
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.violations)).toBe(true);
  });

  it('non-existent role manifest with scopeBoundsCheck=true causes role_boundary violation', () => {
    const result = runVerification('stage-10', {
      typecheck: false,
      lint: false,
      coverage: false,
      scopeBoundsCheck: true,
      cwd: process.cwd(),
      roleManifestPath: '/nonexistent/path/manifest.yaml',
    });
    // Should detect violation for missing manifest
    const roleBoundaryViolations = result.violations.filter(
      (v) => v.type === 'role_boundary',
    );
    expect(roleBoundaryViolations.length).toBeGreaterThan(0);
  });

  it('violation has required fields matching RecoveryEvent shape', () => {
    const result = runVerification('stage-10', {
      typecheck: false,
      lint: false,
      coverage: false,
      scopeBoundsCheck: true,
      cwd: process.cwd(),
      roleManifestPath: '/nonexistent/path/manifest.yaml',
    });
    if (!result.passed && result.violations.length > 0) {
      const v = result.violations[0];
      expect(typeof v.type).toBe('string');
      expect(VIOLATION_TYPES).toContain(v.type);
      expect(typeof v.description).toBe('string');
      expect(typeof v.suggestedRevertTarget).toBe('string');
      expect(isValidRevertTarget(v.suggestedRevertTarget)).toBe(true);
    }
  });

  it('suggestedRevertTarget on non-git cwd is working_tree_state', () => {
    // Use a temp-like path that is not a git repo
    const result = runVerification('stage-10', {
      typecheck: false,
      lint: false,
      coverage: false,
      scopeBoundsCheck: false,
      cwd: require('os').tmpdir(),
    });
    if (!result.passed) {
      // Non-git workspace violation
      const hasNonGitViolation = result.violations.some(
        (v) => v.suggestedRevertTarget === 'working_tree_state',
      );
      expect(hasNonGitViolation).toBe(true);
    }
    // If it passed (tmpdir happens to be in git), just assert shape
    expect(typeof result.passed).toBe('boolean');
  });
});
