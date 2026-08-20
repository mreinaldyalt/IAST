import { NextRequest, NextResponse } from 'next/server';
import { findConjunctionsInRange } from '@/lib/newMoonNR';
import { estimateRamadanConjDate } from '@/lib/khgtPipeline';
import { getEclipticLon, getGeocentricApparentRADec, getTopoAzEl } from '@/lib/horizonsQueries';
import { geocentricAltDeg, geocentricElongDeg } from '@/lib/geoCalc';
import { getSunset } from '@/lib/sunset';
import { checkKHGT } from '@/lib/khgtRule';
import { checkWujudulHilal } from '@/lib/wujudulHilalRule';
import {
  startScanTracking,
  getScanStats,
  stopScanTracking,
} from '@/lib/horizonsClient';

/**
 * GET /api/konjungsi-periode
 *
 * Two-phase architecture:
 *   Phase 1 (?phase=1, default): conjunction scan + dedup + candidate classification
 *     + sunset + moon age. Fast. Detail columns = null.
 *   Phase 2 (?phase=2): full enrichment — ecl lon, RA/Dec, Az/El, KHGT.
 *     On-demand via UI buttons.
 *
 * Query params:
 *   fromYear — integer start year (e.g. 2017)
 *   toYear   — integer end year   (e.g. 2026)
 *   lat      — float observer latitude  (default: -6.2349, Kota Bekasi)
 *   lon      — float observer longitude (default: 107.0000, Kota Bekasi)
 *   tz       — IANA timezone string     (default: Asia/Jakarta)
 *   phase    — 1 or 2                   (default: 1)
 *   scope    — "candidates" | "all"     (Phase 2 only, default: "candidates")
 *
 * ACADEMIC DATA POLICY:
 *   - Candidate status is based on the Hijri calendar cycle (estimateRamadanConjDate),
 *     NOT on KHGT visibility criteria. KHGT is supplementary info only.
 *   - Phase 2 REJECTS mock/fallback data: if a HORIZONS batch returns source='mock',
 *     the detail columns remain null. Fake values are NEVER written to academic columns.
 *   - Per-row eclDataValid: |eclDiff| <= 2° at conjunction (Moon ≈ Sun ecliptic lon).
 *     Values outside this range indicate invalid/mock data.
 *   - Phase 1 scan quality is tracked: if any HORIZONS calls fell to mock, the response
 *     includes usedMock=true, mockRequestCount, and phase1AcademicWarning.
 *   - No data is saved to any storage. Results are computed on demand.
 */

export type DataSource = 'live' | 'cache' | 'mock' | 'mixed';

export interface ConjunctionRow {
  year: number;
  conjDate: string;        // YYYY-MM-DD
  conjTimeUTC: string;     // HH:MM:SS
  conjISO: string;         // full ISO 8601

  // Phase 1 fields (always populated)
  sunsetLocal: string | null;
  sunsetUTC: string | null;
  moonAgeHours: number | null;

  // Phase 2 detail fields — null in Phase 1, null if HORIZONS returned mock
  eclMoonDeg: number | null;
  eclSunDeg: number | null;
  eclDiffDeg: number | null;
  eclDataValid: boolean | null;   // true if |eclDiff| <= 2° (valid at conjunction)
  geoElongDeg: number | null;
  geoMoonAltDeg: number | null;
  raMoonDeg: number | null;
  decMoonDeg: number | null;
  raSunDeg: number | null;
  decSunDeg: number | null;
  topoMoonAltDeg: number | null;
  topoMoonAzDeg: number | null;

  // Classification (Phase 1) — based on Hijri calendar cycle, NOT KHGT
  isRamadanCandidate: boolean;
  candidateNote: string;
  candidateDistDays: number | null;

  // KHGT supplementary info (Phase 2, informational only — not the basis of candidacy)
  khgtPass: boolean | null;
  khgtAltMargin: number | null;
  khgtElongMargin: number | null;

  // Wujudul Hilal (Rule A/B) — Phase 2, candidate rows only, based on the active
  // observation location (lat/lon/tz supplied in the request). This is a computational
  // research output, NOT a legal ruling on the start of Ramadan.
  whRuleA: boolean | null;
  whRuleB: boolean | null;
  whFulfilled: boolean | null;
  whIsBorderline: boolean | null;
  whMoonAltAtSunsetDeg: number | null;
  whNote: string | null;
}

