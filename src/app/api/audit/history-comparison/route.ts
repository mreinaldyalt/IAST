import { NextRequest, NextResponse } from 'next/server';
import { predictRamadanMulti, type PredictionResult } from '@/lib/ramadanFromSyaban';
import { predictKHGTFullForGregorianYear, type KHGTResult } from '@/lib/khgtPipeline';
import { ensureOfficialHistoryInitialized } from '@/lib/officialHistory/bootstrap';
import { getRecord } from '@/lib/officialHistory/store';
import { getProviderForCountry } from '@/lib/officialHistory/providers';
import { diffCivilDays, resolveOfficialFields } from '@/lib/officialHistory/resolve';

/**
 * GET /api/audit/history-comparison
 *
 * Audit/transparency variant of /api/evaluate: same three variables (KHGT
 * global, Wujudul Hilal local, official government date) but exposes the FULL
 * computation trail behind A and B instead of just the final date —
 * PredictionResult already carries nrIterations/ruleA/ruleB/candidatesChecked
 * for the local pipeline, and KHGTResult already carries witness/scanSummary
 * for the global pipeline. This endpoint does not recompute anything
 * differently from /api/evaluate — it reuses the exact same underlying
 * functions so the dates it reports are identical.
 *
 * Query params: fromYear, toYear, lat, lon, tz, countryCode
 */

interface HistoryAuditItem {
  year: number;
  khgt: KHGTResult | null;
  khgtSyawal: KHGTResult | null;
  local: PredictionResult | null;
  official: {
    date: string | null;
    status: string;
    authority: string | null;
    institution: string | null;
    sourceUrl: string | null;
  };
  khgtVsLocalDays: number | null;
  khgtVsOfficialDays: number | null;
  localVsOfficialDays: number | null;
  reasonIfDifferent: string | null;
}

