import { OfficialRamadanRecord } from './types';

/**
 * Pure calendar-date subtraction. Always parses as UTC midnight (explicit
 * "Z" suffix) so neither the browser's nor the server's local timezone can
 * ever shift the result by a day — inputs are plain YYYY-MM-DD civil dates,
 * not instants.
 */
export function diffCivilDays(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = new Date(a + 'T00:00:00Z').getTime();
  const tb = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((ta - tb) / 86400000);
}

export type OfficialStatus = 'verified' | 'candidate' | 'pending' | 'rejected' | 'unsupported_country';

export interface ResolvedOfficial {
  officialDate: string | null;
  officialStatus: OfficialStatus;
}

/**
 * Only a `verified` record ever produces a non-null officialDate — a
 * `pending`/`candidate`/`rejected` record (or no record at all) must never be
 * treated as ground truth, and an unsupported country must never silently
 * fall back to another country's data (the caller is responsible for passing
 * `null` as `record` when the country has no provider — this function does
 * not know about providers/countries at all, keeping it trivially testable).
 */
export function resolveOfficialFields(
  record: OfficialRamadanRecord | null,
  providerSupported: boolean
): ResolvedOfficial {
  if (!providerSupported) {
    return { officialDate: null, officialStatus: 'unsupported_country' };
  }
  if (!record) {
    return { officialDate: null, officialStatus: 'pending' };
  }
  if (record.verificationStatus === 'verified') {
    return { officialDate: record.officialDate, officialStatus: 'verified' };
  }
  return { officialDate: null, officialStatus: record.verificationStatus };
}
