import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { findConjunctionsInRangeAudited } from '@/lib/newMoonNR';
import { estimateRamadanConjDate } from '@/lib/khgtPipeline';
import { getGeocentricApparentRADec, getTopoAzEl } from '@/lib/horizonsQueries';
import { geocentricAltDeg, geocentricElongDeg } from '@/lib/geoCalc';
import { getSunset } from '@/lib/sunset';
import { checkKHGT } from '@/lib/khgtRule';
import { checkWujudulHilal } from '@/lib/wujudulHilalRule';

/**
 * GET /api/audit/contoh-perhitungan
 *
 * Full narrative-ready "worked example" for exactly ONE Ramadan-candidate
 * conjunction (default year 2025) — every number needed to write out the
 * formula-substitution walkthrough in Bab IV (Δλ, wrapTo180, sign change,
 * initial guess, central difference, Newton-Raphson correction, convergence
 * check, final conjunction time, and post-conjunction WH/KHGT evaluation for
 * Kota Bekasi).
 *
 * This is a read-only endpoint scoped to a narrow ±40-day window around the
 * expected Ramadan conjunction — it calls the exact same scan/bracket/NR
 * functions as /api/audit/konjungsi-periode (via findConjunctionsInRangeAudited),
 * so the numbers shown here are identical to what a full-period run would show
 * for that specific conjunction.
 *
 * Query params: year (default 2025), lat, lon, tz (default Kota Bekasi)
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '2025', 10);
    const lat = parseFloat(searchParams.get('lat') || '-6.2349');
    const lon = parseFloat(searchParams.get('lon') || '107.0000');
    const tz = searchParams.get('tz') || 'Asia/Jakarta';

    if (isNaN(year)) {
      return NextResponse.json({ error: 'Parameter wajib: year harus berupa angka.' }, { status: 400 });
    }

    const estimatedCenter = estimateRamadanConjDate(year);
    const windowStart = new Date(estimatedCenter.getTime() - 40 * 86400000);
    const windowEnd = new Date(estimatedCenter.getTime() + 40 * 86400000);

    const audit = await findConjunctionsInRangeAudited(windowStart, windowEnd);

    if (audit.conjunctions.length === 0) {
      return NextResponse.json(
        { error: `Tidak ditemukan konjungsi di sekitar estimasi Ramadan ${year} (jendela ${windowStart.toISOString()} – ${windowEnd.toISOString()}).` },
        { status: 404 }
      );
    }

    // Pick the conjunction closest to the estimated Ramadan center — same rule
    // used everywhere else in this app for candidate classification.
    let candidate = audit.conjunctions[0];
    let bestDist = Math.abs(candidate.t.getTime() - estimatedCenter.getTime());
    for (const c of audit.conjunctions) {
      const dist = Math.abs(c.t.getTime() - estimatedCenter.getTime());
      if (dist < bestDist) { bestDist = dist; candidate = c; }
    }

    const nrTrace = audit.nrTraces.find((t) => t.finalConjunctionISO === candidate.iso);
    if (!nrTrace) {
      return NextResponse.json({ error: 'Internal: tidak ditemukan jejak NR untuk kandidat terpilih.' }, { status: 500 });
    }
    const bracket = audit.brackets[nrTrace.bracketIndex];
    const signEvent = audit.signChangeEvents.find(
      (e) => e.t1 === bracket.t1 && e.t2 === bracket.t2 && e.keptAsBracket
    );

    // ── Post-conjunction evaluation at Kota Bekasi (or the requested location) ──
    const dateStr = candidate.iso.slice(0, 10);
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
    let moonAgeHours: number | null = null;

    if (sunsetUTC) {
      moonAgeHours = parseFloat(((sunsetUTC.getTime() - candidate.t.getTime()) / 3600000).toFixed(3));
      try {
        const [moonRD, sunRD, moonTopo] = await Promise.all([
          getGeocentricApparentRADec("'301'", [sunsetUTC]),
          getGeocentricApparentRADec("'10'", [sunsetUTC]),
          getTopoAzEl("'301'", [sunsetUTC], lat, lon),
        ]);
        const mr = moonRD.results[0];
        const sr = sunRD.results[0];
        const tr = moonTopo.results[0];
        if (mr && sr && tr) {
          geoElongDeg = parseFloat(geocentricElongDeg(mr.ra, mr.dec, sr.ra, sr.dec).toFixed(4));
          geoMoonAltDeg = parseFloat(geocentricAltDeg(mr.ra, mr.dec, lat, lon, sunsetUTC).toFixed(4));
          topoMoonAltDeg = parseFloat(tr.el.toFixed(4));
          topoMoonAzDeg = parseFloat(tr.az.toFixed(4));
        }
      } catch { /* leave null */ }
    }

    let khgtPass: boolean | null = null;
    if (geoMoonAltDeg !== null && geoElongDeg !== null) {
      khgtPass = checkKHGT(geoMoonAltDeg, geoElongDeg).pass;
    }

    let ruleA: boolean | null = null;
    let ruleB: boolean | null = null;
    let fulfilled: boolean | null = null;
    let isBorderline: boolean | null = null;
    if (sunsetUTC && topoMoonAltDeg !== null) {
      const wh = checkWujudulHilal({
        conjunctionUTC: candidate.t,
        sunsetUTC,
        moonAltAtSunsetDeg: topoMoonAltDeg,
        candidateDate: dateStr,
      });
      ruleA = wh.ruleA;
      ruleB = wh.ruleB;
      fulfilled = wh.fulfilled;
      isBorderline = wh.isBorderline;
    }

    const conjunctionLocal = DateTime.fromJSDate(candidate.t, { zone: tz }).toISO();
    const firstIter = nrTrace.iterations[0] ?? null;
    const lastIter = nrTrace.iterations[nrTrace.iterations.length - 1] ?? null;

    const kesimpulan =
      `Berdasarkan proses tersebut, sistem memperoleh waktu konjungsi ${candidate.iso} ` +
      `(${conjunctionLocal} waktu setempat) setelah ${nrTrace.totalIterations} iterasi Newton-Raphson ` +
      `${nrTrace.usedBisection ? '(dengan fallback bisection)' : '(tanpa fallback bisection)'}, ` +
      `dan mengevaluasi parameter astronomi setelah konjungsi pada Kota Bekasi: ` +
      `Rule A ${ruleA ? 'terpenuhi' : 'tidak terpenuhi'}, Rule B ${ruleB ? 'terpenuhi' : 'tidak terpenuhi'}` +
      `${isBorderline ? ' (kondisi borderline)' : ''}. ` +
      `Hasil ini merupakan kandidat komputasi, bukan penetapan hukum awal Ramadan.`;

    return NextResponse.json({
      metadata: {
        year, lat, lon, tz,
        generatedAt: new Date().toISOString(),
        windowStartUTC: windowStart.toISOString(),
        windowEndUTC: windowEnd.toISOString(),
        estimatedCenterUTC: estimatedCenter.toISOString(),
      },
      dataAwal: {
        periode: `Estimasi konjungsi Ramadan ${year} ± 40 hari (bootstrap dari siklus Hijriah, konjungsi aktual ditemukan via scan+NR)`,
        objek: "Bulan (kode HORIZONS '301') dan Matahari (kode HORIZONS '10'), geosentris",
        lokasi: { lat, lon, tz, label: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°, ${tz}` },
        sumberData: 'NASA/JPL Horizons (live/cache — lihat validitas di respons utama)',
        epochCount: audit.scanEpochCount,
        bracket: { t1: bracket.t1, t2: bracket.t2, f1: bracket.f1, f2: bracket.f2 },
      },
      fungsiSelisih: signEvent ? {
        t1: { epochUTC: signEvent.t1, eclMoonDeg: signEvent.eclMoon1, eclSunDeg: signEvent.eclSun1, deltaRawDeg: signEvent.deltaRaw1 },
        t2: { epochUTC: signEvent.t2, eclMoonDeg: signEvent.eclMoon2, eclSunDeg: signEvent.eclSun2, deltaRawDeg: signEvent.deltaRaw2 },
      } : null,
      wrapTo180: signEvent ? {
        t1: { deltaRawDeg: signEvent.deltaRaw1, wrappedDeltaDeg: signEvent.f1 },
        t2: { deltaRawDeg: signEvent.deltaRaw2, wrappedDeltaDeg: signEvent.f2 },
      } : null,
      signChange: {
        f1: bracket.f1, f2: bracket.f2,
        product: bracket.f1 * bracket.f2,
        isSignChange: bracket.f1 * bracket.f2 < 0,
      },
      initialGuess: { t0UTC: bracket.midpointInitialGuessUTC },
      iterations: nrTrace.iterations,
      firstIterationDetail: firstIter,
      lastIterationDetail: lastIter,
      hasil: {
        conjunctionUTC: candidate.iso,
        conjunctionLocal,
        totalIterations: nrTrace.totalIterations,
        converged: nrTrace.converged,
        usedBisection: nrTrace.usedBisection,
        bisectionDetail: nrTrace.bisectionDetail,
      },
      pascaKonjungsi: {
        sunsetLocal, sunsetUTC: sunsetUTC ? sunsetUTC.toISOString() : null,
        moonAgeHours, topoMoonAltDeg, topoMoonAzDeg, geoElongDeg, geoMoonAltDeg,
        ruleA, ruleB, fulfilled, isBorderline, khgtPass,
      },
      kesimpulan,
    });
  } catch (err) {
    console.error('[audit/contoh-perhitungan] Error:', err);
    return NextResponse.json({ error: (err as Error).message || 'Internal server error' }, { status: 500 });
  }
}
