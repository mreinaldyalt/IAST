import { describe, it, expect } from 'vitest';
import { diffCivilDays, resolveOfficialFields } from '../resolve';
import { OfficialRamadanRecord } from '../types';

function record(overrides: Partial<OfficialRamadanRecord> = {}): OfficialRamadanRecord {
  return {
    countryCode: 'ID',
    gregorianYear: 2025,
    hijriYear: 1446,
    officialDate: '2025-03-01',
    authority: 'Government of Indonesia',
    institution: 'Ministry of Religious Affairs (Kementerian Agama RI)',
    sourceTitle: 'title',
    sourceUrl: 'https://kemenag.go.id/x',
    sourceType: 'official_isbat_announcement',
    verificationStatus: 'verified',
    rejectionReason: null,
    verifiedBy: 'test',
    lastCheckedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('officialHistory/resolve — diffCivilDays', () => {
  it('6/7. computes a correct day difference between two civil dates', () => {
    expect(diffCivilDays('2025-03-01', '2025-02-28')).toBe(1);
    expect(diffCivilDays('2025-02-28', '2025-03-01')).toBe(-1);
    expect(diffCivilDays('2025-03-01', '2025-03-01')).toBe(0);
  });

  it('returns null when either side is missing (never a fabricated 0)', () => {
    expect(diffCivilDays(null, '2025-03-01')).toBeNull();
    expect(diffCivilDays('2025-03-01', null)).toBeNull();
    expect(diffCivilDays(null, null)).toBeNull();
  });

  it('8. is not affected by timezone — always parses as UTC midnight, including across a leap-day / month boundary', () => {
    // 2024 is a leap year; Feb 28 -> Mar 1 must be exactly 2 days apart (via Feb 29),
    // not 1, which is exactly the kind of off-by-one a naive local-time Date parse
    // could introduce depending on the host's timezone.
    expect(diffCivilDays('2024-03-01', '2024-02-28')).toBe(2);
    // A large offset like UTC+14 or UTC-12 must not shift a same-day comparison.
    expect(diffCivilDays('2026-02-19', '2026-02-19')).toBe(0);
  });
});

describe('officialHistory/resolve — resolveOfficialFields', () => {
  it('3. a `pending` record is never surfaced as a ground-truth date', () => {
    const { officialDate, officialStatus } = resolveOfficialFields(record({ verificationStatus: 'pending', officialDate: null }), true);
    expect(officialDate).toBeNull();
    expect(officialStatus).toBe('pending');
  });

  it('3b. a `candidate` record is never surfaced as a ground-truth date either', () => {
    const { officialDate } = resolveOfficialFields(record({ verificationStatus: 'candidate', officialDate: null }), true);
    expect(officialDate).toBeNull();
  });

  it('4. a year with no stored record at all resolves to officialDate=null, status pending', () => {
    const { officialDate, officialStatus } = resolveOfficialFields(null, true);
    expect(officialDate).toBeNull();
    expect(officialStatus).toBe('pending');
  });

  it('5. an unsupported country never returns a date, regardless of any record passed in', () => {
    const { officialDate, officialStatus } = resolveOfficialFields(record(), false);
    expect(officialDate).toBeNull();
    expect(officialStatus).toBe('unsupported_country');
  });

  it('a verified record resolves to its officialDate', () => {
    const { officialDate, officialStatus } = resolveOfficialFields(record(), true);
    expect(officialDate).toBe('2025-03-01');
    expect(officialStatus).toBe('verified');
  });
});