function buildReason(item: Pick<HistoryAuditItem, 'khgt' | 'local' | 'khgtVsLocalDays' | 'localVsOfficialDays'>): string | null {
  const notes: string[] = [];
  if (item.khgtVsLocalDays !== null && item.khgtVsLocalDays !== 0) {
    notes.push(
      `KHGT Global menggunakan kriteria geosentris pada titik saksi terbaik di seluruh grid daratan bumi ` +
      `(alt>=5 deg, elongasi>=8 deg), sedangkan Wujudul Hilal Lokal menggunakan kriteria topocentric Rule A/B ` +
      `(konjungsi sebelum matahari terbenam DAN tinggi bulan topocentric > 0 deg) khusus di lokasi pengamatan yang dipilih ` +
      `— perbedaan lokasi dan kriteria ini wajar menghasilkan tanggal berbeda.`
    );
  }
  if (item.local && item.localVsOfficialDays !== null && item.localVsOfficialDays !== 0) {
    const wh = item.local;
    notes.push(
      `Komputasi lokal: Rule A (konjungsi sebelum sunset) = ${wh.ruleA ? 'terpenuhi' : 'tidak terpenuhi'}, ` +
      `Rule B (tinggi bulan topocentric saat sunset = ${wh.moonAltitudeAtSunsetDeg.toFixed(4)} deg) = ${wh.ruleB ? 'terpenuhi' : 'tidak terpenuhi'}` +
      `${wh.isBorderline ? ' (kondisi borderline, |alt| <= 0.2 deg)' : ''}.`
    );
  }
  return notes.length > 0 ? notes.join(' ') : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const fromYear = parseInt(searchParams.get('fromYear') || '', 10);
    const toYear = parseInt(searchParams.get('toYear') || '', 10);
    const lat = parseFloat(searchParams.get('lat') || '-6.2088');
    const lon = parseFloat(searchParams.get('lon') || '106.8456');
    const tz = searchParams.get('tz') || 'Asia/Jakarta';
    const countryCode = searchParams.get('countryCode');

    if (isNaN(fromYear) || isNaN(toYear)) {
      return NextResponse.json(
        { error: 'Parameter wajib: fromYear dan toYear harus berupa angka.' },
        { status: 400 }
      );
    }
    if (fromYear > toYear) {
      return NextResponse.json(
        { error: `Rentang tidak valid: fromYear (${fromYear}) > toYear (${toYear}).` },
        { status: 400 }
      );
    }

    ensureOfficialHistoryInitialized();
    const provider = getProviderForCountry(countryCode);

    async function computeYear(year: number): Promise<HistoryAuditItem[]> {
      const [khgtSettled, localSettled] = await Promise.allSettled([
        predictKHGTFullForGregorianYear(year),
        predictRamadanMulti(year, lat, lon, tz),
      ]);

      const khgtRows = khgtSettled.status === 'fulfilled' ? khgtSettled.value : [];
      const localRows = localSettled.status === 'fulfilled' ? localSettled.value.results : [];

      let official: ReturnType<typeof getRecord> = null;
      if (provider) official = getRecord(provider.countryCode, year);
      const { officialDate, officialStatus } = resolveOfficialFields(official, !!provider);

      const n = Math.max(khgtRows.length, localRows.length, 1);
      const items: HistoryAuditItem[] = [];
      for (let i = 0; i < n; i++) {
        const khgt = khgtRows[i]?.ramadan ?? null;
        const khgtSyawal = khgtRows[i]?.syawal ?? null;
        const local = localRows[i] ?? null;

        const khgtVsLocalDays = diffCivilDays(khgt?.khgtStartCivilDate ?? null, local?.ramadan1LocalDate ?? null);
        const khgtVsOfficialDays = diffCivilDays(khgt?.khgtStartCivilDate ?? null, officialDate);
        const localVsOfficialDays = diffCivilDays(local?.ramadan1LocalDate ?? null, officialDate);

        const partial = { khgt, local, khgtVsLocalDays, localVsOfficialDays };
        items.push({
          year,
          khgt,
          khgtSyawal,
          local,
          official: {
            date: officialDate,
            status: officialStatus,
            authority: officialDate ? official?.authority ?? null : null,
            institution: officialDate ? official?.institution ?? null : null,
            sourceUrl: official?.sourceUrl ?? null,
          },
          khgtVsLocalDays,
          khgtVsOfficialDays,
          localVsOfficialDays,
          reasonIfDifferent: buildReason(partial),
        });
      }
      return items;
    }

    const years: number[] = [];
    for (let y = fromYear; y <= toYear; y++) years.push(y);
    const perYear = await Promise.all(years.map(computeYear));
    const items = perYear.flat();

    const summary = {
      totalYears: years.length,
      totalRows: items.length,
      khgtVsLocalMatches: items.filter((i) => i.khgtVsLocalDays === 0).length,
      khgtVsOfficialMatches: items.filter((i) => i.khgtVsOfficialDays === 0).length,
      localVsOfficialMatches: items.filter((i) => i.localVsOfficialDays === 0).length,
      officialVerifiedCount: items.filter((i) => i.official.status === 'verified').length,
    };

    return NextResponse.json({
      metadata: {
        fromYear,
        toYear,
        lat,
        lon,
        tz,
        countryCode: provider?.countryCode ?? countryCode ?? null,
        generatedAt: new Date().toISOString(),
      },
      items,
      summary,
      disclaimer:
        'Data ini adalah keluaran komputasi riset (KHGT global dan Wujudul Hilal lokal) untuk transparansi metodologi ' +
        'skripsi Bab IV, bukan penetapan hukum awal Ramadan. Kolom "official" hanya diisi jika statusnya verified ' +
        'dari sumber pemerintah resmi yang terdaftar; tanggal prediksi TIDAK PERNAH ditulis ke kolom ini.',
    });
  } catch (err) {
    console.error('[audit/history-comparison] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
