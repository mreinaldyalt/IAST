import { NextRequest, NextResponse } from 'next/server';
import { predictRamadan } from '@/lib/ramadanFromSyaban';

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

    const result = await predictRamadan(year, lat, lon, tz);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Predict error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
