import { NextRequest, NextResponse } from 'next/server';
import { predictRamadanMulti } from '@/lib/ramadanFromSyaban';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '', 10);
    const lat = parseFloat(searchParams.get('lat') || '');
    const lon = parseFloat(searchParams.get('lon') || '');
    const tz = searchParams.get('tz') || '';

    if (isNaN(year) || isNaN(lat) || isNaN(lon) || !tz) {
      return NextResponse.json(
        { error: 'Missing or invalid parameters: year, lat, lon, tz required' },
        { status: 400 }
      );
    }

    const multi = await predictRamadanMulti(year, lat, lon, tz);

    // Build response: backward-compatible top-level fields from primary + new multi fields
    const response: Record<string, unknown> = {
      year: multi.year,
      results: multi.results,
      warnings: multi.warnings,
    };

    // Backward compatibility: spread primary result fields at top level if exists
    if (multi.primary) {
      Object.assign(response, multi.primary);
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('Predict error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
