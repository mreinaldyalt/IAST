import { NextRequest, NextResponse } from 'next/server';
import { computeParade } from '@/lib/parade/paradePipeline';
import { findParadeEventsInRange, type ParadeCatalogEvent } from '@/lib/parade/annualCandidate';
import { PARADE_EVENTS } from '@/lib/astronomyEvents';

export const runtime = 'nodejs';
export const maxDuration = 60;

const searchCache = new Map<string, Awaited<ReturnType<typeof findParadeEventsInRange>>>();

/**
 * GET /api/parade?date=YYYY-MM-DD[&lat&lon&name][&hMin&sMax&epsMin&nMin&dt][&verify=0]
 * Menghitung parade planet untuk hari sipil D: lokasi terbaik global + (opsional)
 * lokasi user, memakai data NASA JPL Horizons (RA/Dec #2, ObsEcLon #31) + konversi
 * Alt/Az lokal, verifikasi topocentric #4 untuk kandidat teratas.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') || '';
    const months = Number.parseInt(searchParams.get('months') ?? '', 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(start) && [3, 6, 12, 24].includes(months)) {
      const cacheKey = `${start}:${months}`;
      const cached = searchCache.get(cacheKey);
      if (cached) return NextResponse.json({ start, months, events: cached, cached: true });
      const from = new Date(`${start}T00:00:00.000Z`);
      const to = new Date(from);
      to.setUTCMonth(to.getUTCMonth() + months);
      const verified: ParadeCatalogEvent[] = PARADE_EVENTS.filter((event) => {
        const time = Date.parse(`${event.date}T12:00:00.000Z`);
        return time >= from.getTime() && time < to.getTime();
      }).map((event) => ({
        date: event.date,
        planetCount: Number.parseInt(event.label.match(/Parade\s+(\d+)/i)?.[1] ?? '4', 10),
        participants: (event.date === '2026-08-12' ? ['mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune'] : []) as ParadeCatalogEvent['participants'],
        nakedEyeCount: event.date === '2026-08-12' ? 4 : 4,
        aidedCount: event.date === '2026-08-12' ? 2 : 0,
        spanDeg: 0,
        source: 'cache',
      }));
      let scanned: Awaited<ReturnType<typeof findParadeEventsInRange>> = [];
      let scanSucceeded = false;
      try {
        scanned = await findParadeEventsInRange(from, to);
        scanSucceeded = true;
      } catch (error) {
        if (verified.length === 0) throw error;
      }
      const events = [...verified, ...scanned.filter((candidate) => !verified.some((event) => Math.abs(Date.parse(`${event.date}T12:00:00.000Z`) - Date.parse(`${candidate.date}T12:00:00.000Z`)) <= 12 * 86_400_000))]
        .sort((a, b) => a.date.localeCompare(b.date));
      if (scanSucceeded) searchCache.set(cacheKey, events);
      return NextResponse.json({ start, months, events, cached: false }, {
        headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
      });
    }
    const date = searchParams.get('date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Parameter "date" (YYYY-MM-DD) wajib.' },
        { status: 400 }
      );
    }

    const num = (k: string) => {
      const v = searchParams.get(k);
      if (v === null || v === '') return undefined;
      const n = parseFloat(v);
      return Number.isNaN(n) ? undefined : n;
    };

    const userLat = num('lat');
    const userLon = num('lon');
    const userName = searchParams.get('name') || undefined;

    const criteria = {
      hMin: num('hMin'),
      sMax: num('sMax'),
      epsMin: num('epsMin'),
      nMin: num('nMin'),
      dtMinutes: num('dt'),
    };
    // buang yang undefined agar default terpakai
    const cleanCriteria = Object.fromEntries(
      Object.entries(criteria).filter(([, v]) => v !== undefined)
    );

    const result = await computeParade(date, {
      criteria: cleanCriteria,
      userLat,
      userLon,
      userName,
      verifyTopocentric: searchParams.get('verify') !== '0',
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Parade error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
