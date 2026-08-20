import { NextRequest, NextResponse } from 'next/server';
import { predictRamadanMulti } from '@/lib/ramadanFromSyaban';
import { predictKHGTFullForGregorianYear } from '@/lib/khgtPipeline';
import { resetHorizonsCircuitBreaker } from '@/lib/horizonsClient';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '', 10);
    const latStr = searchParams.get('lat');
    const lonStr = searchParams.get('lon');
    const tz = searchParams.get('tz') || '';

    if (isNaN(year)) {
      return NextResponse.json(
        { error: 'Missing or invalid parameter: year required' },
        { status: 400 }
      );
    }

    // If lat/lon/tz provided → LOCAL mode (legacy)
    // A calculation explicitly requested by the user should get one fresh NASA
    // probe even when another data-heavy page previously opened the shared breaker.
    resetHorizonsCircuitBreaker();

    if (latStr && lonStr && tz) {
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      if (isNaN(lat) || isNaN(lon)) {
        return NextResponse.json(
          { error: 'Invalid lat/lon values' },
          { status: 400 }
        );
      }

      const multi = await predictRamadanMulti(year, lat, lon, tz);
      const response: Record<string, unknown> = {
        mode: 'local',
        year: multi.year,
        results: multi.results,
        warnings: multi.warnings,
      };
      if (multi.primary) {
        Object.assign(response, multi.primary);
      }
      return NextResponse.json(response);
    }

    // Otherwise → KHGT mode (global) — returns all Ramadan+Syawal in Gregorian year
    const results = await predictKHGTFullForGregorianYear(year);
    const emptyReason = results.length === 0
      ? `Tidak ada 1 Ramadan KHGT yang jatuh pada tahun Masehi ${year} untuk scope endpoint berbasis Gregorian-year.`
      : null;
    return NextResponse.json({
      year,
      results,
      resultScope: 'gregorian-year',
      emptyReason,
    });
  } catch (err) {
    console.error('Predict error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
