import { getProviderForCountry } from './providers';
import { getRecord } from './store';
import { fetchAndValidateCandidate } from './fetchAndValidate';

/**
 * Lightweight, no-headless-browser discovery of NEW official-announcement
 * candidate URLs, via each provider's public XML sitemaps.
 *
 * Why sitemaps and not the site's own article-listing pages: verified live
 * (see chat) that kemenag.go.id's listing/tag pages (e.g. /tag/sidang-isbat)
 * render their article list client-side — a plain fetch() sees an empty
 * shell, nothing to parse without a real browser. Its XML sitemaps
 * (kemenag.go.id/sitemap.xml, sitemap-articles.xml, sitemap-informations.xml
 * — all listed in robots.txt) are plain server-rendered XML with <loc> and
 * <lastmod> per article, refreshed as new content is published. That's
 * sufficient to notice a brand-new press release without ever needing to
 * render JavaScript.
 *
 * Limitation this does NOT solve: these sitemaps are rolling/recent-only
 * (observed: sitemap-articles.xml holds roughly the last ~20 articles /
 * ~1 day of publishing), not a full historical archive — fine for catching a
 * NEW announcement as it's published, useless for backfilling old years
 * (which is what the manual seed + admin fallback are for instead).
 */

const KEYWORD_PATTERN = /ramad(h)?an|isbat/i;
const GREGORIAN_YEAR_PATTERN = /20\d{2}/g;

async function fetchSitemapLocs(sitemapUrl: string): Promise<string[]> {
  try {
    const resp = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'InternationalAstronomicalStudies/1.0 (academic research)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    return [...xml.matchAll(/<loc>([^<]*)<\/loc>/gi)].map((m) => m[1]);
  } catch {
    return [];
  }
}

/**
 * Announcement slugs consistently spell out the Gregorian date, e.g.
 * ".../pemerintah-tetapkan-1-ramadan-1447-h-jatuh-pada-19-februari-2026-...".
 * The Hijri year (e.g. 1447) never matches /20\d{2}/, so taking the LAST
 * 20xx-shaped number in the URL reliably picks the Gregorian year, not the
 * Hijri one.
 */
function extractGregorianYearFromUrl(url: string): number | null {
  const matches = url.match(GREGORIAN_YEAR_PATTERN);
  if (!matches || matches.length === 0) return null;
  return parseInt(matches[matches.length - 1], 10);
}

function isAllowedDomain(url: string, allowedDomains: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowedDomains.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Scans the provider's sitemaps for Ramadan/Isbat-looking URLs and runs any
 * new ones through the existing validator. Must only be called from the
 * scheduler/sweep (never from a request handler) — see updater.ts.
 *
 * Skips a candidate when:
 *   - its URL isn't on an allowed official domain (defense in depth; the
 *     validator would reject it anyway, but no point fetching it twice)
 *   - the Gregorian year can't be determined from the slug
 *   - that year already has a `verified` record (never re-checked — terminal)
 *   - that exact URL was already tried and is on file with any status (avoids
 *     reprocessing/duplicating work across sweep runs; a genuinely different
 *     candidate URL for the same year is still tried)
 */
export async function discoverAndValidateNewSources(countryCode: string): Promise<number> {
  const provider = getProviderForCountry(countryCode);
  if (!provider) return 0;

  const sitemapUrls = [
    'https://kemenag.go.id/sitemap.xml',
    'https://kemenag.go.id/sitemap-articles.xml',
    'https://kemenag.go.id/sitemap-informations.xml',
  ];

  const allLocs = new Set<string>();
  for (const sitemapUrl of sitemapUrls) {
    for (const loc of await fetchSitemapLocs(sitemapUrl)) allLocs.add(loc);
  }

  const candidates = [...allLocs].filter(
    (url) => KEYWORD_PATTERN.test(url) && isAllowedDomain(url, provider.allowedDomains)
  );

  let processed = 0;
  for (const url of candidates) {
    const year = extractGregorianYearFromUrl(url);
    if (!year) continue;

    const existing = getRecord(countryCode, year);
    if (existing?.verificationStatus === 'verified') continue; // terminal — never re-checked
    if (existing?.sourceUrl === url) continue; // already attempted this exact URL before

    await fetchAndValidateCandidate(countryCode, year, url);
    processed++;
  }
  return processed;
}
