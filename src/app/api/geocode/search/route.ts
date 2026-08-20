import { NextRequest, NextResponse } from 'next/server';

interface NominatimItem {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  addresstype?: string;
}

const cache = new Map<string, { expires: number; results: unknown[] }>();
const CITY_TYPES = new Set(['city', 'town', 'village', 'municipality', 'administrative']);

/** Worldwide city autocomplete backed by OpenStreetMap Nominatim. */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const query = (params.get('q') ?? '').trim().slice(0, 100);
  const language = params.get('lang') === 'id' ? 'id' : 'en';
  if (query.length < 2) return NextResponse.json({ results: [] });

  const key = `${language}:${query.toLocaleLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return NextResponse.json({ results: cached.results, cached: true });

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', query);
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '10');
    url.searchParams.set('accept-language', language);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'InternationalAstronomicalStudies/1.0 (academic research)' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    const data = await response.json() as NominatimItem[];
    const cityMatches = data.filter((item) => CITY_TYPES.has(item.addresstype ?? item.type ?? ''));
    const source = cityMatches.length > 0 ? cityMatches : data;
    const results = source.slice(0, 7).map((item) => ({
      id: String(item.place_id),
      name: item.display_name.split(',')[0]?.trim() || item.display_name,
      displayName: item.display_name,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
    })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    cache.set(key, { expires: Date.now() + 24 * 60 * 60 * 1000, results });
    return NextResponse.json({ results, cached: false }, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch (error) {
    return NextResponse.json({ results: [], error: (error as Error).message }, { status: 502 });
  }
}
