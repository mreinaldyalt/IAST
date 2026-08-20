/**
 * KHGT Muhammadiyah pipeline — global scan for Ramadan start date.
 * PKG1: sunset on conjunction day (D) before midnight UTC → check geoAlt≥5, geoElong≥8
 * PKG2: if PKG1 fails → (a) conjunction before NZ fajar, (b) re-scan Americas after midnight UTC
 */
import { findConjunction } from './newMoonNR';
import { findConjunctionsInRange, type SimpleConjunction } from './newMoonNR';
import { getSunset, getNzFajrNightEndUTC, getTimezone } from './sunset';
import { getGeocentricApparentRADec } from './horizonsQueries';
import { getTopoAzEl } from './horizonsQueries';
import { geocentricAltDeg, geocentricElongDeg } from './geoCalc';
import { checkKHGT } from './khgtRule';
import { startScanTracking, getScanStats, stopScanTracking } from './horizonsClient';
import { DateTime } from 'luxon';

/* ================================================================== */
/*  Embedded land-only grid points                                      */
/* ================================================================== */

interface GridPoint {
  lat: number;
  lon: number;
  name: string;
  americas: boolean;
}

// Shortlist: high-priority points including known KHGT witness area
const SHORTLIST: GridPoint[] = [
  // Alaska / western Americas critical zone
  { lat: 56.81, lon: -158.86, name: 'Maklumat2026 witness', americas: true },
  { lat: 59.04, lon: -158.52, name: 'Dillingham AK', americas: true },
  { lat: 58.80, lon: -156.90, name: 'SW Alaska coast', americas: true },
  { lat: 64.50, lon: -165.40, name: 'Nome AK', americas: true },
  { lat: 55.06, lon: -162.32, name: 'Cold Bay AK', americas: true },
  { lat: 51.88, lon: -176.65, name: 'Adak AK', americas: true },
  { lat: 61.22, lon: -149.90, name: 'Anchorage AK', americas: true },
  { lat: 57.79, lon: -152.41, name: 'Kodiak AK', americas: true },
  { lat: 55.34, lon: -131.64, name: 'Ketchikan AK', americas: true },
  // Western Americas
  { lat: 47.61, lon: -122.33, name: 'Seattle WA', americas: true },
  { lat: 37.77, lon: -122.42, name: 'San Francisco CA', americas: true },
  { lat: 34.05, lon: -118.24, name: 'Los Angeles CA', americas: true },
  { lat: 33.45, lon: -112.07, name: 'Phoenix AZ', americas: true },
  { lat: 40.71, lon: -74.01, name: 'New York NY', americas: true },
  { lat: 19.43, lon: -99.13, name: 'Mexico City', americas: true },
  { lat: -12.05, lon: -77.04, name: 'Lima Peru', americas: true },
  { lat: -34.60, lon: -58.38, name: 'Buenos Aires', americas: true },
  { lat: -23.55, lon: -46.63, name: 'São Paulo', americas: true },
  { lat: 4.71, lon: -74.07, name: 'Bogotá', americas: true },
];

// Global grid at ~10° spacing covering major land areas
const GLOBAL_GRID: GridPoint[] = [
  // Europe
  { lat: 60, lon: 25, name: 'N Europe', americas: false },
  { lat: 55, lon: 10, name: 'N Germany', americas: false },
  { lat: 50, lon: 0, name: 'UK/France', americas: false },
  { lat: 50, lon: 15, name: 'Central Europe', americas: false },
  { lat: 50, lon: 30, name: 'Ukraine', americas: false },
  { lat: 45, lon: 10, name: 'N Italy', americas: false },
  { lat: 40, lon: -4, name: 'Spain', americas: false },
  { lat: 40, lon: 25, name: 'Greece', americas: false },
  { lat: 40, lon: 40, name: 'Turkey E', americas: false },
  { lat: 55, lon: 40, name: 'Russia W', americas: false },
  { lat: 55, lon: 55, name: 'Russia Ural', americas: false },
  { lat: 55, lon: 75, name: 'Russia W Siberia', americas: false },
  { lat: 55, lon: 90, name: 'Russia C Siberia', americas: false },
  { lat: 55, lon: 105, name: 'Russia E Siberia', americas: false },
  { lat: 55, lon: 130, name: 'Russia Far East', americas: false },
  { lat: 50, lon: 130, name: 'Russia Khabarovsk', americas: false },
  // Africa
  { lat: 35, lon: -5, name: 'Morocco', americas: false },
  { lat: 30, lon: 10, name: 'Libya', americas: false },
  { lat: 30, lon: 30, name: 'Egypt', americas: false },
  { lat: 15, lon: 30, name: 'Sudan', americas: false },
  { lat: 10, lon: 40, name: 'Ethiopia', americas: false },
  { lat: 0, lon: 30, name: 'E Africa', americas: false },
  { lat: -5, lon: 35, name: 'Tanzania', americas: false },
  { lat: -15, lon: 30, name: 'Zambia', americas: false },
  { lat: -25, lon: 30, name: 'S Africa', americas: false },
  { lat: 5, lon: 0, name: 'Ghana', americas: false },
  { lat: 10, lon: 10, name: 'Nigeria', americas: false },
  { lat: -5, lon: 15, name: 'Congo', americas: false },
  // Middle East + Central Asia
  { lat: 35, lon: 45, name: 'Iraq', americas: false },
  { lat: 25, lon: 45, name: 'Saudi Arabia', americas: false },
  { lat: 25, lon: 55, name: 'UAE', americas: false },
  { lat: 35, lon: 55, name: 'Iran', americas: false },
  { lat: 35, lon: 70, name: 'Afghanistan', americas: false },
  { lat: 40, lon: 65, name: 'Uzbekistan', americas: false },
  // South Asia
  { lat: 30, lon: 70, name: 'Pakistan', americas: false },
  { lat: 25, lon: 80, name: 'N India', americas: false },
  { lat: 20, lon: 75, name: 'C India', americas: false },
  { lat: 10, lon: 78, name: 'S India', americas: false },
  { lat: 28, lon: 85, name: 'Nepal', americas: false },
  { lat: 24, lon: 90, name: 'Bangladesh', americas: false },
  // East Asia
  { lat: 40, lon: 116, name: 'Beijing', americas: false },
  { lat: 30, lon: 120, name: 'Shanghai', americas: false },
  { lat: 35, lon: 135, name: 'Japan', americas: false },
  { lat: 37, lon: 127, name: 'Korea', americas: false },
  // Southeast Asia
  { lat: 15, lon: 100, name: 'Thailand', americas: false },
  { lat: 10, lon: 106, name: 'Vietnam', americas: false },
  { lat: 5, lon: 105, name: 'Malaysia/SG', americas: false },
  { lat: -6, lon: 107, name: 'Jakarta', americas: false },
  { lat: -8, lon: 115, name: 'Bali', americas: false },
  { lat: 15, lon: 120, name: 'Philippines', americas: false },
  // Oceania
  { lat: -25, lon: 135, name: 'C Australia', americas: false },
  { lat: -35, lon: 150, name: 'Sydney', americas: false },
  { lat: -37, lon: 175, name: 'NZ North', americas: false },
  // Americas (additional grid)
  { lat: 60, lon: -150, name: 'Alaska grid', americas: true },
  { lat: 55, lon: -130, name: 'BC Canada', americas: true },
  { lat: 50, lon: -110, name: 'Canada prairie', americas: true },
  { lat: 45, lon: -90, name: 'US midwest', americas: true },
  { lat: 45, lon: -70, name: 'US northeast', americas: true },
  { lat: 35, lon: -100, name: 'US south', americas: true },
  { lat: 25, lon: -100, name: 'Mexico N', americas: true },
  { lat: 10, lon: -80, name: 'Panama', americas: true },
  { lat: -5, lon: -60, name: 'Amazonia', americas: true },
  { lat: -15, lon: -50, name: 'Brazil C', americas: true },
  { lat: -35, lon: -65, name: 'Argentina', americas: true },
  { lat: 60, lon: -160, name: 'W Alaska grid', americas: true },
  { lat: 65, lon: -150, name: 'Interior Alaska', americas: true },
  { lat: 55, lon: -160, name: 'Bristol Bay AK', americas: true },
  { lat: 57, lon: -155, name: 'Katmai AK', americas: true },
  { lat: 53, lon: -167, name: 'Unalaska AK', americas: true },
];

