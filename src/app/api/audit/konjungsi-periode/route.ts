import { NextRequest, NextResponse } from 'next/server';
import {
  findConjunctionsInRangeAudited,
  type NRTraceEntry,
} from '@/lib/newMoonNR';
import { estimateRamadanConjDate } from '@/lib/khgtPipeline';
import { getGeocentricApparentRADec, getTopoAzEl } from '@/lib/horizonsQueries';
import { geocentricAltDeg, geocentricElongDeg } from '@/lib/geoCalc';
import { getSunset } from '@/lib/sunset';
import { checkKHGT } from '@/lib/khgtRule';
import { checkWujudulHilal } from '@/lib/wujudulHilalRule';
import { startScanTracking, getScanStats, stopScanTracking } from '@/lib/horizonsClient';
import { buildStageMapping } from '@/lib/auditFormulas';

/**
 * GET /api/audit/konjungsi-periode
 *
 * Exposes the FULL Newton-Raphson computation trail for one period — data
 * preparation, 6-hour scan + sign-change detection, brackets, every NR
 * iteration for every conjunction, bisection fallback, 12h deduplication,
 * and post-conjunction Wujudul Hilal / KHGT evaluation for Ramadan candidates.
 *
 * This is a read-only, on-demand transparency endpoint for thesis Bab IV.
 * It does NOT alter the core algorithm and does NOT change any value produced
 * by /api/konjungsi-periode — it calls the same math (findConjunctionsInRange's
 * audited sibling, which shares scanForBrackets/tryNROnBracket) and only keeps
 * intermediate values that the ordinary path discards.
 *
 * Query params:
 *   fromYear, toYear   — required, integer years
 *   lat, lon, tz       — observer location (default: Kota Bekasi)
 *   includeIterations  — 'false' to omit per-iteration NR detail (smaller payload)
 *   includeRejected    — 'false' to omit opposition-filtered sign-change events
 */

export interface PostConjunctionAuditRow {
  year: number;
  conjISO: string;
  candidateNote: string;
  candidateDistDays: number | null;
  sunsetLocal: string | null;
  sunsetUTC: string | null;
  geoElongDeg: number | null;
  geoMoonAltDeg: number | null;
  topoMoonAltDeg: number | null;
  topoMoonAzDeg: number | null;
  khgtPass: boolean | null;
  khgtAltMargin: number | null;
  khgtElongMargin: number | null;
  whRuleA: boolean | null;
  whRuleB: boolean | null;
  whFulfilled: boolean | null;
  whIsBorderline: boolean | null;
  dataRejectedAsMock: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const fromYear = parseInt(searchParams.get('fromYear') || '', 10);
    const toYear = parseInt(searchParams.get('toYear') || '', 10);
    const lat = parseFloat(searchParams.get('lat') || '-6.2349');
    const lon = parseFloat(searchParams.get('lon') || '107.0000');
    const tz = searchParams.get('tz') || 'Asia/Jakarta';
    const includeIterations = searchParams.get('includeIterations') !== 'false';
    const includeRejected = searchParams.get('includeRejected') !== 'false';

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

    const windowStart = new Date(Date.UTC(fromYear, 0, 1, 0, 0, 0));
    const windowEnd = new Date(Date.UTC(toYear, 11, 31, 23, 59, 59));

    startScanTracking();
    let audit!: Awaited<ReturnType<typeof findConjunctionsInRangeAudited>>;
    try {
      audit = await findConjunctionsInRangeAudited(windowStart, windowEnd);
    } finally {
      stopScanTracking();
    }
    const scanStats = getScanStats();

    // ── Candidate classification — identical rule to /api/konjungsi-periode ──
    const candidateIsoMap = new Map<string, { note: string; distDays: number; year: number }>();
    for (let year = fromYear; year <= toYear; year++) {
      const estimatedDate = estimateRamadanConjDate(year);
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < audit.conjunctions.length; i++) {
        const dist = Math.abs(audit.conjunctions[i].t.getTime() - estimatedDate.getTime());
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      if (bestIdx < 0) continue;
      const c = audit.conjunctions[bestIdx];
      const distDays = parseFloat((bestDist / 86400000).toFixed(1));
      candidateIsoMap.set(c.iso, {
        note: `Kandidat awal Ramadan tahun target ${year} — selisih ${distDays} hari dari estimasi siklus Hijriah.`,
        distDays,
        year,
      });
    }

