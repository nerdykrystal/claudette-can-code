// Property tests for redactPayload — Stage 05.
// Per §3.05: idempotency + field-preservation properties via fast-check.

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { redactPayload, DEFAULT_RULES } from '../../../src/core/audit/redaction.js';

describe('redactPayload — property tests', () => {
  // Property 1 per §3.05: redactPayload is idempotent (run twice → same output)
  it('is idempotent: redacting twice produces same result as once', () => {
    fc.assert(
      fc.property(
        fc.object({ maxDepth: 3, key: fc.string({ maxLength: 10 }) }),
        (obj) => {
          const first = redactPayload(obj, DEFAULT_RULES);
          const second = redactPayload(first.redacted, DEFAULT_RULES);
          // After first pass, no more secrets remain; second pass should change nothing
          expect(JSON.stringify(second.redacted)).toBe(JSON.stringify(first.redacted));
          expect(second.redactionCount).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 2 per §3.05: redactPayload preserves all non-matching fields exactly
  it('preserves non-matching fields exactly', () => {
    fc.assert(
      fc.property(
        // Generate objects with keys and non-secret string values
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 8 }).filter((s) => /^[a-z_]+$/.test(s)),
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            // Strings that do NOT match any DEFAULT_RULES pattern
            fc.string({ maxLength: 20 }).filter(
              (s) => !s.match(/sk-[a-zA-Z0-9]{20,}/) &&
                     !s.match(/AKIA[0-9A-Z]{16}/) &&
                     !s.match(/password/i) &&
                     !s.match(/Bearer\s+/),
            ),
          ),
        ),
        (obj) => {
          const { redacted, redactionCount } = redactPayload(obj, DEFAULT_RULES);
          expect(redactionCount).toBe(0);
          // All fields preserved exactly
          for (const [k, v] of Object.entries(obj)) {
            expect((redacted as Record<string, unknown>)[k]).toBe(v);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('redactionCount is non-negative', () => {
    fc.assert(
      fc.property(
        fc.object({ maxDepth: 2 }),
        (obj) => {
          const { redactionCount } = redactPayload(obj, DEFAULT_RULES);
          expect(redactionCount).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('redactionEvents length equals redactionCount', () => {
    fc.assert(
      fc.property(
        fc.object({ maxDepth: 2 }),
        (obj) => {
          const { redactionCount, redactionEvents } = redactPayload(obj, DEFAULT_RULES);
          expect(redactionEvents.length).toBe(redactionCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});
