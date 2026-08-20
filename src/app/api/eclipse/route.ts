import { NextRequest, NextResponse } from 'next/server';
import { computeEclipse } from '@/lib/eclipse/pipeline';
import type { EclipseKind } from '@/lib/eclipse/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function numeric(searchParams: URLSearchParams, key: string, fallback: number): number {
  const value = Number.parseFloat(searchParams.get(key) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kind = (searchParams.get('type') ?? 'solar') as EclipseKind;
    const startText = searchParams.get('start') ?? new Date().toISOString().slice(0, 10);
    const months = Math.round(numeric(searchParams, 'months', 12));
    const latitude = numeric(searchParams, 'lat', -6.2349);
    const longitude = numeric(searchParams, 'lon', 107.0);
    const altitudeKm = numeric(searchParams, 'alt', 0);

    if (kind !== 'solar' && kind !== 'lunar') return NextResponse.json({ error: 'Jenis gerhana harus solar atau lunar.' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startText)) return NextResponse.json({ error: 'Tanggal awal harus berformat YYYY-MM-DD.' }, { status: 400 });
    if (months < 1 || months > 24) return NextResponse.json({ error: 'Rentang pencarian harus 1–24 bulan.' }, { status: 400 });
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: 'Koordinat pengamat tidak valid.' }, { status: 400 });
    }

    const start = new Date(`${startText}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) return NextResponse.json({ error: 'Tanggal awal tidak valid.' }, { status: 400 });
    if (start.getUTCFullYear() < 1972 || start.getUTCFullYear() > 2100) {
      return NextResponse.json({ error: 'Tanggal kalkulasi didukung untuk 1972–2100.' }, { status: 400 });
    }
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + months);

    const result = await computeEclipse(kind, start, end, { latitude, longitude, altitudeKm });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    console.error('[ECLIPSE]', error);
    return NextResponse.json({ error: (error as Error).message || 'Kalkulasi gerhana gagal.' }, { status: 500 });
  }
}
