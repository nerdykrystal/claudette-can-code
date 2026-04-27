/**
 * Generic Result type for error handling
 * Discriminated union: either successful {ok: true; value: T} or error {ok: false; error: E}
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