export interface KonjungsiResponse {
  rows: ConjunctionRow[];
  total: number;
  phase: 1 | 2;
  scope: 'candidates' | 'all' | null;

  // Phase 2 enrichment source
  dataSource: DataSource | null;
  dataSourceNote: string | null;
  hasRejectedMockData: boolean;
  rejectedMockNote: string | null;
  hasSuspiciousConstantValues: boolean;

  // Phase 1 scan quality (populated in both Phase 1 and Phase 2 responses)
  horizonsAvailable: boolean;        // false if ANY mock used during scan
  usedMock: boolean;                 // true if mockCount > 0 (triggers warnings)
  failedRequestCount: number;        // live attempts that failed before falling to mock
  mockRequestCount: number;          // total responses that came from mock/fallback
  phase1DataSource: DataSource | null; // data source of the conjunction scan
  phase1AcademicWarning: string | null; // non-null if usedMock — explains what happened

  // Academic validity summary — derived purely from fields already computed above.
  // Intended to be quoted directly in thesis Chapter IV without manual aggregation.
  academicValidityStatus: 'VALID_FOR_THESIS' | 'PARTIAL_VALID' | 'NOT_VALID_MOCK';
  academicValidityReason: string;
  validitySummary: {
    totalRows: number;
    validRows: number;
    rejectedRows: number;
    liveCount: number;
    cacheCount: number;
    mockCount: number;
    failedCount: number;
    usedMock: boolean;
    hasRejectedMockData: boolean;
    dataSource: DataSource | null;
    phase1DataSource: DataSource | null;
  };
}

/**
 * Derive a single academic-validity verdict from fields already computed elsewhere
 * in this route. No new HORIZONS queries — pure aggregation for citation in Chapter IV.
 *
 *   NOT_VALID_MOCK  — the conjunction scan or the Phase 2 enrichment came ENTIRELY from
 *                      mock/fallback (phase1DataSource/dataSource === 'mock').
 *   PARTIAL_VALID   — some mock/fallback was involved (mixed source, or Phase 2 rejected
 *                      some mock batches) but usable live/cache data still exists.
 *   VALID_FOR_THESIS — no mock/fallback was involved anywhere in the pipeline.
 */
function computeAcademicValidity(
  usedMock: boolean,
  hasRejectedMockData: boolean,
  dataSource: DataSource | null,
  phase1DataSource: DataSource | null
): { status: 'VALID_FOR_THESIS' | 'PARTIAL_VALID' | 'NOT_VALID_MOCK'; reason: string } {
  const isFullMock = phase1DataSource === 'mock' || dataSource === 'mock';
  if (isFullMock) {
    return {
      status: 'NOT_VALID_MOCK',
      reason:
        'Data tidak valid untuk Bab IV karena seluruh data (pemindaian konjungsi dan/atau ' +
        'detail Fase 2) berasal dari fallback/simulasi (mock), bukan NASA/JPL HORIZONS live atau cache.',
    };
  }
  const isPartialIssue =
    usedMock || hasRejectedMockData || phase1DataSource === 'mixed' || dataSource === 'mixed';
  if (isPartialIssue) {
    return {
      status: 'PARTIAL_VALID',
      reason:
        'Data hanya valid sebagian karena terdapat campuran sumber live/cache dengan ' +
        'fallback/simulasi — sebagian baris atau kolom mungkin ditolak (null), tetapi ' +
        'masih terdapat data live/cache yang dapat dipakai.',
    };
  }
  return {
    status: 'VALID_FOR_THESIS',
    reason:
      'Data dapat digunakan untuk Bab IV karena seluruh data berasal dari NASA/JPL ' +
      'HORIZONS live atau cache tanpa fallback/simulasi.',
  };
}