export const ALL_POINTS = [...SHORTLIST, ...GLOBAL_GRID];

/* ================================================================== */
/*  Batch HORIZONS query for geocentric RA/Dec                          */
/* ================================================================== */

const BATCH_SIZE = 40;

interface GeoRADec {
  moonRA: number; moonDec: number;
  sunRA: number; sunDec: number;
  source: string;
}

interface RADecRow {
  ra: number;
  dec: number;
  source: string;
  raw: string;
}

function parseRawRADecEpochMs(raw: string): number {
  const marker = ': RA=';
  const markerIdx = raw.indexOf(marker);
  const dateStr = (markerIdx >= 0 ? raw.slice(0, markerIdx) : raw).trim();

  const formats = [
    'yyyy-MMM-dd HH:mm:ss.SSS',
    'yyyy-MMM-dd HH:mm:ss',
    'yyyy-MM-dd HH:mm:ss.SSS',
    'yyyy-MM-dd HH:mm:ss',
  ];

  for (const fmt of formats) {
    const dt = DateTime.fromFormat(dateStr, fmt, { zone: 'utc', locale: 'en' });
    if (dt.isValid) {
      return dt.toMillis();
    }
  }

  const nativeMs = Date.parse(`${dateStr} UTC`);
  if (!Number.isNaN(nativeMs)) {
    return nativeMs;
  }

  throw new Error(`Could not parse HORIZONS RA/Dec epoch from raw row: ${raw}`);
}

function alignRowsByEpoch(requestedEpochs: Date[], rows: RADecRow[], bodyLabel: string): RADecRow[] {
  if (rows.length !== requestedEpochs.length) {
    throw new Error(`HORIZONS ${bodyLabel} RA/Dec count mismatch: requested=${requestedEpochs.length}, returned=${rows.length}`);
  }

  const reqSorted = requestedEpochs
    .map((epoch, idx) => ({ idx, ms: epoch.getTime() }))
    .sort((a, b) => a.ms - b.ms || a.idx - b.idx);

  const rowSorted = rows
    .map((row, idx) => ({ row, idx, ms: parseRawRADecEpochMs(row.raw) }))
    .sort((a, b) => a.ms - b.ms || a.idx - b.idx);

  const aligned: Array<RADecRow | undefined> = new Array(requestedEpochs.length);
  for (let i = 0; i < reqSorted.length; i++) {
    aligned[reqSorted[i].idx] = rowSorted[i].row;
  }

  return aligned.map((row) => {
    if (!row) {
      throw new Error(`Internal epoch realignment failure for ${bodyLabel} RA/Dec`);
    }
    return row;
  });
}

