import { describe, it, expect } from 'vitest';
import { dateToJD, jdToDate, parseSOE } from '@/lib/horizonsClient';

describe('horizonsClient', () => {
  describe('dateToJD', () => {
    it('should convert J2000.0 epoch correctly', () => {
      const j2000 = new Date('2000-01-01T12:00:00Z');
      expect(dateToJD(j2000)).toBeCloseTo(2451545.0, 3);
    });

    it('should convert a known date', () => {
      // 2029-01-14T12:00:00Z -> JD 2462151.0
      const d = new Date('2029-01-14T12:00:00Z');
      const jd = dateToJD(d);
      expect(jd).toBeCloseTo(2462151.0, 0);
    });
  });

  describe('jdToDate', () => {
    it('should convert J2000.0 back to date', () => {
      const d = jdToDate(2451545.0);
      expect(d.getUTCFullYear()).toBe(2000);
      expect(d.getUTCMonth()).toBe(0); // January
      expect(d.getUTCDate()).toBe(1);
    });
  });

  describe('parseSOE', () => {
    it('should parse $$SOE..$$EOE block with ecliptic longitude', () => {
      const result = `some header text
$$SOE
 2029-Jan-14 12:00:00.000,  296.12345678,
 2029-Jan-14 18:00:00.000,  296.45678901,
$$EOE
some footer text`;

      const parsed = parseSOE(result);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].values[0]).toBeCloseTo(296.123, 2);
      expect(parsed[1].values[0]).toBeCloseTo(296.457, 2);
    });

    it('should parse AZ/EL data', () => {
      const result = `header
$$SOE
 2029-Jan-14 11:00:00.000,  288.123456,  -0.833000,
$$EOE
footer`;

      const parsed = parseSOE(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].values[0]).toBeCloseTo(288.123, 2); // AZ
      expect(parsed[0].values[1]).toBeCloseTo(-0.833, 2); // EL
    });

    it('should throw on missing markers', () => {
      expect(() => parseSOE('no markers here')).toThrow('$$SOE');
    });
  });
});
