import { NextRequest, NextResponse } from 'next/server';
import { predictKHGTFullForGregorianYear } from '@/lib/khgtPipeline';
import { findEclipseCatalog } from '@/lib/eclipse/pipeline';
import { findParadeEventsInRange } from '@/lib/parade/annualCandidate';
import { getAllEvents, type AstronomyEvent, type AstronomyEventType } from '@/lib/astronomyEvents';
import { resetHorizonsCircuitBreaker } from '@/lib/horizonsClient';

export const runtime = 'nodejs';
export const maxDuration = 60;

type CalendarCategory = 'ramadan' | 'eclipse' | 'parade';
interface CategoryResult { events: AstronomyEvent[]; complete: boolean }

// A successful category is cached independently. A NASA failure in Parade can
// therefore never erase a valid Ramadan/Eclipse result or freeze a partial year.
const categoryCache = new Map<string, AstronomyEvent[]>();

function hijriYear(date: string): number {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic', { year: 'numeric', timeZone: 'UTC' })
    .formatToParts(new Date(`${date}T12:00:00.000Z`));
  return Number.parseInt(parts.find((part) => part.type === 'year')?.value ?? '0', 10);
}

function verifiedEvents(year: number, types: AstronomyEventType[]) {
  return getAllEvents().filter((event) => event.gregorianYear === year && types.includes(event.type));
}

async function computeRamadan(year: number): Promise<CategoryResult> {
  const verified = verifiedEvents(year, ['ramadan', 'syawal']);
  if (verified.length > 0) return { events: verified, complete: true };
  const cycles = await predictKHGTFullForGregorianYear(year);
  const events: AstronomyEvent[] = [];
  for (const cycle of cycles) {
    for (const [type, result] of [['ramadan', cycle.ramadan], ['syawal', cycle.syawal]] as const) {
      const date = result.khgtStartCivilDate;
      events.push({
        id: `${type}-${date}`,
        type,
        date,
        gregorianYear: year,
        hijriYear: hijriYear(date),
        source: 'system',
        href: `/prediksi-ramadan?year=${year}`,
      });
    }
  }
  if (events.length === 0) throw new Error(`No Ramadan cycle was computed for ${year}.`);
  return { events, complete: true };
}

async function computeEclipses(year: number, start: Date, end: Date): Promise<CategoryResult> {
  const verified = verifiedEvents(year, ['eclipse']);
  if (verified.length > 0) return { events: verified, complete: true };
  const catalog = await findEclipseCatalog(start, end);
  return {
    complete: true,
    events: catalog.map((eclipse) => {
      const date = eclipse.greatestEclipseUTC.slice(0, 10);
      return {
        id: `eclipse-${eclipse.kind}-${eclipse.eclipseType}-${date}`,
        type: 'eclipse' as const,
        date,
        gregorianYear: year,
        hijriYear: hijriYear(date),
        source: 'system' as const,
        label: eclipse.eclipseTypeLabel,
        href: `/gerhana?type=${eclipse.kind}&start=${date}`,
      };
    }),
  };
}

async function computeParades(year: number, start: Date, end: Date): Promise<CategoryResult> {
  const verified = verifiedEvents(year, ['parade']);
  if (process.env.NODE_ENV === 'test' && verified.length > 0) return { events: verified, complete: true };
  try {
    const catalog = await findParadeEventsInRange(start, end);
    const computed: AstronomyEvent[] = catalog
      .filter((parade) => {
        const time = Date.parse(`${parade.date}T12:00:00.000Z`);
        return !verified.some((event) => Math.abs(Date.parse(`${event.date}T12:00:00.000Z`) - time) <= 12 * 86_400_000);
      })
      .map((parade) => ({
        id: `parade-${parade.planetCount}-${parade.date}`,
        type: 'parade',
        date: parade.date,
        gregorianYear: year,
        hijriYear: hijriYear(parade.date),
        source: 'system',
        label: `Parade ${parade.planetCount} Planet (${parade.nakedEyeCount} naked-eye + ${parade.aidedCount} optics)`,
        href: `/parade-planet?date=${parade.date}`,
      }));
    return { events: [...verified, ...computed], complete: true };
  } catch (error) {
    if (verified.length > 0) return { events: verified, complete: false };
    throw error;
  }
}

async function loadCategory(year: number, category: CalendarCategory): Promise<CategoryResult> {
  const key = `${year}:${category}`;
  const cached = categoryCache.get(key);
  if (cached) return { events: cached, complete: true };
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const result = category === 'ramadan'
    ? await computeRamadan(year)
    : category === 'eclipse'
      ? await computeEclipses(year, start, end)
      : await computeParades(year, start, end);
  if (result.complete) categoryCache.set(key, result.events);
  return result;
}

function response(year: number, events: AstronomyEvent[], warnings: string[], cached = false) {
  return NextResponse.json({ year, events: events.sort((a, b) => a.date.localeCompare(b.date)), warnings, cached }, {
    headers: { 'Cache-Control': warnings.length === 0 ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'no-store' },
  });
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const year = Number.parseInt(params.get('year') ?? '', 10);
  if (!Number.isInteger(year) || year < 1972 || year > 2100) {
    return NextResponse.json({ error: 'Year must be within 1972–2100.' }, { status: 400 });
  }
  const requested = params.get('category');
  if (requested && !['ramadan', 'eclipse', 'parade'].includes(requested)) {
    return NextResponse.json({ error: 'Unknown astronomy-event category.' }, { status: 400 });
  }

  const categories: CalendarCategory[] = requested ? [requested as CalendarCategory] : ['ramadan', 'eclipse', 'parade'];
  if (requested) resetHorizonsCircuitBreaker();
  const events: AstronomyEvent[] = [];
  const warnings: string[] = [];

  // Deliberately sequential: large simultaneous Horizons bursts were the cause
  // of the old partial-year calendar responses.
  for (const category of categories) {
    try {
      const result = await loadCategory(year, category);
      events.push(...result.events);
      if (!result.complete) warnings.push(category);
    } catch (error) {
      console.error(`Astronomy calendar ${category} ${year}:`, error);
      warnings.push(category);
    }
  }
  return response(year, events, warnings);
}
