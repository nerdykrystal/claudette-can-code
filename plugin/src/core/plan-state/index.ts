// Stage 06 — Plan-State Store + HMAC public API.
// Re-exports from sub-modules per §3.06 spec.

export { PlanStateStore } from './store.js';
export { generateAndStoreKey, loadKey, computeHmac, verifyHmac } from './hmac.js';
export type { Result } from './hmac.js';
export type { PlanState, PlanStateOptions } from './types.js';
export type { PlanStateError, KeyError } from './errors.js';
