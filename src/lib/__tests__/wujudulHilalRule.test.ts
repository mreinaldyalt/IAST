import { describe, it, expect } from 'vitest';
import { checkWujudulHilal } from '@/lib/wujudulHilalRule';

describe('wujudulHilalRule', () => {
  it('should fulfill when conjunction before sunset AND moon alt > 0', () => {
    const result = checkWujudulHilal({
      conjunctionUTC: new Date('2029-01-14T16:00:00Z'),
      sunsetUTC: new Date('2029-01-14T18:00:00Z'),
      moonAltAtSunsetDeg: 2.5,
      candidateDate: '2029-01-14',
    });

    expect(result.ruleA).toBe(true);
    expect(result.ruleB).toBe(true);
    expect(result.fulfilled).toBe(true);
    expect(result.isBorderline).toBe(false);
  });

  it('should NOT fulfill when conjunction AFTER sunset', () => {
    const result = checkWujudulHilal({
      conjunctionUTC: new Date('2029-01-14T20:00:00Z'),
      sunsetUTC: new Date('2029-01-14T18:00:00Z'),
      moonAltAtSunsetDeg: 2.5,
      candidateDate: '2029-01-14',
    });

    expect(result.ruleA).toBe(false);
    expect(result.ruleB).toBe(true);
    expect(result.fulfilled).toBe(false);
  });

  it('should NOT fulfill when moon alt <= 0', () => {
    const result = checkWujudulHilal({
      conjunctionUTC: new Date('2029-01-14T16:00:00Z'),
      sunsetUTC: new Date('2029-01-14T18:00:00Z'),
      moonAltAtSunsetDeg: -1.2,
      candidateDate: '2029-01-14',
    });

    expect(result.ruleA).toBe(true);
    expect(result.ruleB).toBe(false);
    expect(result.fulfilled).toBe(false);
  });

  it('should flag borderline when |moonAlt| <= 0.2', () => {
    const result = checkWujudulHilal({
      conjunctionUTC: new Date('2029-01-14T16:00:00Z'),
      sunsetUTC: new Date('2029-01-14T18:00:00Z'),
      moonAltAtSunsetDeg: 0.15,
      candidateDate: '2029-01-14',
    });

    expect(result.fulfilled).toBe(true);
    expect(result.isBorderline).toBe(true);
  });

  it('should flag borderline when moonAlt is -0.1', () => {
    const result = checkWujudulHilal({
      conjunctionUTC: new Date('2029-01-14T16:00:00Z'),
      sunsetUTC: new Date('2029-01-14T18:00:00Z'),
      moonAltAtSunsetDeg: -0.1,
      candidateDate: '2029-01-14',
    });

    expect(result.fulfilled).toBe(false);
    expect(result.isBorderline).toBe(true);
  });

  it('should NOT fulfill when both rules fail', () => {
    const result = checkWujudulHilal({
      conjunctionUTC: new Date('2029-01-14T20:00:00Z'),
      sunsetUTC: new Date('2029-01-14T18:00:00Z'),
      moonAltAtSunsetDeg: -3.0,
      candidateDate: '2029-01-14',
    });

    expect(result.ruleA).toBe(false);
    expect(result.ruleB).toBe(false);
    expect(result.fulfilled).toBe(false);
    expect(result.isBorderline).toBe(false);
  });
});