/** Aggregate row-level and scan-level counters into one citable validity summary. */
function buildValiditySummary(
  rows: ConjunctionRow[],
  scanStats: { liveCount: number; cacheCount: number; mockCount: number; failedCount: number },
  usedMock: boolean,
  hasRejectedMockData: boolean,
  dataSource: DataSource | null,
  phase1DataSource: DataSource | null
): KonjungsiResponse['validitySummary'] {
  return {
    totalRows: rows.length,
    validRows: rows.filter(r => r.eclDataValid === true).length,
    rejectedRows: rows.filter(r => r.eclDataValid === false).length,
    liveCount: scanStats.liveCount,
    cacheCount: scanStats.cacheCount,
    mockCount: scanStats.mockCount,
    failedCount: scanStats.failedCount,
    usedMock,
    hasRejectedMockData,
    dataSource,
    phase1DataSource,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const fromYear = parseInt(searchParams.get('fromYear') || '', 10);
    const toYear   = parseInt(searchParams.get('toYear')   || '', 10);
    const lat = parseFloat(searchParams.get('lat') || '-6.2349');
    const lon = parseFloat(searchParams.get('lon') || '107.0000');
    const tz  = searchParams.get('tz') || 'Asia/Jakarta';
    const phase = (parseInt(searchParams.get('phase') || '1', 10) === 2 ? 2 : 1) as 1 | 2;
    const scope = (searchParams.get('scope') === 'all' ? 'all' : 'candidates') as 'candidates' | 'all';

    // ── Validation ──
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
    // No hard upper limit — longer ranges take more time (results cached after first run)

    // ── Step 1: Find all conjunctions in the period ──
    // Track HORIZONS usage so we can warn the user if mock/fallback was used.
    // try/finally ensures stopScanTracking() is always called even if scan throws.
    const windowStart = new Date(Date.UTC(fromYear, 0, 1, 0, 0, 0));
    const windowEnd   = new Date(Date.UTC(toYear, 11, 31, 23, 59, 59));

    let rawConj!: Awaited<ReturnType<typeof findConjunctionsInRange>>;
    startScanTracking();
    try {
      rawConj = await findConjunctionsInRange(windowStart, windowEnd);
    } finally {
      stopScanTracking(); // always stop, even on error
    }
    const scanStats = getScanStats();

    // ── Compute scan quality fields ──
    const usedMock          = scanStats.mockCount > 0;
    const horizonsAvailable = !usedMock;
    const totalScan         = scanStats.liveCount + scanStats.cacheCount + scanStats.mockCount;

    let phase1DataSource: DataSource | null = null;
    if (totalScan > 0) {
      const hL = scanStats.liveCount  > 0;
      const hC = scanStats.cacheCount > 0;
      const hM = scanStats.mockCount  > 0;
      if (hM && (hL || hC)) phase1DataSource = 'mixed';
      else if (hM)           phase1DataSource = 'mock';
      else if (hL)           phase1DataSource = 'live';
      else                   phase1DataSource = 'cache';
    }

    const phase1AcademicWarning: string | null = usedMock
      ? `Data Fase 1 mengandung ${scanStats.mockCount} respons fallback/simulasi ` +
        `dari total ${totalScan} query HORIZONS (${scanStats.failedCount} gagal live). ` +
        `Tanggal konjungsi ditampilkan sebagai preview estimasi — ` +
        `tidak valid untuk keperluan akademik. ` +
        `Jalankan ulang saat NASA/JPL HORIZONS dapat diakses.`
      : null;

    // ── Step 2: Deduplicate conjunctions ──
    // findConjunctionsInRange can return near-identical results when two adjacent
    // scan brackets both converge to the same conjunction.
    const conjunctions = rawConj.filter((c, i) => {
      if (i === 0) return true;
      return c.t.getTime() - rawConj[i - 1].t.getTime() > 12 * 3600 * 1000;
    });

    if (conjunctions.length === 0) {
      const emptyValidity = computeAcademicValidity(usedMock, false, null, phase1DataSource);
      const empty: KonjungsiResponse = {
        rows: [], total: 0, phase, scope: null,
        dataSource: null, dataSourceNote: null,
        hasRejectedMockData: false, rejectedMockNote: null,
        hasSuspiciousConstantValues: false,
        horizonsAvailable, usedMock,
        failedRequestCount: scanStats.failedCount,
        mockRequestCount: scanStats.mockCount,
        phase1DataSource,
        phase1AcademicWarning,
        academicValidityStatus: emptyValidity.status,
        academicValidityReason: emptyValidity.reason,
        validitySummary: buildValiditySummary([], scanStats, usedMock, false, null, phase1DataSource),
      };
      return NextResponse.json(empty);
    }

    // ── Step 3: Classify Ramadan candidates per Gregorian year ──
    // Candidate = closest conjunction to estimateRamadanConjDate(year).
    // No hard threshold — always pick the closest, labelled with actual distance.
    const candidateISOSet   = new Set<string>();
    const candidateNoteMap  = new Map<string, string>();
    const candidateDistMap  = new Map<string, number>();

    for (let year = fromYear; year <= toYear; year++) {
      const estimatedDate = estimateRamadanConjDate(year);
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < conjunctions.length; i++) {
        const dist = Math.abs(conjunctions[i].t.getTime() - estimatedDate.getTime());
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      if (bestIdx < 0) continue;

      const iso      = conjunctions[bestIdx].iso;
      const distDays = parseFloat((bestDist / 86400000).toFixed(1));
      const estStr   = estimatedDate.toISOString().slice(0, 10);

      let note: string;
      if (distDays <= 15) {
        note = `Kandidat awal Ramadan untuk tahun target ${year} — selisih ${distDays} hari dari estimasi (${estStr})`;
      } else if (distDays <= 35) {
        note = `Kandidat awal Ramadan untuk tahun target ${year} — selisih ${distDays} hari dari estimasi. Periksa kelengkapan data HORIZONS untuk tahun ini.`;
      } else {
        note = `Kandidat perkiraan Ramadan tahun ${year} — selisih ${distDays} hari dari estimasi. Data konjungsi kemungkinan tidak lengkap untuk tahun ini.`;
      }

      candidateISOSet.add(iso);
      candidateNoteMap.set(iso, note);
      candidateDistMap.set(iso, distDays);
    }

    // ── Step 4: Compute local sunset (no HORIZONS needed) ──
    const sunsetData: Array<{ sunsetUTC: Date; sunsetLocal: string } | null> =
      conjunctions.map(c => {
        try {
          const dateStr = c.t.toISOString().slice(0, 10);
          const r = getSunset(dateStr, lat, lon, tz);
          return { sunsetUTC: r.sunsetUTC, sunsetLocal: r.sunsetLocal };
        } catch {
          return null;
        }
      });

    const sunsetEpochs: Date[] = sunsetData.map((s, i) =>
      s ? s.sunsetUTC : conjunctions[i].t
    );

    // ── Helper: build a Phase 1 row (detail fields null) ──
    function buildPhase1Row(i: number): ConjunctionRow {
      const conj = conjunctions[i];
      const ss   = sunsetData[i];
      const moonAgeHours = ss
        ? parseFloat(((ss.sunsetUTC.getTime() - conj.t.getTime()) / 3600000).toFixed(3))
        : null;
      const isCandidate = candidateISOSet.has(conj.iso);

      return {
        year:         conj.t.getUTCFullYear(),
        conjDate:     conj.iso.slice(0, 10),
        conjTimeUTC:  conj.iso.slice(11, 19),
        conjISO:      conj.iso,
        sunsetLocal:  ss?.sunsetLocal ?? null,
        sunsetUTC:    ss ? ss.sunsetUTC.toISOString() : null,
        moonAgeHours,
        eclMoonDeg:     null,
        eclSunDeg:      null,
        eclDiffDeg:     null,
        eclDataValid:   null,
        geoElongDeg:    null,
        geoMoonAltDeg:  null,
        raMoonDeg:      null,
        decMoonDeg:     null,
        raSunDeg:       null,
        decSunDeg:      null,
        topoMoonAltDeg: null,
        topoMoonAzDeg:  null,
        isRamadanCandidate: isCandidate,
        candidateNote: isCandidate
          ? (candidateNoteMap.get(conj.iso) ?? 'Kandidat awal Ramadan')
          : 'Bukan kandidat awal Ramadan',
        candidateDistDays: isCandidate ? (candidateDistMap.get(conj.iso) ?? null) : null,
        khgtPass:        null,
        khgtAltMargin:   null,
        khgtElongMargin: null,
        whRuleA:              null,
        whRuleB:              null,
        whFulfilled:          null,
        whIsBorderline:       null,
        whMoonAltAtSunsetDeg: null,
        whNote:               null,
      };
    }

    // ── Phase 1 short-circuit ──
    if (phase === 1) {
      const rows = conjunctions.map((_, i) => buildPhase1Row(i));
      const phase1Validity = computeAcademicValidity(usedMock, false, null, phase1DataSource);
      const resp: KonjungsiResponse = {
        rows, total: rows.length, phase: 1, scope: null,
        dataSource: null, dataSourceNote: null,
        hasRejectedMockData: false, rejectedMockNote: null,
        hasSuspiciousConstantValues: false,
        horizonsAvailable, usedMock,
        failedRequestCount: scanStats.failedCount,
        mockRequestCount: scanStats.mockCount,
        phase1DataSource,
        phase1AcademicWarning,
        academicValidityStatus: phase1Validity.status,
        academicValidityReason: phase1Validity.reason,
        validitySummary: buildValiditySummary(rows, scanStats, usedMock, false, null, phase1DataSource),
      };
      return NextResponse.json(resp);
    }

    // ── Phase 2: Full astronomical enrichment ──
    // ACADEMIC DATA POLICY: if a HORIZONS batch returns source='mock', the affected
    // columns remain null — fake values are never written to academic columns.

    // Determine which rows to enrich based on scope
    const enrichIndices: number[] = scope === 'candidates'
      ? conjunctions.map((c, i) => candidateISOSet.has(c.iso) ? i : -1).filter(i => i >= 0)
      : conjunctions.map((_, i) => i);

    const enrichEpochsConj:   Date[] = enrichIndices.map(i => conjunctions[i].t);
    const enrichEpochsSunset: Date[] = enrichIndices.map(i => sunsetEpochs[i]);

    const eclMoonArr: (number | null)[] = enrichIndices.map(() => null);
    const eclSunArr:  (number | null)[] = enrichIndices.map(() => null);
    type RADecEntry = { raMoon: number; decMoon: number; raSun: number; decSun: number } | null;
    const raDecArr: RADecEntry[]          = enrichIndices.map(() => null);
    const topoArr: ({ az: number; el: number } | null)[] = enrichIndices.map(() => null);

    const p2Sources         = new Set<string>();
    let hasRejectedMockData = false;
    const BATCH = 40;

    // Ecliptic longitudes at conjunction times
    if (enrichEpochsConj.length > 0) {
      for (let bi = 0; bi < enrichEpochsConj.length; bi += BATCH) {
        const batchEpochs = enrichEpochsConj.slice(bi, bi + BATCH);
        try {
          const [moonEclRes, sunEclRes] = await Promise.all([
            getEclipticLon("'301'", batchEpochs),
            getEclipticLon("'10'",  batchEpochs),
          ]);

          const moonSrc = moonEclRes.results[0]?.source ?? 'mock';
          const sunSrc  = sunEclRes.results[0]?.source  ?? 'mock';
          p2Sources.add(moonSrc);
          p2Sources.add(sunSrc);

          // REJECT mock — do not write fake ecliptic lon values
          if (moonSrc === 'mock' || sunSrc === 'mock') {
            hasRejectedMockData = true;
          } else {
            for (let j = 0; j < batchEpochs.length; j++) {
              const mr = moonEclRes.results[j];
              const sr = sunEclRes.results[j];
              if (mr && sr) {
                eclMoonArr[bi + j] = mr.ecLon;
                eclSunArr[bi + j]  = sr.ecLon;
              }
            }
          }
        } catch {
          // HORIZONS error — leave null
        }
      }
    }

    // Geocentric RA/Dec at sunset epochs
    if (enrichEpochsSunset.length > 0) {
      for (let bi = 0; bi < enrichEpochsSunset.length; bi += BATCH) {
        const batchEpochs = enrichEpochsSunset.slice(bi, bi + BATCH);
        try {
          const [moonRes, sunRes] = await Promise.all([
            getGeocentricApparentRADec("'301'", batchEpochs),
            getGeocentricApparentRADec("'10'",  batchEpochs),
          ]);

          const moonSrc = moonRes.results[0]?.source ?? 'mock';
          p2Sources.add(moonSrc);

          // REJECT mock RA/Dec
          if (moonSrc === 'mock') {
            hasRejectedMockData = true;
          } else {
            for (let j = 0; j < batchEpochs.length; j++) {
              const mr = moonRes.results[j];
              const sr = sunRes.results[j];
              if (mr && sr) {
                raDecArr[bi + j] = {
                  raMoon: mr.ra, decMoon: mr.dec,
                  raSun:  sr.ra, decSun:  sr.dec,
                };
              }
            }
          }
        } catch {
          // HORIZONS error — leave null
        }
      }
    }

    // Topocentric Az/El at sunset (candidates only to save quota)
    const candidatePositions = enrichIndices
      .map((origIdx, enrichPos) =>
        candidateISOSet.has(conjunctions[origIdx].iso) ? enrichPos : -1
      )
      .filter(p => p >= 0);

    if (candidatePositions.length > 0) {
      for (let bi = 0; bi < candidatePositions.length; bi += BATCH) {
        const batchPos    = candidatePositions.slice(bi, bi + BATCH);
        const batchEpochs = batchPos.map(p => enrichEpochsSunset[p]);
        try {
          const topoRes = await getTopoAzEl("'301'", batchEpochs, lat, lon);

          const topoSrc = topoRes.results[0]?.source ?? 'mock';
          p2Sources.add(topoSrc);

          // REJECT mock topo data
          if (topoSrc === 'mock') {
            hasRejectedMockData = true;
          } else {
            for (let j = 0; j < batchPos.length; j++) {
              const r = topoRes.results[j];
              if (r) topoArr[batchPos[j]] = { az: r.az, el: r.el };
            }
          }
        } catch {
          // HORIZONS error — leave null
        }
      }
    }

    // ── Compute Phase 2 combined data source ──
    const p2HasLive  = p2Sources.has('live');
    const p2HasCache = p2Sources.has('cache');
    const p2HasMock  = p2Sources.has('mock');
    let p2DataSource: DataSource;
    let p2Note: string | null = null;

    if (p2HasMock && (p2HasLive || p2HasCache)) {
      p2DataSource = 'mixed';
    } else if (p2HasMock) {
      p2DataSource = 'mock';
    } else if (p2HasLive) {
      p2DataSource = 'live';
    } else if (p2HasCache) {
      p2DataSource = 'cache';
    } else {
      p2DataSource = 'cache';
    }

    if (hasRejectedMockData) {
      p2Note =
        'Beberapa query HORIZONS gagal (HTTP 502/503) dan fallback ke data simulasi. ' +
        'Kolom yang terpengaruh ditampilkan sebagai "—" karena data simulasi TIDAK VALID untuk keperluan akademik. ' +
        'Jalankan ulang Muat Parameter Detail saat koneksi NASA/JPL HORIZONS tersedia.';
    }

    // Check for suspicious constant ecliptic lon (5+ identical values → likely mock leak)
    const validEclMoon = eclMoonArr.filter(v => v !== null) as number[];
    let hasSuspiciousConstantValues = false;
    if (validEclMoon.length >= 5) {
      const first = validEclMoon[0];
      hasSuspiciousConstantValues = validEclMoon.slice(0, 5).every(v => Math.abs(v - first) < 0.001);
    }

    // Map conjISO → enrichPos for fast lookup
    const isoToEnrichPos = new Map<string, number>();
    enrichIndices.forEach((origIdx, enrichPos) => {
      isoToEnrichPos.set(conjunctions[origIdx].iso, enrichPos);
    });

    const rows: ConjunctionRow[] = conjunctions.map((_, i) => {
      const base = buildPhase1Row(i);
      const ep   = isoToEnrichPos.get(conjunctions[i].iso);

      if (ep === undefined) return base; // not in enriched set (scope=candidates)

      const ss      = sunsetData[i];
      const eclMoon = eclMoonArr[ep];
      const eclSun  = eclSunArr[ep];
      const eclDiff = eclMoon !== null && eclSun !== null
        ? parseFloat((eclMoon - eclSun).toFixed(6))
        : null;
      const eclDataValid = eclDiff !== null ? Math.abs(eclDiff) <= 2.0 : null;

      const rd = raDecArr[ep];
      let geoElong:   number | null = null;
      let geoMoonAlt: number | null = null;
      if (rd && ss) {
        geoElong   = parseFloat(geocentricElongDeg(rd.raMoon, rd.decMoon, rd.raSun, rd.decSun).toFixed(4));
        geoMoonAlt = parseFloat(geocentricAltDeg(rd.raMoon, rd.decMoon, lat, lon, ss.sunsetUTC).toFixed(4));
      }

      const topo = topoArr[ep];

      let khgtPass:        boolean | null = null;
      let khgtAltMargin:   number  | null = null;
      let khgtElongMargin: number  | null = null;
      if (geoMoonAlt !== null && geoElong !== null) {
        const khgt      = checkKHGT(geoMoonAlt, geoElong);
        khgtPass        = khgt.pass;
        khgtAltMargin   = parseFloat(khgt.altMargin.toFixed(4));
        khgtElongMargin = parseFloat(khgt.elongMargin.toFixed(4));
      }

      // Wujudul Hilal (Rule A/B) — candidate rows only, based on the active observation
      // location (lat/lon/tz from the request). Computational research output only —
      // NOT a legal ruling on the start of Ramadan.
      let whRuleA:              boolean | null = null;
      let whRuleB:              boolean | null = null;
      let whFulfilled:          boolean | null = null;
      let whIsBorderline:       boolean | null = null;
      let whMoonAltAtSunsetDeg: number  | null = null;
      let whNote:               string  | null = null;

      if (base.isRamadanCandidate) {
        if (topo && ss) {
          const candidateDate = ss.sunsetLocal ? ss.sunsetLocal.slice(0, 10) : base.conjDate;
          const wh = checkWujudulHilal({
            conjunctionUTC: conjunctions[i].t,
            sunsetUTC: ss.sunsetUTC,
            moonAltAtSunsetDeg: topo.el,
            candidateDate,
          });
          whRuleA = wh.ruleA;
          whRuleB = wh.ruleB;
          whFulfilled = wh.fulfilled;
          whIsBorderline = wh.isBorderline;
          whMoonAltAtSunsetDeg = parseFloat(wh.moonAltAtSunsetDeg.toFixed(4));
          whNote = wh.fulfilled
            ? 'Kriteria Wujudul Hilal (Rule A dan Rule B) terpenuhi berdasarkan lokasi pengamatan yang ditentukan pengguna. Hasil ini adalah keluaran komputasi riset, bukan penetapan hukum awal Ramadan.'
            : 'Kriteria Wujudul Hilal (Rule A dan/atau Rule B) belum terpenuhi berdasarkan lokasi pengamatan yang ditentukan pengguna.';
        } else {
          whNote =
            'Data topocentric untuk lokasi pengamatan ini tidak tersedia atau ditolak ' +
            '(mock/fallback) — evaluasi Wujudul Hilal tidak dapat dihitung untuk baris ini.';
        }
      }

      return {
        ...base,
        eclMoonDeg:     eclMoon !== null ? parseFloat(eclMoon.toFixed(6)) : null,
        eclSunDeg:      eclSun  !== null ? parseFloat(eclSun.toFixed(6))  : null,
        eclDiffDeg:     eclDiff,
        eclDataValid,
        geoElongDeg:    geoElong,
        geoMoonAltDeg:  geoMoonAlt,
        raMoonDeg:      rd ? parseFloat(rd.raMoon.toFixed(4))  : null,
        decMoonDeg:     rd ? parseFloat(rd.decMoon.toFixed(4)) : null,
        raSunDeg:       rd ? parseFloat(rd.raSun.toFixed(4))   : null,
        decSunDeg:      rd ? parseFloat(rd.decSun.toFixed(4))  : null,
        topoMoonAltDeg: topo ? parseFloat(topo.el.toFixed(4)) : null,
        topoMoonAzDeg:  topo ? parseFloat(topo.az.toFixed(4)) : null,
        khgtPass,
        khgtAltMargin,
        khgtElongMargin,
        whRuleA,
        whRuleB,
        whFulfilled,
        whIsBorderline,
        whMoonAltAtSunsetDeg,
        whNote,
      };
    });

    const phase2Validity = computeAcademicValidity(usedMock, hasRejectedMockData, p2DataSource, phase1DataSource);

    const resp: KonjungsiResponse = {
      rows,
      total: rows.length,
      phase: 2,
      scope,
      dataSource: p2DataSource,
      dataSourceNote: p2Note,
      hasRejectedMockData,
      rejectedMockNote: hasRejectedMockData ? p2Note : null,
      hasSuspiciousConstantValues,
      horizonsAvailable,
      usedMock,
      failedRequestCount: scanStats.failedCount,
      mockRequestCount: scanStats.mockCount,
      phase1DataSource,
      phase1AcademicWarning,
      academicValidityStatus: phase2Validity.status,
      academicValidityReason: phase2Validity.reason,
      validitySummary: buildValiditySummary(
        rows, scanStats, usedMock, hasRejectedMockData, p2DataSource, phase1DataSource
      ),
    };
    return NextResponse.json(resp);

  } catch (err) {
    console.error('[konjungsi-periode] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
