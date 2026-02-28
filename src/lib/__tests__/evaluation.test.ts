import { describe, it, expect } from 'vitest';
import { evaluate } from '@/lib/evaluation';

describe('evaluation', () => {
  const gt = [
    { year: 2025, ramadan1: '2025-03-01' },
    { year: 2026, ramadan1: '2026-02-18' },
    { year: 2027, ramadan1: '2027-02-08' },
  ];

  it('should return all SKIPPED when no predictions', () => {
    const result = evaluate(new Map(), gt);
    expect(result.totalSkipped).toBe(3);
    expect(result.totalOk).toBe(0);
    expect(result.totalFail).toBe(0);
    expect(result.accuracy).toBe('N/A');
  });

  it('should return OK for matching predictions', () => {
    const preds = new Map<number, string>();
    preds.set(2025, '2025-03-01');
    preds.set(2026, '2026-02-18');

    const result = evaluate(preds, gt);
    expect(result.totalOk).toBe(2);
    expect(result.totalFail).toBe(0);
    expect(result.totalSkipped).toBe(1);
    expect(result.accuracy).toBe('100.0%');
  });

  it('should return FAIL for non-matching', () => {
    const preds = new Map<number, string>();
    preds.set(2025, '2025-03-02'); // off by 1

    const result = evaluate(preds, gt);
    expect(result.totalOk).toBe(0);
    expect(result.totalFail).toBe(1);
    expect(result.totalSkipped).toBe(2);
    expect(result.accuracy).toBe('0.0%');
  });
});