    // ── Post-conjunction evaluation for candidate rows only (WH + KHGT) ──
    const postConjunctionEvaluation: PostConjunctionAuditRow[] = [];
    for (const c of audit.conjunctions) {
      const cand = candidateIsoMap.get(c.iso);
      if (!cand) continue; // only candidates get the expensive topo/RA-Dec enrichment

      const dateStr = c.iso.slice(0, 10);
      let sunsetUTC: Date | null = null;
      let sunsetLocal: string | null = null;
      try {
        const s = getSunset(dateStr, lat, lon, tz);
        sunsetUTC = s.sunsetUTC;
        sunsetLocal = s.sunsetLocal;
      } catch { /* leave null */ }

      let geoElongDeg: number | null = null;
      let geoMoonAltDeg: number | null = null;
      let topoMoonAltDeg: number | null = null;
      let topoMoonAzDeg: number | null = null;
      let dataRejectedAsMock = false;

      if (sunsetUTC) {
        try {
          const [moonRD, sunRD, moonTopo] = await Promise.all([
            getGeocentricApparentRADec("'301'", [sunsetUTC]),
            getGeocentricApparentRADec("'10'", [sunsetUTC]),
            getTopoAzEl("'301'", [sunsetUTC], lat, lon),
          ]);
          const mSrc = moonRD.results[0]?.source ?? 'mock';
          const tSrc = moonTopo.results[0]?.source ?? 'mock';
          if (mSrc === 'mock' || tSrc === 'mock') {
            dataRejectedAsMock = true;
          } else {
            const mr = moonRD.results[0];
            const sr = sunRD.results[0];
            const tr = moonTopo.results[0];
            geoElongDeg = parseFloat(geocentricElongDeg(mr.ra, mr.dec, sr.ra, sr.dec).toFixed(4));
            geoMoonAltDeg = parseFloat(geocentricAltDeg(mr.ra, mr.dec, lat, lon, sunsetUTC).toFixed(4));
            topoMoonAltDeg = parseFloat(tr.el.toFixed(4));
            topoMoonAzDeg = parseFloat(tr.az.toFixed(4));
          }
        } catch { /* leave null */ }
      }

      let khgtPass: boolean | null = null;
      let khgtAltMargin: number | null = null;
      let khgtElongMargin: number | null = null;
      if (geoMoonAltDeg !== null && geoElongDeg !== null) {
        const khgt = checkKHGT(geoMoonAltDeg, geoElongDeg);
        khgtPass = khgt.pass;
        khgtAltMargin = parseFloat(khgt.altMargin.toFixed(4));
        khgtElongMargin = parseFloat(khgt.elongMargin.toFixed(4));
      }

      let whRuleA: boolean | null = null;
      let whRuleB: boolean | null = null;
      let whFulfilled: boolean | null = null;
      let whIsBorderline: boolean | null = null;
      if (sunsetUTC && topoMoonAltDeg !== null) {
        const wh = checkWujudulHilal({
          conjunctionUTC: c.t,
          sunsetUTC,
          moonAltAtSunsetDeg: topoMoonAltDeg,
          candidateDate: dateStr,
        });
        whRuleA = wh.ruleA;
        whRuleB = wh.ruleB;
        whFulfilled = wh.fulfilled;
        whIsBorderline = wh.isBorderline;
      }

      postConjunctionEvaluation.push({
        year: cand.year,
        conjISO: c.iso,
        candidateNote: cand.note,
        candidateDistDays: cand.distDays,
        sunsetLocal,
        sunsetUTC: sunsetUTC ? sunsetUTC.toISOString() : null,
        geoElongDeg,
        geoMoonAltDeg,
        topoMoonAltDeg,
        topoMoonAzDeg,
        khgtPass,
        khgtAltMargin,
        khgtElongMargin,
        whRuleA,
        whRuleB,
        whFulfilled,
        whIsBorderline,
        dataRejectedAsMock,
      });
    }

