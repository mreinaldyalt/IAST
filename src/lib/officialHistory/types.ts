/**
 * Shared types for the official-history persistence layer (variable C: real
 * government-announced 1 Ramadan dates, per country).
 *
 * NOT the same as data/ground_truth_muhammadiyah.json (Muhammadiyah's own
 * organizational calendar) — this store is exclusively for verified
 * government/official-authority announcements. See officialHistory/README.md.
 */

export type VerificationStatus = 'pending' | 'candidate' | 'verified' | 'rejected';

export interface OfficialRamadanRecord {
  countryCode: string; // ISO 3166-1 alpha-2, uppercase, e.g. "ID"
  gregorianYear: number;
  hijriYear: number | null;
  officialDate: string | null; // YYYY-MM-DD civil date, null unless verified
  authority: string | null; // e.g. "Government of Indonesia"
  institution: string | null; // e.g. "Ministry of Religious Affairs (Kementerian Agama RI)"
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceType: string | null; // e.g. "official_isbat_announcement"
  verificationStatus: VerificationStatus;
  rejectionReason: string | null;
  verifiedBy: string | null; // free text provenance, e.g. "ai-research-2026-07-07" or "admin-manual"
  lastCheckedAt: string | null; // ISO datetime — throttles re-check attempts
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/** Rank used to decide whether an upsert is allowed to overwrite an existing record. */
export const STATUS_RANK: Record<VerificationStatus, number> = {
  pending: 0,
  rejected: 0,
  candidate: 1,
  verified: 2,
};
