import { NextRequest, NextResponse } from 'next/server';
import { predictRamadanMulti } from '@/lib/ramadanFromSyaban';
import { predictKHGTFullForGregorianYear } from '@/lib/khgtPipeline';
import { ensureOfficialHistoryInitialized } from '@/lib/officialHistory/bootstrap';
import { getRecord } from '@/lib/officialHistory/store';
import { getProviderForCountry } from '@/lib/officialHistory/providers';
import { maybeRefreshInBackground } from '@/lib/officialHistory/updater';
import { diffCivilDays, resolveOfficialFields, OfficialStatus } from '@/lib/officialHistory/resolve';

/**
 * GET /api/evaluate?fromYear=X&toYear=Y&lat=L&lon=L&tz=T&countryCode=CC
 *
 * Three independent variables per year, all optional-if-missing so a failure
 * in any one never hides the other two:
 *   A. khgtDate      — KHGT global witness-grid computation (predictKHGTFullForGregorianYear)
 *   B. localDate     — Wujudul Hilal at the user's lat/lon (predictRamadanMulti)
 *   C. officialDate  — verified government announcement for the detected country
 *                       (officialHistory store) — null if unverified/unsupported,
 *                       NEVER a guessed/predicted date.
 *
 * `countryCode` is detected client-side once per location change (see
 * evaluasi/page.tsx + /api/geocode/reverse) and passed in here — this route
 * does not re-detect it per year/request.
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromYear = parseInt(searchParams.get('fromYear') || '', 10);
    const toYear = parseInt(searchParams.get('toYear') || '', 10);
    const lat = parseFloat(searchParams.get('lat') || '-6.2088');
    const lon = parseFloat(searchParams.get('lon') || '106.8456');
    const tz = searchParams.get('tz') || 'Asia/Jakarta';
    const countryCode = searchParams.get('countryCode');

    if (isNaN(fromYear) || isNaN(toYear)) {
      return NextResponse.json(
        { error: 'Missing parameters: fromYear, toYear required' },
        { status: 400 }
      );
    }

    if (fromYear > toYear) {
      return NextResponse.json(
        { error: `Invalid range: fromYear (${fromYear}) > toYear (${toYear})` },
        { status: 400 }
      );
    }

    ensureOfficialHistoryInitialized();
    const provider = getProviderForCountry(countryCode);

    interface EvalItem {
      year: number;
      khgtDate: string | null;
      witness: string | null;
      localDate: string | null;
      officialDate: string | null;
      officialCountryCode: string | null;
      officialAuthority: string | null;
      officialInstitution: string | null;
      officialStatus: OfficialStatus;
      officialSourceUrl: string | null;
      khgtVsLocalDays: number | null;
      khgtVsOfficialDays: number | null;
      localVsOfficialDays: number | null;
      /** 'live' unless NASA HORIZONS was unreachable and the pipeline fell back to
       *  estimated data — surfaced so the UI never presents a mock date as authoritative. */
      khgtDataSource: string | null;
      localDataSource: string | null;
    }

    // Each year is independent, and within a year the KHGT (global) and Local pipelines
    // are independent of each other — run everything concurrently instead of one
    // year/pipeline at a time. horizonsClient's own semaphore (MAX_CONCURRENCY=4)
    // still throttles actual NASA traffic, so this only improves utilization of
    // previously-idle wait time, not the request rate against NASA.
    async function computeYear(y: number) {
      const [khgtResult, localResult] = await Promise.allSettled([
        predictKHGTFullForGregorianYear(y),
        predictRamadanMulti(y, lat, lon, tz),
      ]);

      // KHGT: may return 0, 1, or 2 results per Gregorian year
      let khgtRows: Array<{ khgtDate: string; witness: string | null; dataSource: string }> = [];
      if (khgtResult.status === 'fulfilled') {
        khgtRows = khgtResult.value.map(f => ({
          khgtDate: f.ramadan.khgtStartCivilDate,
          witness: f.ramadan.witness?.name ?? null,
          dataSource: f.ramadan.dataSource,
        }));
      } else {
        console.warn(`KHGT failed for ${y}:`, khgtResult.reason?.message);
      }

      // Local: may return 0, 1, or 2 results per Gregorian year
      let localRows: Array<{ date: string; dataSource: string }> = [];
      if (localResult.status === 'fulfilled') {
        localRows = localResult.value.results
          .filter(r => r.ramadan1LocalDate.startsWith(`${y}-`))
          .map(r => ({ date: r.ramadan1LocalDate, dataSource: r.dataSource }));
        localRows.sort((a, b) => a.date.localeCompare(b.date));
      } else {
        console.warn(`Local failed for ${y}:`, localResult.reason?.message);
      }

      // C: official government history — a storage read, never live/blocking.
      // A missing/unsupported/unverified entry must never take down A or B above.
      let official: ReturnType<typeof getRecord> = null;
      if (provider) {
        official = getRecord(provider.countryCode, y);
        // Kick a background refresh if applicable — never awaited, never blocks
        // this response (see updater.ts for the throttling/observation-window rules).
        maybeRefreshInBackground(provider.countryCode, y);
      }

      return { year: y, khgtRows, localRows, official, providerSupported: !!provider };
    }

    const years: number[] = [];
    for (let y = fromYear; y <= toYear; y++) years.push(y);
    const perYear = await Promise.all(years.map(computeYear));

    const items: EvalItem[] = [];
    for (const { year: y, khgtRows, localRows, official, providerSupported } of perYear) {
      // Pair KHGT and local rows
      const n = Math.max(khgtRows.length, localRows.length, 1);

      const { officialDate, officialStatus } = resolveOfficialFields(official, providerSupported);

      for (let i = 0; i < n; i++) {
        const khgtDate = khgtRows[i]?.khgtDate ?? null;
        const witness = khgtRows[i]?.witness ?? null;
        const localDate = localRows[i]?.date ?? null;

        items.push({
          year: y,
          khgtDate,
          witness,
          localDate,
          officialDate,
          officialCountryCode: provider?.countryCode ?? null,
          officialAuthority: officialDate ? official?.authority ?? null : null,
          officialInstitution: officialDate ? official?.institution ?? null : null,
          officialStatus,
          officialSourceUrl: official?.sourceUrl ?? null,
          khgtVsLocalDays: diffCivilDays(khgtDate, localDate),
          khgtVsOfficialDays: diffCivilDays(khgtDate, officialDate),
          localVsOfficialDays: diffCivilDays(localDate, officialDate),
          khgtDataSource: khgtRows[i]?.dataSource ?? null,
          localDataSource: localRows[i]?.dataSource ?? null,
        });
      }
    }

    return NextResponse.json({
      items,
      fromYear,
      toYear,
      local: { lat, lon, tz },
      official: provider
        ? { countryCode: provider.countryCode, countryName: provider.countryName, authority: provider.authority, institution: provider.institution, supported: true }
        : { countryCode: countryCode ?? null, countryName: null, authority: null, institution: null, supported: false },
    });
  } catch (err) {
    console.error('Evaluate GET error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