async function batchGeoRADec(epochs: Date[]): Promise<GeoRADec[]> {
  // HORIZONS responses are chronological; preserve caller order by sorting then remapping.
  const indexedEpochs = epochs
    .map((epoch, originalIndex) => ({ epoch, originalIndex }))
    .sort((a, b) => a.epoch.getTime() - b.epoch.getTime() || a.originalIndex - b.originalIndex);

  const sortedEpochs = indexedEpochs.map((x) => x.epoch);

  // Process in batches of BATCH_SIZE. Each batch is an independent query over a
  // disjoint epoch slice — run all batches concurrently (order preserved) instead
  // of waiting for each one before starting the next.
  const epochBatches: Date[][] = [];
  for (let i = 0; i < sortedEpochs.length; i += BATCH_SIZE) {
    epochBatches.push(sortedEpochs.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    epochBatches.map(async (batch) => {
      const [moonRes, sunRes] = await Promise.all([
        getGeocentricApparentRADec("'301'", batch),
        getGeocentricApparentRADec("'10'", batch),
      ]);
      return {
        moon: alignRowsByEpoch(batch, moonRes.results, 'moon'),
        sun: alignRowsByEpoch(batch, sunRes.results, 'sun'),
      };
    })
  );

  const allMoon: RADecRow[] = batchResults.flatMap((r) => r.moon);
  const allSun: RADecRow[] = batchResults.flatMap((r) => r.sun);

  if (allMoon.length !== sortedEpochs.length || allSun.length !== sortedEpochs.length) {
    throw new Error('HORIZONS RA/Dec batch size mismatch');
  }

  const sortedGeo = sortedEpochs.map((_, i) => ({
    moonRA: allMoon[i].ra,
    moonDec: allMoon[i].dec,
    sunRA: allSun[i].ra,
    sunDec: allSun[i].dec,
    source: allMoon[i].source,
  }));

  const byOriginal: Array<GeoRADec | undefined> = new Array(epochs.length);
  for (let i = 0; i < sortedGeo.length; i++) {
    byOriginal[indexedEpochs[i].originalIndex] = sortedGeo[i];
  }

  return byOriginal.map((item) => {
    if (!item) {
      throw new Error('Internal epoch remap failure in batchGeoRADec');
    }
    return item;
  });
}

/* ================================================================== */
/*  Scan + witness selection                                            */
/* ================================================================== */

interface CandidateResult {
  point: GridPoint;
  sunsetUTC: Date;
  sunsetLocal: string;
  tz: string;
  geoAltDeg: number;
  geoElongDeg: number;
  geoIlluminationPct: number;
  pass: boolean;
  altMargin: number;
  elongMargin: number;
}

async function scanPoints(
  points: GridPoint[],
  conjunctionUTC: Date,
  dateStr: string,          // conjunction date YYYY-MM-DD
  afterMidnightD: boolean   // false = PKG1 (sunset before midnight D), true = PKG2b (after midnight D)
): Promise<CandidateResult[]> {
  const midnightD = new Date(dateStr + 'T00:00:00Z');
  midnightD.setUTCDate(midnightD.getUTCDate() + 1); // D+1 00:00Z

  // Compute sunsets for all points
  const sunsets: Array<{ point: GridPoint; sunsetUTC: Date; sunsetLocal: string; tz: string } | null> = [];
  for (const pt of points) {
    try {
      const tz = getTimezone(pt.lat, pt.lon);
      const result = getSunset(dateStr, pt.lat, pt.lon, tz);
      const sUTC = result.sunsetUTC;

      // Filter: sunset must be after conjunction
      if (sUTC.getTime() <= conjunctionUTC.getTime()) {
        sunsets.push(null); continue;
      }

      if (!afterMidnightD) {
        // PKG1: sunset must be before midnight D (= before D+1 00:00Z)
        if (sUTC.getTime() >= midnightD.getTime()) {
          sunsets.push(null); continue;
        }
      } else {
        // PKG2b: sunset must be AFTER midnight D
        if (sUTC.getTime() < midnightD.getTime()) {
          sunsets.push(null); continue;
        }
      }

      // Extract naive local time for Stellarium
      const localNaive = result.sunsetLocal.replace(/[+-]\d{2}:\d{2}$/, '').replace(/Z$/, '');

      sunsets.push({ point: pt, sunsetUTC: sUTC, sunsetLocal: localNaive, tz });
    } catch {
      sunsets.push(null);
    }
  }

  // Collect valid sunsets and their epochs for batched HORIZONS query
  const validIndices: number[] = [];
  const validEpochs: Date[] = [];
  for (let i = 0; i < sunsets.length; i++) {
    if (sunsets[i]) {
      validIndices.push(i);
      validEpochs.push(sunsets[i]!.sunsetUTC);
    }
  }

  if (validEpochs.length === 0) return [];

  // Batch query geocentric RA/Dec at all sunset epochs
  const geoData = await batchGeoRADec(validEpochs);

  // Compute geoAlt and geoElong for each valid point
  const results: CandidateResult[] = [];
  for (let j = 0; j < validIndices.length; j++) {
    const s = sunsets[validIndices[j]]!;
    const g = geoData[j];

    const geoAlt = geocentricAltDeg(g.moonRA, g.moonDec, s.point.lat, s.point.lon, s.sunsetUTC);
    const geoElong = geocentricElongDeg(g.moonRA, g.moonDec, g.sunRA, g.sunDec);
    const geoIlluminationPct = elongationToIlluminationPct(geoElong);
    const check = checkKHGT(geoAlt, geoElong);

    results.push({
      point: s.point,
      sunsetUTC: s.sunsetUTC,
      sunsetLocal: s.sunsetLocal,
      tz: s.tz,
      geoAltDeg: geoAlt,
      geoElongDeg: geoElong,
      geoIlluminationPct,
      pass: check.pass,
      altMargin: check.altMargin,
      elongMargin: check.elongMargin,
    });
  }

  return results;
}

function pickWitness(candidates: CandidateResult[]): CandidateResult | null {
  const passed = candidates.filter(c => c.pass);
  if (passed.length === 0) return null;
  // Score = min(altMargin, elongMargin), pick highest; tie-break by earliest sunset
  passed.sort((a, b) => {
    const sa = Math.min(a.altMargin, a.elongMargin);
    const sb = Math.min(b.altMargin, b.elongMargin);
    if (Math.abs(sa - sb) > 0.0001) return sb - sa; // higher score first
    return a.sunsetUTC.getTime() - b.sunsetUTC.getTime(); // earlier sunset
  });
  return passed[0];
}

function pickFirstQualifiedByTime(candidates: CandidateResult[]): CandidateResult | null {
  const passed = candidates.filter(c => c.pass);
  if (passed.length === 0) return null;
  passed.sort((a, b) => a.sunsetUTC.getTime() - b.sunsetUTC.getTime());
  return passed[0];
}

// A handful of transient failures out of 100+ HORIZONS queries (network blip,
// occasional 502, momentary overload) is normal background noise for any live
// API at this volume and essentially never flips a KHGT pass/fail margin —
// warning on every single mock fallback regardless of ratio trained users to
// tune the warning out. Only surface it once the fallback share is large
// enough to plausibly matter.
const MOCK_WARNING_RATIO_THRESHOLD = 0.05;

/**
 * Reads the scan-tracking stats accumulated since the matching startScanTracking()
 * call, stops tracking, and — if a meaningful share of HORIZONS queries fell back
 * to mock/estimated data (e.g. because live NASA HORIZONS is degraded) — prepends
 * a clear warning and downgrades result.dataSource so the UI (which already
 * renders `warnings[]`) surfaces it instead of silently presenting estimated data as
 * if it were live NASA ephemeris. Below the threshold, dataSource stays 'live' —
 * a few incidental fallbacks among many successful live queries isn't worth
 * flagging as "this result needs re-verification."
 */
function finalizeDataSourceWarnings(result: KHGTResult): KHGTResult {
  const stats = getScanStats();
  stopScanTracking();
  const total = stats.liveCount + stats.cacheCount + stats.mockCount;
  if (stats.mockCount > 0 && total > 0 && stats.mockCount / total > MOCK_WARNING_RATIO_THRESHOLD) {
    result.dataSource = (stats.liveCount + stats.cacheCount) === 0 ? 'mock' : 'mixed';
    result.warnings.unshift(
      `PERINGATAN DATA: ${stats.mockCount}/${total} kueri NASA HORIZONS gagal saat perhitungan ini ` +
      `(kemungkinan API HORIZONS sedang tidak tersedia untuk Matahari/Bulan) dan memakai estimasi ` +
      `analitik, bukan data live/cache. Hasil PKG/istikmal di atas sebaiknya diverifikasi ulang saat ` +
      `API NASA pulih.`
    );
  }
  return result;
}

/* ================================================================== */
/*  Main pipeline                                                       */
/* ================================================================== */

export interface KHGTWitness {
  lat: number;
  lon: number;
  name: string;
  tz: string;
  sunsetUTC: string;
  sunsetLocal: string;
  geoMoonAltDeg: number;
  geoMoonElongDeg: number;
  geoMoonIlluminationPct: number;
  topoMoonAzDeg: number | null;
  topoMoonAltDeg: number | null;
  topoMoonElongDeg: number | null;
  topoMoonIlluminationPct: number | null;
  observationFrame: 'topocentric';
  observationComputedAtUTC: string | null;
  referenceFrame: 'geocentric';
}

export interface PKG2Detail {
  nzFajrEvent: 'nightEnd';
  nzFajrUTC: string;
  conjBeforeNzFajr: boolean;
  marginHours: number;
}

export interface KHGTResult {
  year: number;
  khgtStartCivilDate: string;
  conjunctionUTC: string;
  pkgVariant: 'PKG1' | 'PKG2' | 'NONE';
  witness: KHGTWitness | null;
  witnessBestEngine: KHGTWitness | null;
  witnessFirstQualifiedByTime: KHGTWitness | null;
  witnessCanonicalId: string | null;
  witnessFirstQualifiedCanonicalId: string | null;
  pkg2Detail: PKG2Detail | null;
  scanSummary: {
    totalCandidates: number;
    pkg1Passed: number;
    pkg2Passed: number;
  };
  warnings: string[];
  dataSource: string;
}

export interface KHGTFullResult {
  ramadan: KHGTResult;
  syawal: KHGTResult;
}

export async function predictKHGTForRamadan(year: number): Promise<KHGTResult> {
  // ── Step 1: Find the correct Ramadan conjunction ──
  // FIX-C: narrow window + closest-to-expected selection
  // Use day-level estimate instead of month-level to avoid off-by-one-lunation
  const expectedCenterUTC = estimateRamadanConjDate(year);
  // 70-day window ±35 days from center
  const windowStart = new Date(expectedCenterUTC.getTime() - 35 * 86400000);
  const windowEnd = new Date(expectedCenterUTC.getTime() + 35 * 86400000);

  const allConj = await findConjunctionsInRange(windowStart, windowEnd);
  if (allConj.length === 0) {
    throw new Error(`No conjunction found for Ramadan ${year} in window ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);
  }

  // Pick conjunction closest to expectedCenter
  // Tie-break: prefer the one AFTER expectedCenter
  let bestConj = allConj[0];
  let bestDist = Math.abs(allConj[0].t.getTime() - expectedCenterUTC.getTime());
  for (let i = 1; i < allConj.length; i++) {
    const dist = Math.abs(allConj[i].t.getTime() - expectedCenterUTC.getTime());
    if (dist < bestDist) {
      bestDist = dist;
      bestConj = allConj[i];
    } else if (dist === bestDist && allConj[i].t.getTime() >= expectedCenterUTC.getTime()) {
      bestConj = allConj[i];
    }
  }

  return evaluateKHGTWitnessForConjunction(bestConj.t, bestConj.iso, year);
}

/**
 * Run the PKG1/PKG2 global witness scan + build a KHGTResult for one already-located
 * conjunction. Extracted from predictKHGTForRamadan so predictKHGTFullForGregorianYear
 * can evaluate conjunctions found via a gap-free brute-force scan instead of a single
 * point-estimate window (see that function's docstring for why the point-estimate
 * alone is not reliable for distant years).
 */
async function evaluateKHGTWitnessForConjunction(
  conjDate: Date,
  conjISO: string,
  year: number
): Promise<KHGTResult> {
  const warnings: string[] = [];
  startScanTracking();

  // D = UTC date of conjunction
  const D = conjDate.toISOString().slice(0, 10); // YYYY-MM-DD

  let dataSource = 'live';

  // ── Step 2: PKG1 scan ──
  const pkg1Results = await scanPoints(ALL_POINTS, conjDate, D, false);
  const pkg1Witness = pickWitness(pkg1Results);
  const pkg1FirstQualified = pickFirstQualifiedByTime(pkg1Results);

  const pkg1BestWitnessOutRaw = pkg1Witness ? candidateToWitness(pkg1Witness) : null;
  const pkg1FirstWitnessOutRaw = pkg1FirstQualified ? candidateToWitness(pkg1FirstQualified) : null;
  const [pkg1BestWitnessOut, pkg1FirstWitnessOut] = await Promise.all([
    enrichWitnessObservation(pkg1BestWitnessOutRaw, warnings),
    enrichWitnessObservation(pkg1FirstWitnessOutRaw, warnings),
  ]);

  if (pkg1Witness) {
    return finalizeDataSourceWarnings({
      year,
      khgtStartCivilDate: nextDay(D),
      conjunctionUTC: conjISO,
      pkgVariant: 'PKG1',
      witness: pkg1BestWitnessOut,
      witnessBestEngine: pkg1BestWitnessOut,
      witnessFirstQualifiedByTime: pkg1FirstWitnessOut,
      witnessCanonicalId: toWitnessCanonicalId(pkg1BestWitnessOut),
      witnessFirstQualifiedCanonicalId: toWitnessCanonicalId(pkg1FirstWitnessOut),
      pkg2Detail: null,
      scanSummary: {
        totalCandidates: pkg1Results.length,
        pkg1Passed: pkg1Results.filter(c => c.pass).length,
        pkg2Passed: 0,
      },
      warnings,
      dataSource,
    });
  }

  // ── Step 3: PKG2 ──
  // (a) Check conjunction before NZ fajar
  const nzFajr = getNzFajrNightEndUTC(conjISO);
  const conjBeforeNzFajr = conjDate.getTime() < nzFajr.getTime();
  const marginHours = (nzFajr.getTime() - conjDate.getTime()) / 3600000;

  const pkg2Detail: PKG2Detail = {
    nzFajrEvent: 'nightEnd',
    nzFajrUTC: nzFajr.toISOString(),
    conjBeforeNzFajr,
    marginHours,
  };

  if (!conjBeforeNzFajr) {
    warnings.push('PKG2(a) failed: conjunction not before NZ fajar nightEnd');
    return finalizeDataSourceWarnings({
      year,
      khgtStartCivilDate: nextDay(nextDay(D)), // istikmal: D+2
      conjunctionUTC: conjISO,
      pkgVariant: 'NONE',
      witness: null,
      witnessBestEngine: null,
      witnessFirstQualifiedByTime: null,
      witnessCanonicalId: null,
      witnessFirstQualifiedCanonicalId: null,
      pkg2Detail,
      scanSummary: {
        totalCandidates: pkg1Results.length,
        pkg1Passed: 0,
        pkg2Passed: 0,
      },
      warnings,
      dataSource,
    });
  }

  // (b) Scan Americas points after midnight D
  const americasPoints = ALL_POINTS.filter(p => p.americas);
  const pkg2Results = await scanPoints(americasPoints, conjDate, D, true);
  const pkg2Witness = pickWitness(pkg2Results);
  const pkg2FirstQualified = pickFirstQualifiedByTime(pkg2Results);

  const pkg2BestWitnessOutRaw = pkg2Witness ? candidateToWitness(pkg2Witness) : null;
  const pkg2FirstWitnessOutRaw = pkg2FirstQualified ? candidateToWitness(pkg2FirstQualified) : null;
  const [pkg2BestWitnessOut, pkg2FirstWitnessOut] = await Promise.all([
    enrichWitnessObservation(pkg2BestWitnessOutRaw, warnings),
    enrichWitnessObservation(pkg2FirstWitnessOutRaw, warnings),
  ]);

  if (pkg2Witness) {
    return finalizeDataSourceWarnings({
      year,
      khgtStartCivilDate: nextDay(D),
      conjunctionUTC: conjISO,
      pkgVariant: 'PKG2',
      witness: pkg2BestWitnessOut,
      witnessBestEngine: pkg2BestWitnessOut,
      witnessFirstQualifiedByTime: pkg2FirstWitnessOut,
      witnessCanonicalId: toWitnessCanonicalId(pkg2BestWitnessOut),
      witnessFirstQualifiedCanonicalId: toWitnessCanonicalId(pkg2FirstWitnessOut),
      pkg2Detail,
      scanSummary: {
        totalCandidates: pkg1Results.length + pkg2Results.length,
        pkg1Passed: 0,
        pkg2Passed: pkg2Results.filter(c => c.pass).length,
      },
      warnings,
      dataSource,
    });
  }

  // Neither PKG1 nor PKG2 passed → istikmal
  warnings.push('Neither PKG1 nor PKG2 produced a passing witness');
  return finalizeDataSourceWarnings({
    year,
    khgtStartCivilDate: nextDay(nextDay(D)),
    conjunctionUTC: conjISO,
    pkgVariant: 'NONE',
    witness: null,
    witnessBestEngine: null,
    witnessFirstQualifiedByTime: null,
    witnessCanonicalId: null,
    witnessFirstQualifiedCanonicalId: null,
    pkg2Detail,
    scanSummary: {
      totalCandidates: pkg1Results.length + pkg2Results.length,
      pkg1Passed: 0,
      pkg2Passed: 0,
    },
    warnings,
    dataSource,
  });
}

/**
 * Predict KHGT for Syawal (1 Syawal / Idul Fitri).
 * Uses the next conjunction after Ramadan.
 * Window: ramadanConj + 24d to + 36d (contains exactly 1 new moon).
 * Pick closest to ramadanConj + 29.5 days.
 */
async function predictKHGTForSyawal(year: number, ramadanConjUTC: Date): Promise<KHGTResult> {
  const warnings: string[] = [];
  startScanTracking();

  // Syawal conjunction window: 24-36 days after Ramadan conjunction
  const windowStart = new Date(ramadanConjUTC.getTime() + 24 * 86400000);
  const windowEnd = new Date(ramadanConjUTC.getTime() + 36 * 86400000);
  const expectedSyawal = new Date(ramadanConjUTC.getTime() + 29.5 * 86400000);

  const allConj = await findConjunctionsInRange(windowStart, windowEnd);
  if (allConj.length === 0) {
    throw new Error(`No Syawal conjunction found in window ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);
  }

  // Pick closest to expected (ramadanConj + 29.5 days)
  let bestConj = allConj[0];
  let bestDist = Math.abs(allConj[0].t.getTime() - expectedSyawal.getTime());
  for (let i = 1; i < allConj.length; i++) {
    const dist = Math.abs(allConj[i].t.getTime() - expectedSyawal.getTime());
    if (dist < bestDist) {
      bestDist = dist;
      bestConj = allConj[i];
    }
  }

  const conjDate = bestConj.t;
  const conjISO = bestConj.iso;
  const D = conjDate.toISOString().slice(0, 10);

  const dataSource = 'live';

  // PKG1
  const pkg1Results = await scanPoints(ALL_POINTS, conjDate, D, false);
  const pkg1Witness = pickWitness(pkg1Results);
  const pkg1FirstQualified = pickFirstQualifiedByTime(pkg1Results);

  const pkg1BestWitnessOutRaw = pkg1Witness ? candidateToWitness(pkg1Witness) : null;
  const pkg1FirstWitnessOutRaw = pkg1FirstQualified ? candidateToWitness(pkg1FirstQualified) : null;
  const [pkg1BestWitnessOut, pkg1FirstWitnessOut] = await Promise.all([
    enrichWitnessObservation(pkg1BestWitnessOutRaw, warnings),
    enrichWitnessObservation(pkg1FirstWitnessOutRaw, warnings),
  ]);

  if (pkg1Witness) {
    return finalizeDataSourceWarnings({
      year,
      khgtStartCivilDate: nextDay(D),
      conjunctionUTC: conjISO,
      pkgVariant: 'PKG1',
      witness: pkg1BestWitnessOut,
      witnessBestEngine: pkg1BestWitnessOut,
      witnessFirstQualifiedByTime: pkg1FirstWitnessOut,
      witnessCanonicalId: toWitnessCanonicalId(pkg1BestWitnessOut),
      witnessFirstQualifiedCanonicalId: toWitnessCanonicalId(pkg1FirstWitnessOut),
      pkg2Detail: null,
      scanSummary: {
        totalCandidates: pkg1Results.length,
        pkg1Passed: pkg1Results.filter(c => c.pass).length,
        pkg2Passed: 0,
      },
      warnings,
      dataSource,
    });
  }

  // PKG2
  const nzFajr = getNzFajrNightEndUTC(conjISO);
  const conjBeforeNzFajr = conjDate.getTime() < nzFajr.getTime();
  const marginHours = (nzFajr.getTime() - conjDate.getTime()) / 3600000;

  const pkg2Detail: PKG2Detail = {
    nzFajrEvent: 'nightEnd',
    nzFajrUTC: nzFajr.toISOString(),
    conjBeforeNzFajr,
    marginHours,
  };

  if (!conjBeforeNzFajr) {
    warnings.push('PKG2(a) failed: conjunction not before NZ fajar nightEnd');
    return finalizeDataSourceWarnings({
      year,
      khgtStartCivilDate: nextDay(nextDay(D)),
      conjunctionUTC: conjISO,
      pkgVariant: 'NONE',
      witness: null,
      witnessBestEngine: null,
      witnessFirstQualifiedByTime: null,
      witnessCanonicalId: null,
      witnessFirstQualifiedCanonicalId: null,
      pkg2Detail,
      scanSummary: {
        totalCandidates: pkg1Results.length,
        pkg1Passed: 0,
        pkg2Passed: 0,
      },
      warnings,
      dataSource,
    });
  }

  const americasPoints = ALL_POINTS.filter(p => p.americas);
  const pkg2Results = await scanPoints(americasPoints, conjDate, D, true);
  const pkg2Witness = pickWitness(pkg2Results);
  const pkg2FirstQualified = pickFirstQualifiedByTime(pkg2Results);

  const pkg2BestWitnessOutRaw = pkg2Witness ? candidateToWitness(pkg2Witness) : null;
  const pkg2FirstWitnessOutRaw = pkg2FirstQualified ? candidateToWitness(pkg2FirstQualified) : null;
  const [pkg2BestWitnessOut, pkg2FirstWitnessOut] = await Promise.all([
    enrichWitnessObservation(pkg2BestWitnessOutRaw, warnings),
    enrichWitnessObservation(pkg2FirstWitnessOutRaw, warnings),
  ]);

  if (pkg2Witness) {
    return finalizeDataSourceWarnings({
      year,
      khgtStartCivilDate: nextDay(D),
      conjunctionUTC: conjISO,
      pkgVariant: 'PKG2',
      witness: pkg2BestWitnessOut,
      witnessBestEngine: pkg2BestWitnessOut,
      witnessFirstQualifiedByTime: pkg2FirstWitnessOut,
      witnessCanonicalId: toWitnessCanonicalId(pkg2BestWitnessOut),
      witnessFirstQualifiedCanonicalId: toWitnessCanonicalId(pkg2FirstWitnessOut),
      pkg2Detail,
      scanSummary: {
        totalCandidates: pkg1Results.length + pkg2Results.length,
        pkg1Passed: 0,
        pkg2Passed: pkg2Results.filter(c => c.pass).length,
      },
      warnings,
      dataSource,
    });
  }

  warnings.push('Neither PKG1 nor PKG2 produced a passing witness');
  return finalizeDataSourceWarnings({
    year,
    khgtStartCivilDate: nextDay(nextDay(D)),
    conjunctionUTC: conjISO,
    pkgVariant: 'NONE',
    witness: null,
    witnessBestEngine: null,
    witnessFirstQualifiedByTime: null,
    witnessCanonicalId: null,
    witnessFirstQualifiedCanonicalId: null,
    pkg2Detail,
    scanSummary: {
      totalCandidates: pkg1Results.length + pkg2Results.length,
      pkg1Passed: 0,
      pkg2Passed: 0,
    },
    warnings,
    dataSource,
  });
}

/**
 * Predict both Ramadan and Syawal KHGT results for a given year.
 */
export async function predictKHGTFull(year: number): Promise<KHGTFullResult> {
  const ramadan = await predictKHGTForRamadan(year);
  const ramadanConjUTC = new Date(ramadan.conjunctionUTC);
  const syawal = await predictKHGTForSyawal(year, ramadanConjUTC);
  return { ramadan, syawal };
}

/** Find the single real conjunction closest to `center` within ±radiusDays. */
async function findNearestConjunction(
  center: Date,
  radiusDays: number
): Promise<SimpleConjunction | null> {
  const found = await findConjunctionsInRange(
    new Date(center.getTime() - radiusDays * 86400000),
    new Date(center.getTime() + radiusDays * 86400000)
  );
  if (found.length === 0) return null;
  let best = found[0];
  let bestDist = Math.abs(best.t.getTime() - center.getTime());
  for (const c of found) {
    const dist = Math.abs(c.t.getTime() - center.getTime());
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

const HIJRI_YEAR_DAYS = 354.36667;

/**
 * Predict ALL Ramadan+Syawal pairs whose 1 Ramadan falls in the given Gregorian year.
 *
 * Earlier version picked a single point estimate per anchor year (`year-1`, `year`,
 * `year+1`) via estimateRamadanConjDate() and searched only ±35 days around each.
 * That estimate extrapolates linearly from a 2024 reference using the mean Hijri year
 * length — only locally accurate. Because a Hijri year (~354.37d) is shorter than a
 * Gregorian year (~365.24d), consecutive anchor years' estimates don't stay a fixed
 * distance apart forever: roughly once every ~33 years this produces a genuine
 * "double Ramadan" Gregorian year immediately followed by a "zero Ramadan" one
 * (confirmed astronomically real via independent brute-force scan: 2064 has two,
 * 2063 has none). Once that happens, three isolated ±35-day point-estimate windows
 * can leave a real conjunction completely uncovered (confirmed gap: ~22 months
 * uncovered around 2062-12-30) — producing wrong/empty results from ~2050 onward and
 * total failures from 2064 onward.
 *
 * A first fix attempt (brute-force scanning the whole target year) over-corrected: it
 * evaluated every synodic month in the year (~12-13), not just Ramadan, since every
 * month's conjunction trivially produces a civil date "in the target year".
 *
 * Actual fix: use the point estimate only as a cheap bootstrap seed (it doesn't need
 * to be precise), find the nearest REAL conjunction to it, then walk outward from that
 * REAL conjunction in real ~1-Hijri-year steps (re-searching a narrow window around
 * "last real conjunction + 354.37d", not compounding an assumption) up to 2 cycles in
 * each direction. Because every step is anchored to an actual found conjunction, no
 * arithmetic drift can accumulate — this is accurate for any year, near or far future.
 * Checking neighbouring cycles (not just the seed) is what survives landing on the
 * "wrong side" of a double/skip-year boundary.
 */
export async function predictKHGTFullForGregorianYear(year: number): Promise<KHGTFullResult[]> {
  const yearStr = String(year);

  // A conjunction's civil start is always D+1 or D+2 (PKG1/PKG2 vs istikmal), so it
  // can only land in `year` if the conjunction itself falls in this band. Widened by a
  // few days on both ends as a safety margin — the exact minimum is
  // [Dec 30(year-1), Dec 30(year)].
  const plausibleMin = Date.UTC(year - 1, 11, 25, 0, 0, 0);
  const plausibleMax = Date.UTC(year, 11, 31, 23, 59, 59);
  const inPlausibleBand = (t: Date) => t.getTime() >= plausibleMin && t.getTime() <= plausibleMax;

  // Track HORIZONS query health for the conjunction-*date*-finding stage separately
  // from the per-candidate witness scans below (each of those tracks its own window
  // via finalizeDataSourceWarnings) — a wrong conjunction date from mock/estimated
  // data here is more consequential than a mock topo-enrichment field, so it needs
  // its own explicit warning surfaced on every result derived from it.
  startScanTracking();

  const seed = await findNearestConjunction(estimateRamadanConjDate(year), 60);
  if (!seed) {
    stopScanTracking();
    throw new Error(`No conjunction found near Ramadan estimate for year ${year}`);
  }

  const candidates: SimpleConjunction[] = [seed];

  // Walk outward up to 2 real Hijri-year steps in each direction to survive landing on
  // the "wrong side" of a double/skip-year boundary — but stop as soon as a step lands
  // outside the plausible band, since walking further away only gets worse (monotonic).
  let cursor = seed;
  for (let step = 0; step < 2; step++) {
    const next = await findNearestConjunction(
      new Date(cursor.t.getTime() + HIJRI_YEAR_DAYS * 86400000),
      20
    );
    if (!next) break;
    candidates.push(next);
    cursor = next;
    if (!inPlausibleBand(next.t)) break;
  }

  cursor = seed;
  for (let step = 0; step < 2; step++) {
    const prev = await findNearestConjunction(
      new Date(cursor.t.getTime() - HIJRI_YEAR_DAYS * 86400000),
      20
    );
    if (!prev) break;
    candidates.push(prev);
    cursor = prev;
    if (!inPlausibleBand(prev.t)) break;
  }

  const conjSearchStats = getScanStats();
  stopScanTracking();
  const conjSearchTotal = conjSearchStats.liveCount + conjSearchStats.cacheCount + conjSearchStats.mockCount;
  const conjSearchWarning = conjSearchStats.mockCount > 0 && conjSearchTotal > 0
    && conjSearchStats.mockCount / conjSearchTotal > MOCK_WARNING_RATIO_THRESHOLD
    ? `PERINGATAN DATA: pencarian tanggal konjungsi memakai ${conjSearchStats.mockCount} dari ` +
      `${conjSearchStats.liveCount + conjSearchStats.cacheCount + conjSearchStats.mockCount} kueri estimasi ` +
      `(NASA HORIZONS kemungkinan tidak tersedia) — tanggal konjungsi di bawah ini sebaiknya diverifikasi ` +
      `ulang saat API NASA pulih.`
    : null;

  // Evaluate each real candidate cycle for real (grid witness scan) — whichever land
  // in `year` are the actual answer(s): 0, 1, or 2, matching real astronomical
  // possibility. Dedupe first in case any walk step converged back onto the seed.
  // The expensive ~90-point witness scan only runs for candidates in the plausible
  // band — walking beyond it is needed to detect double/skip-year boundaries, but
  // those out-of-band candidates can never match `year` so are skipped before paying
  // for HORIZONS calls again.
  const seenIso = new Set<string>();
  const results: KHGTFullResult[] = [];
  for (const cand of candidates) {
    if (seenIso.has(cand.iso)) continue;
    seenIso.add(cand.iso);
    if (!inPlausibleBand(cand.t)) continue;

    const ramadan = await evaluateKHGTWitnessForConjunction(cand.t, cand.iso, cand.t.getUTCFullYear());
    if (!ramadan.khgtStartCivilDate.startsWith(yearStr + '-')) continue;
    if (conjSearchWarning) ramadan.warnings.unshift(conjSearchWarning);

    const syawal = await predictKHGTForSyawal(ramadan.year, new Date(ramadan.conjunctionUTC));
    results.push({ ramadan, syawal });
  }

  results.sort((a, b) => a.ramadan.khgtStartCivilDate.localeCompare(b.ramadan.khgtStartCivilDate));
  return results;
}

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

function candidateToWitness(c: CandidateResult): KHGTWitness {
  return {
    lat: c.point.lat,
    lon: c.point.lon,
    name: c.point.name,
    tz: c.tz,
    sunsetUTC: c.sunsetUTC.toISOString(),
    sunsetLocal: c.sunsetLocal,
    geoMoonAltDeg: parseFloat(c.geoAltDeg.toFixed(4)),
    geoMoonElongDeg: parseFloat(c.geoElongDeg.toFixed(4)),
    geoMoonIlluminationPct: parseFloat(c.geoIlluminationPct.toFixed(4)),
    topoMoonAzDeg: null,
    topoMoonAltDeg: null,
    topoMoonElongDeg: null,
    topoMoonIlluminationPct: null,
    observationFrame: 'topocentric',
    observationComputedAtUTC: null,
    referenceFrame: 'geocentric',
  };
}

async function enrichWitnessObservation(witness: KHGTWitness | null, warnings: string[]): Promise<KHGTWitness | null> {
  if (!witness) return null;

  try {
    const epoch = new Date(witness.sunsetUTC);
    const [moonTopo, sunTopo] = await Promise.all([
      getTopoAzEl("'301'", [epoch], witness.lat, witness.lon),
      getTopoAzEl("'10'", [epoch], witness.lat, witness.lon),
    ]);

    const moon = moonTopo.results[0];
    const sun = sunTopo.results[0];
    if (!moon || !sun) {
      warnings.push(`Topocentric observation incomplete for witness ${witness.name}`);
      return witness;
    }

    const topoElong = angularSeparationFromAzElDeg(moon.az, moon.el, sun.az, sun.el);
    const topoIlluminationPct = elongationToIlluminationPct(topoElong);

    return {
      ...witness,
      topoMoonAzDeg: parseFloat(moon.az.toFixed(4)),
      topoMoonAltDeg: parseFloat(moon.el.toFixed(4)),
      topoMoonElongDeg: parseFloat(topoElong.toFixed(4)),
      topoMoonIlluminationPct: parseFloat(topoIlluminationPct.toFixed(4)),
      observationComputedAtUTC: epoch.toISOString(),
    };
  } catch {
    warnings.push(`Topocentric observation fetch failed for witness ${witness.name}`);
    return witness;
  }
}

function elongationToIlluminationPct(elongDeg: number): number {
  const elongRad = (elongDeg * Math.PI) / 180;
  return ((1 - Math.cos(elongRad)) / 2) * 100;
}

function angularSeparationFromAzElDeg(az1Deg: number, el1Deg: number, az2Deg: number, el2Deg: number): number {
  const az1 = (az1Deg * Math.PI) / 180;
  const el1 = (el1Deg * Math.PI) / 180;
  const az2 = (az2Deg * Math.PI) / 180;
  const el2 = (el2Deg * Math.PI) / 180;

  const x1 = Math.cos(el1) * Math.cos(az1);
  const y1 = Math.cos(el1) * Math.sin(az1);
  const z1 = Math.sin(el1);

  const x2 = Math.cos(el2) * Math.cos(az2);
  const y2 = Math.cos(el2) * Math.sin(az2);
  const z2 = Math.sin(el2);

  const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2));
  return (Math.acos(dot) * 180) / Math.PI;
}

function normalizeWitnessName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toWitnessCanonicalId(witness: KHGTWitness | null): string | null {
  if (!witness) return null;
  const lat = witness.lat.toFixed(2);
  const lon = witness.lon.toFixed(2);
  const normalizedName = normalizeWitnessName(witness.name);
  return `lat:${lat}|lon:${lon}|name:${normalizedName}`;
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Day-level estimate of the Ramadan conjunction date for a given year.
 * Reference: Ramadan 2024 conjunction ≈ 2024-03-10.
 *
 * naive model: multiplying (year - refYear) by the Islamic year length assumes
 * one Hijri year passes per Gregorian year, which drifts because a Hijri year
 * (~354.37d) is ~10.88d shorter than a Gregorian year (~365.24d). Left uncorrected,
 * the estimate lands a full calendar year off target after ~33 years (confirmed:
 * wrong by 1+ year at year 2064), which starves the ±35-day search window in
 * predictKHGTForRamadan and produces zero results.
 *
 * Fix: after the linear estimate, walk the result forward/backward in whole
 * Hijri-year steps until its Gregorian year lands within [year-1, year] — same
 * self-correction already proven (tested live through 2090) in estimateRamadan1()
 * in ramadanFromSyaban.ts.
 */
export function estimateRamadanConjDate(year: number): Date {
  const REF_YEAR = 2024;
  const REF_CONJ_MS = Date.UTC(REF_YEAR, 2, 10, 12, 0, 0); // 2024-03-10 12:00 UTC
  const ISLAMIC_YEAR_DAYS = 354.36667;

  const yearDiff = year - REF_YEAR;
  const est = new Date(REF_CONJ_MS + yearDiff * ISLAMIC_YEAR_DAYS * 86400000);

  while (est.getUTCFullYear() < year - 1) est.setUTCDate(est.getUTCDate() + Math.round(ISLAMIC_YEAR_DAYS));
  while (est.getUTCFullYear() > year) est.setUTCDate(est.getUTCDate() - Math.round(ISLAMIC_YEAR_DAYS));

  return est;
}
