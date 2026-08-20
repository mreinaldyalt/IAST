import { NextRequest, NextResponse } from 'next/server';
import { getTimezone } from '@/lib/sunset';

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
    const tz = getTimezone(lat, lon);
    return NextResponse.json({ tz });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
