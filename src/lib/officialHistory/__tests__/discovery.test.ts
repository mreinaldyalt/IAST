import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { __setStoreFilePathForTesting, upsertRecord, getRecord } from '../store';
import { discoverAndValidateNewSources } from '../discovery';

let tmpFile: string;
const originalFetch = global.fetch;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `official-history-discovery-test-${Date.now()}-${Math.random()}.json`);
  __setStoreFilePathForTesting(tmpFile);
});

afterEach(() => {
  __setStoreFilePathForTesting(null);
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  global.fetch = originalFetch;
});

function sitemapXml(locs: string[]): string {
  const entries = locs.map((l) => `<url><loc>${l}</loc><lastmod>2026-02-01T00:00:00.000Z</lastmod></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
}

/** Fakes: 3 sitemap fetches (matching discovery.ts's hardcoded list) then, for
 *  any candidate URL discovery decides to validate, a page fetch returning
 *  HTML with a <title> the validator can read. */
function mockFetchWith(sitemapLocs: string[], pageTitlesByUrl: Record<string, string>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('sitemap')) {
      return { ok: true, text: async () => sitemapXml(sitemapLocs) } as Response;
    }
    const title = pageTitlesByUrl[url] ?? '';
    return { ok: true, text: async () => `<html><head><title>${title}</title></head><body></body></html>` } as Response;
  }) as unknown as typeof fetch;
}

describe('officialHistory/discovery', () => {
  it('finds a genuine new Ramadan announcement URL and stores it as verified via the existing validator', async () => {
    const url = 'https://kemenag.go.id/pers-rilis/pemerintah-tetapkan-1-ramadan-1449-h-jatuh-pada-5-januari-2028-xYz12';
    mockFetchWith(
      ['https://kemenag.go.id/nasional/unrelated-article-abc', url],
      { [url]: 'Pemerintah Tetapkan 1 Ramadan 1449 H Jatuh pada 5 Januari 2028' }
    );

    const processed = await discoverAndValidateNewSources('ID');
    expect(processed).toBe(1);

    const rec = getRecord('ID', 2028);
    expect(rec?.verificationStatus).toBe('verified');
    expect(rec?.officialDate).toBe('2028-01-05');
    expect(rec?.sourceUrl).toBe(url);
  });

  it('ignores sitemap URLs unrelated to Ramadan/Isbat entirely', async () => {
    mockFetchWith(['https://kemenag.go.id/nasional/kemenag-siapkan-pedoman-lgbtq-abc'], {});
    const processed = await discoverAndValidateNewSources('ID');
    expect(processed).toBe(0);
  });

  it('never re-checks a year that already has a `verified` record (terminal)', async () => {
    upsertRecord({
      countryCode: 'ID',
      gregorianYear: 2028,
      hijriYear: 1449,
      officialDate: '2028-01-05',
      authority: 'Government of Indonesia',
      institution: 'Ministry of Religious Affairs (Kementerian Agama RI)',
      sourceTitle: 'existing verified',
      sourceUrl: 'https://kemenag.go.id/pers-rilis/original-url',
      sourceType: 'official_isbat_announcement',
      verificationStatus: 'verified',
      rejectionReason: null,
      verifiedBy: 'test',
      lastCheckedAt: null,
    });

    const newUrl = 'https://kemenag.go.id/pers-rilis/pemerintah-tetapkan-1-ramadan-1449-h-jatuh-pada-6-januari-2028-different';
    mockFetchWith([newUrl], { [newUrl]: 'Pemerintah Tetapkan 1 Ramadan 1449 H Jatuh pada 6 Januari 2028' });

    const processed = await discoverAndValidateNewSources('ID');
    expect(processed).toBe(0); // skipped — year already verified
    // Original verified record must be untouched by the newly-discovered (different) URL.
    const rec = getRecord('ID', 2028);
    expect(rec?.sourceUrl).toBe('https://kemenag.go.id/pers-rilis/original-url');
  });

  it('never even attempts a discovered URL from a non-official domain, even if the slug mentions Ramadan', async () => {
    const url = 'https://random-blog.example.com/prediksi-1-ramadan-1449-jatuh-5-januari-2028';
    mockFetchWith([url], { [url]: 'Prediksi 1 Ramadan 1449 H Jatuh pada 5 Januari 2028' });

    const processed = await discoverAndValidateNewSources('ID');
    expect(processed).toBe(0); // filtered out by domain allowlist before ever being fetched
    expect(getRecord('ID', 2028)).toBeNull();
  });

  it('does not duplicate work for the exact same URL across two discovery runs', async () => {
    const url = 'https://kemenag.go.id/pers-rilis/pemerintah-tetapkan-1-ramadan-1449-h-jatuh-pada-5-januari-2028-xYz12';
    mockFetchWith([url], { [url]: 'Pemerintah Tetapkan 1 Ramadan 1449 H Jatuh pada 5 Januari 2028' });

    const first = await discoverAndValidateNewSources('ID');
    const second = await discoverAndValidateNewSources('ID');
    expect(first).toBe(1);
    expect(second).toBe(0); // same URL already on file from the first run — not reprocessed
  });
});
