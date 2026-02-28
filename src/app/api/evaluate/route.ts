import { NextRequest, NextResponse } from 'next/server';
import { evaluate, loadGroundTruth } from '@/lib/evaluation';
import { predictRamadan } from '@/lib/ramadanFromSyaban';

// Default evaluation location: Bekasi
const DEFAULT_LAT = -6.2383;
const DEFAULT_LON = 106.9756;
const DEFAULT_TZ = 'Asia/Jakarta';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const predictions = new Map<number, string>();

    // Accept pre-computed predictions from body
    if (body.predictions && typeof body.predictions === 'object') {
      for (const [k, v] of Object.entries(body.predictions)) {
        predictions.set(parseInt(k, 10), v as string);
      }
    }

    const gt = loadGroundTruth();
    if (gt.length === 0) {
      return NextResponse.json({
        items: [],
        totalOk: 0,
        totalFail: 0,
        totalSkipped: 0,
        accuracy: 'N/A',
        note: 'No ground truth data found',
      });
    }

    // Auto-compute missing predictions
    const lat = body.lat ?? DEFAULT_LAT;
    const lon = body.lon ?? DEFAULT_LON;
    const tz = body.tz ?? DEFAULT_TZ;

    for (const entry of gt) {
      if (!predictions.has(entry.year)) {
        try {
          const result = await predictRamadan(entry.year, lat, lon, tz);
          if (result.ramadan1LocalDate) {
            predictions.set(entry.year, result.ramadan1LocalDate);
          }
        } catch (err) {
          console.warn(`Could not predict year ${entry.year}:`, (err as Error).message);
          // Will show as SKIPPED
        }
      }
    }

    const result = evaluate(predictions, gt);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Evaluate error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
