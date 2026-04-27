// recovery_events: schema — verbatim from /asae SKILL.md v06 lines 297-326
// Stage 10 — A21 canonical (gate-54). UNFLAGGED per gate-49.
// violation_type and revert_target are exactly as specified in /asae v06 Tier 14.
// detected_by narrowed per /asae v06 Tier 14 commit-msg hook validator regex.

export type DetectedBy = 'parent_verification' | 'F8_governance' | `aspect_${number}` | `hook_tier_${number}`;

export interface RecoveryEvent {
  stage_id: string;
  violation_type: 'scope_violation' | 'false_attestation' | 'coverage_drop' | 'protected_file_mutation' | 'role_boundary' | 'fabrication';
  detected_by: DetectedBy;
  revert_target: string; // 7-40 char hex hash OR literal 'working_tree_state'
  redelegation_spec_diff: string;
  recovery_pass: boolean;
}

/** Validate a detected_by value against /asae v06 Tier 14 commit-msg hook regex. */
export function isValidDetectedBy(value: string): boolean {
  // Pattern from live /asae v06 Tier 14 validator:
  // ^(parent_verification|F8_governance|aspect_[0-9]+|hook_tier_[0-9]+)$
  return /^(parent_verification|F8_governance|aspect_[0-9]+|hook_tier_[0-9]+)$/.test(value);
}

/** Validate a revert_target value per /asae v06 Tier 14 rules. */
export function isValidRevertTarget(value: string): boolean {
  if (value === 'working_tree_state') return true;
  // 7–40 char hex commit hash
  return /^[0-9a-f]{7,40}$/i.test(value);
}

/** All valid violation_type values per /asae v06. */
export const VIOLATION_TYPES: readonly RecoveryEvent['violation_type'][] = [
  'scope_violation',
  'false_attestation',
  'coverage_drop',
  'protected_file_mutation',
  'role_boundary',
  'fabrication',
];

/** Validate a RecoveryEvent object. Returns array of error strings (empty = valid). */
export function validateRecoveryEvent(event: unknown): string[] {
  const errors: string[] = [];
  if (typeof event !== 'object' || event === null) {
    return ['event must be a non-null object'];
  }
  const e = event as Record<string, unknown>;

  if (typeof e['stage_id'] !== 'string' || e['stage_id'].length === 0) {
    errors.push('stage_id must be a non-empty string');
  }
  if (!VIOLATION_TYPES.includes(e['violation_type'] as RecoveryEvent['violation_type'])) {
    errors.push(`violation_type must be one of: ${VIOLATION_TYPES.join(', ')}`);
  }
  if (typeof e['detected_by'] !== 'string' || !isValidDetectedBy(e['detected_by'] as string)) {
    errors.push('detected_by must match /asae v06 Tier 14 pattern: parent_verification | F8_governance | aspect_<number> | hook_tier_<number>');
  }
  if (typeof e['revert_target'] !== 'string' || !isValidRevertTarget(e['revert_target'])) {
    errors.push('revert_target must be a 7-40 char hex hash OR the literal string "working_tree_state"');
  }
  if (typeof e['redelegation_spec_diff'] !== 'string' || e['redelegation_spec_diff'].length === 0) {
    errors.push('redelegation_spec_diff must be a non-empty string');
  }
  if (typeof e['recovery_pass'] !== 'boolean') {
    errors.push('recovery_pass must be a boolean');
  }

  return errors;
}