    // ── Assemble response ──
    const signChangeEvents = includeRejected
      ? audit.signChangeEvents
      : audit.signChangeEvents.filter((e) => e.keptAsBracket);

    const nrTraces: NRTraceEntry[] = includeIterations
      ? audit.nrTraces
      : audit.nrTraces.map((t) => ({ ...t, iterations: [] }));

    const totalNRIterations = audit.nrTraces.reduce((sum, t) => sum + t.totalIterations, 0);
    const bisectionFallbackCount = audit.nrTraces.filter((t) => t.usedBisection).length;
    const usedMock = scanStats.mockCount > 0;
    const totalScan = scanStats.liveCount + scanStats.cacheCount + scanStats.mockCount;

    let academicValidityStatus: 'VALID_FOR_THESIS' | 'PARTIAL_VALID' | 'NOT_VALID_MOCK';
    let academicValidityReason: string;
    if (totalScan > 0 && scanStats.mockCount === totalScan) {
      academicValidityStatus = 'NOT_VALID_MOCK';
      academicValidityReason = 'Seluruh query HORIZONS pada pemindaian ini berasal dari fallback/simulasi — tidak valid untuk Bab IV.';
    } else if (usedMock) {
      academicValidityStatus = 'PARTIAL_VALID';
      academicValidityReason = `${scanStats.mockCount} dari ${totalScan} query HORIZONS fallback ke simulasi — sebagian data mungkin tidak akurat.`;
    } else {
      academicValidityStatus = 'VALID_FOR_THESIS';
      academicValidityReason = 'Seluruh data berasal dari NASA/JPL HORIZONS live atau cache tanpa fallback/simulasi.';
    }

