import { getProviderForCountry } from './providers';
import { validateOfficialAnnouncement } from './validator';
import { upsertRecord, touchLastChecked, getRecord } from './store';
import { OfficialRamadanRecord } from './types';

/**
 * Extract <title>, og:title, and og:description from raw HTML via regex.
 *
 * Deliberately not a full HTML/DOM parser — this project has no such
 * dependency, and government press-release pages (checked live against
 * kemenag.go.id) render their <head> metadata server-side even though the
 * rest of the page is a client-rendered Next.js app, so these three tags are
 * reliably present without needing a headless browser.
 */
function extractMetaText(html: string): string {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
  const ogTitle = html.match(/property=["']og:title["']\s+content=["']([^"']*)["']/i)?.[1] ?? '';
  const ogDesc = html.match(/property=["']og:description["']\s+content=["']([^"']*)["']/i)?.[1] ?? '';
  return [title, ogTitle, ogDesc].filter(Boolean).join(' | ');
}

/**
 * Records a failed check attempt (network error, timeout, or non-OK HTTP
 * response) without ever fabricating a date. If a record already exists it's
 * left as-is (just lastCheckedAt touched); if this is the very first attempt
 * for this year, creates a `pending` stub so the UI has something to key off
 * ("menunggu penetapan resmi") instead of an absent row.
 */
function recordFailedAttempt(
  countryCode: string,
  gregorianYear: number,
  sourceUrl: string,
  reason: string
): OfficialRamadanRecord {
  touchLastChecked(countryCode, gregorianYear);
  const existing = getRecord(countryCode, gregorianYear);
  if (existing) return existing;

  return upsertRecord({
    countryCode,
    gregorianYear,
    hijriYear: null,
    officialDate: null,
    authority: null,
    institution: null,
    sourceTitle: null,
    sourceUrl,
    sourceType: null,
    verificationStatus: 'pending',
    rejectionReason: reason,
    verifiedBy: null,
    lastCheckedAt: new Date().toISOString(),
  });
}

/**
 * Fetch one candidate URL and run it through the strict validator, storing
 * whatever the result is (verified / candidate / rejected). Never throws —
 * a fetch failure just leaves the record at its current status with
 * lastCheckedAt touched, so the source being temporarily down cannot corrupt
 * or block anything.
 */
export async function fetchAndValidateCandidate(
  countryCode: string,
  gregorianYear: number,
  sourceUrl: string
): Promise<OfficialRamadanRecord | null> {
  const provider = getProviderForCountry(countryCode);
  if (!provider) return null;

  try {
    const resp = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'InternationalAstronomicalStudies/1.0 (academic research)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      return recordFailedAttempt(countryCode, gregorianYear, sourceUrl, `Sumber merespons HTTP ${resp.status}.`);
    }
    const html = await resp.text();
    const text = extractMetaText(html);

    const result = validateOfficialAnnouncement({
      text,
      sourceUrl,
      allowedDomains: provider.allowedDomains,
      expectedGregorianYear: gregorianYear,
    });

    return upsertRecord({
      countryCode,
      gregorianYear,
      hijriYear: result.extractedHijriYear,
      officialDate: result.extractedDate,
      authority: result.status === 'verified' ? provider.authority : null,
      institution: result.status === 'verified' ? provider.institution : null,
      sourceTitle: text.split(' | ')[0] || null,
      sourceUrl,
      sourceType: 'official_isbat_announcement',
      verificationStatus: result.status,
      rejectionReason: result.status === 'rejected' ? result.reason : null,
      verifiedBy: result.status === 'verified' ? 'auto-validator' : null,
      lastCheckedAt: new Date().toISOString(),
    });
  } catch (err) {
    return recordFailedAttempt(countryCode, gregorianYear, sourceUrl, `Gagal mengambil sumber: ${(err as Error).message}`);
  }
}
