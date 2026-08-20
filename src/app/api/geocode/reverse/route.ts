import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/geocode/reverse?lat=&lon=
 * Reverse-geocodes to a country using Nominatim (OpenStreetMap) — the same
 * provider already used for city search elsewhere in this app
 * (evaluasi/page.tsx searchCity()), so no new external dependency is
 * introduced. zoom=3 requests country-level detail only (cheaper on
 * Nominatim's shared infrastructure than a full address lookup, and it's all
 * this feature needs).
 *
 * Called by the frontend once when the user's location changes — NOT once per
 * evaluation year (see evaluasi/page.tsx).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lon = parseFloat(searchParams.get('lon') || '');

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json(
      { error: 'Missing or invalid parameters: lat, lon required' },
      { status: 400 }
    );
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=3`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'InternationalAstronomicalStudies/1.0 (academic research)' },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      throw new Error(`Nominatim HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const country = data?.address?.country ?? null;
    const countryCode = data?.address?.country_code ? String(data.address.country_code).toUpperCase() : null;

    if (!country || !countryCode) {
      // Honest fallback — do not guess a country when Nominatim can't identify one
      // (e.g. open ocean coordinates).
      return NextResponse.json({ country: null, countryCode: null, detected: false });
    }

    return NextResponse.json({ country, countryCode, detected: true });
  } catch (err) {
    // Reverse geocoding failing must never break the page that called it —
    // report a clear "undetermined" state instead of a 500.
    return NextResponse.json({
      country: null,
      countryCode: null,
      detected: false,
      error: (err as Error).message,
    });
  }
}
