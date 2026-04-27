import { describe, it, expect } from 'vitest';
import { utcDateStringFromTs, compareTimestamps } from '../../../src/core/audit/utc-helpers.js';

describe('utc-helpers', () => {
  describe('utcDateStringFromTs', () => {
    it('derives UTC date string from ISO 8601 timestamp', () => {
      const ts = '2026-04-27T12:34:56Z';
      expect(utcDateStringFromTs(ts)).toBe('2026-04-27');
    });

    it('handles positive timezone offset correctly (H-7 test case 1)', () => {
      // 2026-04-26T23:00:00+05:00 = 2026-04-26 18:00:00 UTC
      const ts = '2026-04-26T23:00:00+05:00';
      expect(utcDateStringFromTs(ts)).toBe('2026-04-26');
    });

    it('handles negative timezone offset correctly (H-7 test case 2)', () => {
      // 2026-04-26T23:00:00-05:00 = 2026-04-27 04:00:00 UTC
      const ts = '2026-04-26T23:00:00-05:00';
      expect(utcDateStringFromTs(ts)).toBe('2026-04-27');
    });

    it('pads single-digit month and day with zeros', () => {
      const ts = '2026-01-05T00:00:00Z';
      expect(utcDateStringFromTs(ts)).toBe('2026-01-05');
    });

    it('handles end-of-month boundary with timezone shift', () => {
      // 2026-03-31T23:00:00+01:00 = 2026-03-31 22:00:00 UTC (still March)
      const ts = '2026-03-31T23:00:00+01:00';
      expect(utcDateStringFromTs(ts)).toBe('2026-03-31');
    });

    it('handles year boundary with timezone shift', () => {
      // 2026-12-31T23:00:00+02:00 = 2026-12-31 21:00:00 UTC (still 2026)
      const ts = '2026-12-31T23:00:00+02:00';
      expect(utcDateStringFromTs(ts)).toBe('2026-12-31');
    });

    it('handles year boundary crossing with negative offset', () => {
      // 2026-12-31T23:00:00-05:00 = 2027-01-01 04:00:00 UTC (next year!)
      const ts = '2026-12-31T23:00:00-05:00';
      expect(utcDateStringFromTs(ts)).toBe('2027-01-01');
    });

    it('handles milliseconds in timestamp', () => {
      const ts = '2026-04-27T12:34:56.789Z';
      expect(utcDateStringFromTs(ts)).toBe('2026-04-27');
    });
  });

  describe('compareTimestamps', () => {
    it('returns -1 when a < b', () => {
      const a = '2026-04-26T00:00:00Z';
      const b = '2026-04-27T00:00:00Z';
      expect(compareTimestamps(a, b)).toBe(-1);
    });

    it('returns 0 when a === b', () => {
      const a = '2026-04-27T12:34:56Z';
      const b = '2026-04-27T12:34:56Z';
      expect(compareTimestamps(a, b)).toBe(0);
    });

    it('returns 1 when a > b', () => {
      const a = '2026-04-28T00:00:00Z';
      const b = '2026-04-27T00:00:00Z';
      expect(compareTimestamps(a, b)).toBe(1);
    });

    it('handles timezone offset variants correctly (H-8 lex issue)', () => {
      // Both represent the same instant: 2026-04-27T00:00:00 UTC
      // Lexicographically: '+00:00' < 'Z' in ASCII ('+' = 43, 'Z' = 90)
      const zForm = '2026-04-27T00:00:00Z';
      const offsetForm = '2026-04-27T00:00:00+00:00';
      // Numeric comparison treats them as equal (same instant)
      expect(compareTimestamps(zForm, offsetForm)).toBe(0);
    });

    it('compares correctly with positive timezone offset', () => {
      // Both timestamps are the same instant in UTC
      const utcForm = '2026-04-27T05:00:00Z';
      const offsetForm = '2026-04-27T10:00:00+05:00';
      expect(compareTimestamps(utcForm, offsetForm)).toBe(0);
    });

    it('compares correctly with negative timezone offset', () => {
      // Both timestamps are the same instant in UTC
      const utcForm = '2026-04-27T05:00:00Z';
      const offsetForm = '2026-04-27T00:00:00-05:00';
      expect(compareTimestamps(utcForm, offsetForm)).toBe(0);
    });

    it('correctly orders timestamps across timezone boundaries', () => {
      // Earlier UTC time, despite appearing later in offset form
      const a = '2026-04-26T23:00:00-05:00'; // 2026-04-27 04:00:00 UTC
      const b = '2026-04-27T12:00:00+05:00'; // 2026-04-27 07:00:00 UTC
      expect(compareTimestamps(a, b)).toBe(-1);
    });

    it('handles milliseconds correctly', () => {
      const a = '2026-04-27T12:34:56.123Z';
      const b = '2026-04-27T12:34:56.124Z';
      expect(compareTimestamps(a, b)).toBe(-1);
    });

    it('treats missing milliseconds as .000', () => {
      const a = '2026-04-27T12:34:56Z'; // .000 implicit
      const b = '2026-04-27T12:34:56.000Z';
      expect(compareTimestamps(a, b)).toBe(0);
    });
  });
});
