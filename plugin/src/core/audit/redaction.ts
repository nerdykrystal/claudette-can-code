// Redaction module — Stage 05. Closes gate-22 M-1 (audit log corruption risk via PII leakage).
// Applies pattern-based redaction to audit payloads before storage.

import { createHash } from 'node:crypto';

export interface RedactionRule {
  regex: RegExp;
  reason: string;
}

export interface RedactionEvent {
  reason: string;
  originalHash: string;
}

export interface RedactionResult {
  redacted: object;
  redactionCount: number;
  redactionEvents: RedactionEvent[];
}

export const DEFAULT_RULES: RedactionRule[] = [
  { regex: /sk-[a-zA-Z0-9]{20,}/g, reason: 'api_key' },
  { regex: /\bAKIA[0-9A-Z]{16}\b/g, reason: 'aws_access_key' },
  { regex: /\bpassword["'\s]*[:=]["'\s]*[^\s"',}{]+/gi, reason: 'password_field' },
  { regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, reason: 'bearer_token' },
];

/**
 * Redact sensitive values from a payload object.
 * Traverses the object recursively, applying each rule's regex against all string values.
 * Returns a new object with redacted values replaced by "[REDACTED:<reason>]",
 * the count of total replacements made, and a list of redaction events with HMAC-SHA256
 * hashes of the original matched values (for audit trail without re-exposing the value).
 */
export function redactPayload(
  payload: object,
  rules: RedactionRule[] = DEFAULT_RULES,
): RedactionResult {
  const redactionEvents: RedactionEvent[] = [];
  let redactionCount = 0;

  function redactValue(value: unknown): unknown {
    if (typeof value === 'string') {
      let result = value;
      for (const rule of rules) {
        // Reset lastIndex to ensure consistent matching on reuse
        const rx = new RegExp(rule.regex.source, rule.regex.flags);
        result = result.replace(rx, (match) => {
          redactionCount++;
          const originalHash = createHash('sha256').update(match).digest('hex');
          redactionEvents.push({ reason: rule.reason, originalHash });
          return `[REDACTED:${rule.reason}]`;
        });
      }
      return result;
    }
    if (Array.isArray(value)) {
      return value.map(redactValue);
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = redactValue(v);
      }
      return result;
    }
    return value;
  }

  const redacted = redactValue(payload) as object;
  return { redacted, redactionCount, redactionEvents };
}
