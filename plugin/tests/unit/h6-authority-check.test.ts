import { describe, it, expect } from 'vitest';
import {
  parseAuthorizationLine,
  parseAuthorizationFile,
  findMatchingAuthorization,
} from '../../src/hooks/h6-step-reexec/authority-check.js';

describe('H6 authority-check', () => {
  describe('parseAuthorizationLine', () => {
    it('parses minimal trailer', () => {
      const out = parseAuthorizationLine('Step-Re-Execution: gate-44 reason "retry"');
      expect(out).not.toBeNull();
      expect(out?.gateRef).toBe('gate-44');
      expect(out?.rationale).toBe('retry');
      expect(out?.stepIdMatch).toBeUndefined();
      expect(out?.hashMatch).toBeUndefined();
    });

    it('parses gate-NN-descriptor form', () => {
      const out = parseAuthorizationLine(
        'Step-Re-Execution: gate-44-h6-implementation reason "deliberate replay"',
      );
      expect(out?.gateRef).toBe('gate-44-h6-implementation');
      expect(out?.rationale).toBe('deliberate replay');
    });

    it('parses optional step_id and hash references', () => {
      const out = parseAuthorizationLine(
        'Step-Re-Execution: gate-44 reason "x" step_id=Write::a.ts hash=sha256:abc123',
      );
      expect(out?.stepIdMatch).toBe('Write::a.ts');
      expect(out?.hashMatch).toBe('sha256:abc123');
    });

    it('returns null when prefix missing', () => {
      expect(parseAuthorizationLine('not a trailer')).toBeNull();
    });

    it('returns null when gate token missing', () => {
      expect(parseAuthorizationLine('Step-Re-Execution: nogate reason "x"')).toBeNull();
    });

    it('returns null when rationale missing', () => {
      expect(parseAuthorizationLine('Step-Re-Execution: gate-44 no reason here')).toBeNull();
    });

    it('preserves the raw line for audit logging', () => {
      const line = 'Step-Re-Execution: gate-44 reason "audit me"';
      expect(parseAuthorizationLine(line)?.rawLine).toBe(line);
    });

    it('tolerates leading/trailing whitespace', () => {
      const out = parseAuthorizationLine(
        '   Step-Re-Execution: gate-44 reason "ws"   ',
      );
      expect(out?.gateRef).toBe('gate-44');
    });
  });

  describe('parseAuthorizationFile', () => {
    it('parses multiple lines and skips non-trailer lines', () => {
      const content = [
        '# comment',
        '',
        'Step-Re-Execution: gate-44 reason "first"',
        'noise line',
        'Step-Re-Execution: gate-45 reason "second"',
      ].join('\n');
      const out = parseAuthorizationFile(content);
      expect(out).toHaveLength(2);
      expect(out[0].gateRef).toBe('gate-44');
      expect(out[1].gateRef).toBe('gate-45');
    });

    it('returns empty array on empty content', () => {
      expect(parseAuthorizationFile('')).toEqual([]);
    });

    it('handles CRLF line endings', () => {
      const out = parseAuthorizationFile(
        'Step-Re-Execution: gate-44 reason "x"\r\nStep-Re-Execution: gate-45 reason "y"\r\n',
      );
      expect(out).toHaveLength(2);
    });
  });

  describe('findMatchingAuthorization', () => {
    const pending = { stepId: 'Write::a.ts', hashOfInputs: 'sha256:abc' };

    it('matches when no step_id/hash refinement', () => {
      const auths = [
        {
          gateRef: 'gate-44',
          rationale: 'r',
          rawLine: 'x',
          stepIdMatch: undefined,
          hashMatch: undefined,
        },
      ];
      expect(findMatchingAuthorization(auths, pending)?.gateRef).toBe('gate-44');
    });

    it('matches when step_id matches', () => {
      const auths = [
        {
          gateRef: 'gate-44',
          rationale: 'r',
          rawLine: 'x',
          stepIdMatch: 'Write::a.ts',
          hashMatch: undefined,
        },
      ];
      expect(findMatchingAuthorization(auths, pending)).not.toBeNull();
    });

    it('rejects when step_id mismatches', () => {
      const auths = [
        {
          gateRef: 'gate-44',
          rationale: 'r',
          rawLine: 'x',
          stepIdMatch: 'Write::other.ts',
          hashMatch: undefined,
        },
      ];
      expect(findMatchingAuthorization(auths, pending)).toBeNull();
    });

    it('rejects when hash mismatches', () => {
      const auths = [
        {
          gateRef: 'gate-44',
          rationale: 'r',
          rawLine: 'x',
          stepIdMatch: undefined,
          hashMatch: 'sha256:wrong',
        },
      ];
      expect(findMatchingAuthorization(auths, pending)).toBeNull();
    });

    it('returns null on empty list', () => {
      expect(findMatchingAuthorization([], pending)).toBeNull();
    });

    it('returns the first matching authorization when multiple present', () => {
      const auths = [
        { gateRef: 'gate-44', rationale: 'a', rawLine: 'x' },
        { gateRef: 'gate-45', rationale: 'b', rawLine: 'y' },
      ];
      expect(findMatchingAuthorization(auths, pending)?.gateRef).toBe('gate-44');
    });
  });
});
