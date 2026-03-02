import { NextRequest, NextResponse } from 'next/server';
import { loadGroundTruth } from '@/lib/evaluation';
import { predictRamadanMulti } from '@/lib/ramadanFromSyaban';

// Default evaluation location: Bekasi
const DEFAULT_LAT = -6.2383;
const DEFAULT_LON = 106.9756;
const DEFAULT_TZ = 'Asia/Jakarta';

interface EvalItem {
  year: number;
  predicted: string | null;
  actual: string | null;
  status: 'OK' | 'FAIL' | 'SKIPPED' | 'NO_GROUND_TRUTH';
  note?: string;
}

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

    // Determine year range: use body params or fall back to GT range
    const gtYears = gt.map(e => e.year);
    const defaultFrom = gtYears.length > 0 ? Math.min(...gtYears) : new Date().getFullYear();
    const defaultTo = gtYears.length > 0 ? Math.max(...gtYears) : new Date().getFullYear();

    const fromYear = typeof body.fromYear === 'number' ? body.fromYear : defaultFrom;
    const toYear = typeof body.toYear === 'number' ? body.toYear : defaultTo;

    if (fromYear > toYear) {
      return NextResponse.json(
        { error: `Invalid range: fromYear (${fromYear}) > toYear (${toYear})` },
        { status: 400 }
      );
    }

    // Auto-compute missing predictions
    const lat = body.lat ?? DEFAULT_LAT;
    const lon = body.lon ?? DEFAULT_LON;
    const tz = body.tz ?? DEFAULT_TZ;

    const items: EvalItem[] = [];

    for (let y = fromYear; y <= toYear; y++) {
      // Compute prediction if not pre-supplied
      if (!predictions.has(y)) {
        try {
          const multi = await predictRamadanMulti(y, lat, lon, tz);
          if (multi.primary) {
            predictions.set(y, multi.primary.ramadan1LocalDate);
          }
        } catch (err) {
          console.warn(`Could not predict year ${y}:`, (err as Error).message);
        }
      }

      const pred = predictions.get(y) ?? null;
      const gtEntry = gt.find(e => e.year === y);

      if (!gtEntry) {
        // No ground truth for this year
        items.push({
          year: y,
          predicted: pred,
          actual: null,
          status: 'NO_GROUND_TRUTH',
          note: pred
            ? `Predicted ${pred} (no ground truth available for comparison)`
            : 'No prediction and no ground truth available',
        });
      } else if (!pred) {
        items.push({
          year: y,
          predicted: null,
          actual: gtEntry.ramadan1,
          status: 'SKIPPED',
          note: 'No prediction available for this year',
        });
      } else if (pred === gtEntry.ramadan1) {
        items.push({
          year: y,
          predicted: pred,
          actual: gtEntry.ramadan1,
          status: 'OK',
        });
      } else {
        items.push({
          year: y,
          predicted: pred,
          actual: gtEntry.ramadan1,
          status: 'FAIL',
          note: `Predicted ${pred} vs actual ${gtEntry.ramadan1}`,
        });
      }
    }

    const totalOk = items.filter(i => i.status === 'OK').length;
    const totalFail = items.filter(i => i.status === 'FAIL').length;
    const totalSkipped = items.filter(i => i.status === 'SKIPPED').length;
    const totalNoGt = items.filter(i => i.status === 'NO_GROUND_TRUTH').length;
    const evaluated = totalOk + totalFail;
    const accuracy = evaluated > 0 ? `${((totalOk / evaluated) * 100).toFixed(1)}%` : 'N/A';

    return NextResponse.json({
      items,
      totalOk,
      totalFail,
      totalSkipped,
      totalNoGroundTruth: totalNoGt,
      accuracy,
      fromYear,
      toYear,
    });
  } catch (err) {
    console.error('Evaluate error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
