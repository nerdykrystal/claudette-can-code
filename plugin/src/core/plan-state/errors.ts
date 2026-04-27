// Stage 06 — Plan-State error discriminated unions.
// Per §3.06 spec.

export type PlanStateError =
  | { kind: 'not_found'; path: string; message: string }
  | { kind: 'malformed_json'; message: string }
  | { kind: 'hmac_missing'; message: string }
  | { kind: 'hmac_mismatch'; message: string };

export type KeyError =
  | { kind: 'key_not_found'; path: string; message: string }
  | { kind: 'key_wrong_perms'; path: string; mode: number; message: string };
