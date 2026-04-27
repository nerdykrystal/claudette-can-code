// Unit tests for redaction module — Stage 05.
// Test cases per §3.05: api_key match, redactionCount, redactionEvents, custom rules.

import { describe, it, expect } from 'vitest';
import { redactPayload, DEFAULT_RULES, type RedactionRule } from '../../../src/core/audit/redaction.js';

describe('redactPayload', () => {
  // Test case 4 per §3.05: rule matches sk-XXX → redactionCount:1, reason:'api_key'
  it('redacts api_key pattern sk-XXX', () => {
    const payload = { apiKey: 'sk-abcdefghijklmnopqrstu' };
    const { redacted, redactionCount, redactionEvents } = redactPayload(payload, DEFAULT_RULES);
    expect(redactionCount).toBe(1);
    expect(redactionEvents[0].reason).toBe('api_key');
    expect(redactionEvents[0].originalHash).toHaveLength(64); // SHA-256 hex
    expect((redacted as { apiKey: string }).apiKey).toBe('[REDACTED:api_key]');
  });

  it('redacts AWS access key pattern', () => {
    const payload = { key: 'AKIAIOSFODNN7EXAMPLE' };
    const { redacted, redactionCount, redactionEvents } = redactPayload(payload, DEFAULT_RULES);
    expect(redactionCount).toBe(1);
    expect(redactionEvents[0].reason).toBe('aws_access_key');
    expect((redacted as { key: string }).key).toBe('[REDACTED:aws_access_key]');
  });

  it('redacts Bearer token', () => {
    const payload = { auth: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' };
    const { redactionCount } = redactPayload(payload, DEFAULT_RULES);
    expect(redactionCount).toBe(1);
  });

  it('returns redactionCount=0 for clean payloads', () => {
    const payload = { message: 'hello world', count: 42 };
    const { redactionCount, redactionEvents } = redactPayload(payload, DEFAULT_RULES);
    expect(redactionCount).toBe(0);
    expect(redactionEvents).toHaveLength(0);
  });

  it('preserves all non-matching fields exactly', () => {
    const payload = { safe: 'value', count: 123, flag: true, nested: { ok: 'yes' } };
    const { redacted } = redactPayload(payload, DEFAULT_RULES);
    expect(redacted).toMatchObject(payload);
  });

  it('handles nested object redaction', () => {
    const payload = { outer: { inner: { key: 'sk-abcdefghijklmnopqrstu' } } };
    const { redactionCount } = redactPayload(payload, DEFAULT_RULES);
    expect(redactionCount).toBe(1);
  });

  it('handles array of strings', () => {
    const payload = { keys: ['sk-abcdefghijklmnopqrstu', 'normal-value', 'sk-zyxwvutsrqponmlkjihg'] };
    const { redactionCount } = redactPayload(payload, DEFAULT_RULES);
    expect(redactionCount).toBe(2);
  });

  it('accepts empty rules array — no redaction', () => {
    const payload = { key: 'sk-abcdefghijklmnopqrstu' };
    const { redactionCount } = redactPayload(payload, []);
    expect(redactionCount).toBe(0);
  });

  it('accepts custom rules', () => {
    const customRules: RedactionRule[] = [
      { regex: /MY_SECRET_\w+/g, reason: 'custom_secret' },
    ];
    const payload = { val: 'MY_SECRET_TOKEN' };
    const { redacted, redactionCount, redactionEvents } = redactPayload(payload, customRules);
    expect(redactionCount).toBe(1);
    expect(redactionEvents[0].reason).toBe('custom_secret');
    expect((redacted as { val: string }).val).toBe('[REDACTED:custom_secret]');
  });

  it('multiple matches in single string accumulate count', () => {
    const payload = { msg: 'key1=sk-abcdefghijklmnopqrstu key2=sk-zyxwvutsrqponmlkjihg' };
    const { redactionCount } = redactPayload(payload, DEFAULT_RULES);
    expect(redactionCount).toBe(2);
  });

  it('originalHash differs for different matched values', () => {
    const payload = { a: 'sk-abcdefghijklmnopqrstu', b: 'sk-zyxwvutsrqponmlkjihg' };
    const { redactionEvents } = redactPayload(payload, DEFAULT_RULES);
    expect(redactionEvents).toHaveLength(2);
    expect(redactionEvents[0].originalHash).not.toBe(redactionEvents[1].originalHash);
  });

  it('non-object, non-array, non-string values pass through unchanged', () => {
    const payload = { n: 42, b: true, nil: null };
    const { redacted, redactionCount } = redactPayload(payload, DEFAULT_RULES);
    expect(redactionCount).toBe(0);
    expect((redacted as { n: number; b: boolean; nil: null }).n).toBe(42);
    expect((redacted as { n: number; b: boolean; nil: null }).b).toBe(true);
    expect((redacted as { n: number; b: boolean; nil: null }).nil).toBeNull();
  });

  it('uses DEFAULT_RULES when no rules argument passed', () => {
    const payload = { key: 'sk-abcdefghijklmnopqrstu' };
    const { redactionCount } = redactPayload(payload);
    expect(redactionCount).toBe(1);
  });
});