    const response = {
      metadata: {
        fromYear,
        toYear,
        lat,
        lon,
        tz,
        windowStartUTC: windowStart.toISOString(),
        windowEndUTC: windowEnd.toISOString(),
        generatedAt: new Date().toISOString(),
        algorithm:
          'Newton-Raphson (central difference, delta=60s) dengan pemindaian awal 6 jam untuk deteksi bracket, ' +
          'fallback bisection jika NR tidak konvergen dalam 30 iterasi, dan deduplikasi 12 jam pada hasil akhir.',
        epsAngleDeg: 1e-6,
        epsTimeSec: 0.2,
        maxIterations: 30,
        scanStepHours: 6,
        dedupThresholdHours: 12,
      },
      crispdm: {
        businessUnderstanding:
          'Menentukan waktu konjungsi (ijtima) sebagai dasar penentuan awal Ramadan secara komputasi (bukan penetapan hukum).',
        dataUnderstanding:
          'Data ephemeris posisi geosentrik Bulan dan Matahari dari NASA/JPL Horizons (bujur ekliptika, RA/Dec, Az/El topocentric).',
        dataPreparation:
          'Konversi tanggal ke Julian Date, query batch HORIZONS per 6 jam, normalisasi selisih bujur ekliptika dengan wrapTo180, ' +
          'dan penyaringan pasangan tanda-berubah yang merupakan oposisi (purnama), bukan konjungsi. Lihat bagian dataPreparation & scanResults.',
        modeling:
          'Newton-Raphson dengan turunan numerik central difference (delta=60 detik) pada setiap bracket hasil pemindaian 6 jam. ' +
          'Lihat bagian brackets & newtonRaphsonIterations.',
        evaluation:
          'Deduplikasi konjungsi berjarak <=12 jam, klasifikasi kandidat awal Ramadan berdasarkan siklus Hijriah, ' +
          'lalu evaluasi Wujudul Hilal (Rule A/B) dan KHGT pada tanggal kandidat. Lihat bagian deduplication & postConjunctionEvaluation.',
        deployment:
          'Hasil disajikan melalui halaman Evaluasi Konjungsi Periode dan endpoint /api/konjungsi-periode; endpoint ini (/api/audit/*) ' +
          'khusus untuk transparansi/audit data Bab IV, tidak dipakai oleh alur produksi lainnya.',
      },
      dataPreparation: {
        scanEpochCount: audit.scanEpochCount,
        scanBatchCount: audit.scanBatchCount,
        batchSizeMaxEpochs: 40,
        horizonsCallsPhase1Scan: audit.scanBatchCount * 2, // Moon + Sun per batch
        liveCount: scanStats.liveCount,
        cacheCount: scanStats.cacheCount,
        mockCount: scanStats.mockCount,
        failedCount: scanStats.failedCount,
        note:
          'scanEpochCount = jumlah titik waktu (interval 6 jam) yang dievaluasi. Setiap batch (maks 40 epoch) menghasilkan ' +
          '2 permintaan HORIZONS (Bulan + Matahari). Normalisasi: wrapTo180(eclMoon - eclSun); transformasi: Date -> Julian Date.',
      },
      scanResults: {
        totalSignChanges: audit.signChangeEvents.length,
        keptAsBracket: audit.signChangeEvents.filter((e) => e.keptAsBracket).length,
        filteredAsOpposition: audit.signChangeEvents.filter((e) => e.isOpposition).length,
        events: signChangeEvents,
      },
      brackets: audit.brackets,
      newtonRaphsonIterations: nrTraces,
      fallbackBisection: {
        count: bisectionFallbackCount,
        details: audit.nrTraces.filter((t) => t.usedBisection),
      },
      deduplication: {
        rawCount: audit.rawConjunctions.length,
        dedupedCount: audit.conjunctions.length,
        duplicatesRemoved: audit.duplicatesRemoved,
      },
      postConjunctionEvaluation,
      stageMapping: buildStageMapping({
        fromYear,
        toYear,
        scanEpochCount: audit.scanEpochCount,
        scanBatchCount: audit.scanBatchCount,
        horizonsCallsPhase1Scan: audit.scanBatchCount * 2,
        totalSignChanges: audit.signChangeEvents.length,
        keptAsBracket: audit.signChangeEvents.filter((e) => e.keptAsBracket).length,
        filteredAsOpposition: audit.signChangeEvents.filter((e) => e.isOpposition).length,
        totalNRIterations,
        avgIterationsPerConjunction: audit.brackets.length > 0
          ? parseFloat((totalNRIterations / audit.brackets.length).toFixed(2))
          : 0,
        bisectionFallbackCount,
        totalConjunctions: audit.conjunctions.length,
        rawCount: audit.rawConjunctions.length,
        dedupedCount: audit.conjunctions.length,
        dedupRemovedCount: audit.duplicatesRemoved.length,
        totalCandidates: postConjunctionEvaluation.length,
      }),
      summary: {
        totalConjunctions: audit.conjunctions.length,
        totalCandidates: postConjunctionEvaluation.length,
        totalNRIterations,
        avgIterationsPerConjunction: audit.conjunctions.length > 0
          ? parseFloat((totalNRIterations / audit.brackets.length).toFixed(2))
          : 0,
        bisectionFallbackCount,
        dedupRemovedCount: audit.duplicatesRemoved.length,
        scanEpochCount: audit.scanEpochCount,
        scanApiCallCount: audit.scanBatchCount * 2,
        liveCount: scanStats.liveCount,
        cacheCount: scanStats.cacheCount,
        mockCount: scanStats.mockCount,
        failedCount: scanStats.failedCount,
        academicValidityStatus,
        academicValidityReason,
      },
      disclaimer:
        'Data ini adalah keluaran komputasi riset untuk transparansi metodologi skripsi (Bab IV), bukan penetapan hukum awal Ramadan. ' +
        'Baris dengan dataRejectedAsMock=true atau academicValidityStatus selain VALID_FOR_THESIS tidak boleh dikutip sebagai hasil akademik final.',
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[audit/konjungsi-periode] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
