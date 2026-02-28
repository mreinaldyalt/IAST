import { NextRequest, NextResponse } from 'next/server';
import { getTopoAzEl } from '@/lib/horizonsQueries';
import { DateTime } from 'luxon';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '');
    const lon = parseFloat(searchParams.get('lon') || '');
    const tz = searchParams.get('tz') || '';
    const datetimeLocal = searchParams.get('datetimeLocal') || '';

    if (isNaN(lat) || isNaN(lon) || !tz || !datetimeLocal) {
      return NextResponse.json(
        { error: 'Missing params: lat, lon, tz, datetimeLocal required' },
        { status: 400 }
      );
    }

    // Parse local datetime to UTC
    const dt = DateTime.fromISO(datetimeLocal, { zone: tz });
    if (!dt.isValid) {
      return NextResponse.json(
        { error: `Invalid datetimeLocal: ${datetimeLocal}` },
        { status: 400 }
      );
    }

    const utcDate = dt.toUTC().toJSDate();

    // Query HORIZONS for Sun and Moon topocentric AZ/EL
    const [sunRes, moonRes] = await Promise.all([
      getTopoAzEl("'10'", [utcDate], lat, lon),
      getTopoAzEl("'301'", [utcDate], lat, lon),
    ]);

    const sun = sunRes.results[0] || { az: 0, el: 0, source: 'mock' };
    const moon = moonRes.results[0] || { az: 0, el: 0, source: 'mock' };

    // Normalize: az → [0, 360), el → [-90, 90]
    const normAz = (v: number) => ((v % 360) + 360) % 360;
    const clampEl = (v: number) => Math.max(-90, Math.min(90, v));

    return NextResponse.json({
      sun: { az: normAz(sun.az), el: clampEl(sun.el), source: sun.source },
      moon: { az: normAz(moon.az), el: clampEl(moon.el), source: moon.source },
      datetimeUTC: utcDate.toISOString(),
      datetimeLocal,
      lat,
      lon,
      tz,
    });
  } catch (err) {
    console.error('Sky error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
