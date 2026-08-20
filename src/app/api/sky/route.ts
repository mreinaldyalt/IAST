import { NextRequest, NextResponse } from 'next/server';
import { getTopoAzEl, getEclipticLon } from '@/lib/horizonsQueries';
import { DateTime } from 'luxon';

const DEFAULT_MOON_ASSET = '/assets/2d/satellite/moon.png';
const PINK_MOON_ASSET = '/assets/2d/satellite/pinkmoon.png';

type MoonBaseEvent =
  | 'new_moon'
  | 'waxing_crescent'
  | 'first_quarter'
  | 'waxing_gibbous'
  | 'full_moon'
  | 'waning_gibbous'
  | 'last_quarter'
  | 'waning_crescent';

function wrap360(v: number): number {
  return ((v % 360) + 360) % 360;
}

function clampEl(v: number): number {
  return Math.max(-90, Math.min(90, v));
}

function classifyBaseEventByDLon(dLonDeg: number): MoonBaseEvent {
  const events: MoonBaseEvent[] = [
    'new_moon',
    'waxing_crescent',
    'first_quarter',
    'waxing_gibbous',
    'full_moon',
    'waning_gibbous',
    'last_quarter',
    'waning_crescent',
  ];
  const idx = Math.floor(wrap360(dLonDeg + 22.5) / 45) % 8;
  return events[idx];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '');
    const lon = parseFloat(searchParams.get('lon') || '');
    const tz = searchParams.get('tz') || '';
    const datetimeLocal = searchParams.get('datetimeLocal') || '';

    if (Number.isNaN(lat) || Number.isNaN(lon) || !tz || !datetimeLocal) {
      return NextResponse.json(
        { error: 'Missing params: lat, lon, tz, datetimeLocal required' },
        { status: 400 }
      );
    }

    const dt = DateTime.fromISO(datetimeLocal, { zone: tz });
    if (!dt.isValid) {
      return NextResponse.json(
        { error: `Invalid datetimeLocal: ${datetimeLocal}` },
        { status: 400 }
      );
    }

    const utcDate = dt.toUTC().toJSDate();

    const [sunRes, moonRes, moonEclonRes, sunEclonRes] = await Promise.all([
      getTopoAzEl("'10'", [utcDate], lat, lon),
      getTopoAzEl("'301'", [utcDate], lat, lon),
      getEclipticLon("'301'", [utcDate]),
      getEclipticLon("'10'", [utcDate]),
    ]);

    const sun = sunRes.results[0] || { az: 0, el: 0, source: 'mock' };
    const moon = moonRes.results[0] || { az: 0, el: 0, source: 'mock' };
    const moonEcLon = moonEclonRes.results[0]?.ecLon;
    const sunEcLon = sunEclonRes.results[0]?.ecLon;

    let dLonDeg = 0;
    let baseEvent: MoonBaseEvent = 'new_moon';

    if (typeof moonEcLon === 'number' && typeof sunEcLon === 'number') {
      dLonDeg = wrap360(moonEcLon - sunEcLon);
      baseEvent = classifyBaseEventByDLon(dLonDeg);
    }

    const monthLocal = dt.month;
    const isFullMoon = baseEvent === 'full_moon';
    const isPinkMoon = isFullMoon && monthLocal === 4;
    const visualAssetPath = isPinkMoon ? PINK_MOON_ASSET : DEFAULT_MOON_ASSET;

    return NextResponse.json({
      sun: { az: wrap360(sun.az), el: clampEl(sun.el), source: sun.source },
      moon: { az: wrap360(moon.az), el: clampEl(moon.el), source: moon.source },
      moonVisualAssetPath: visualAssetPath,
      visualAssetPath,
      moonEvent: baseEvent,
      baseEvent,
      isFullMoon,
      isPinkMoon,
      moonEventDetail: {
        baseEvent,
        isFullMoon,
        monthLocal,
        isPinkMoon,
        dLonDeg,
        visualAssetPath,
      },
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
