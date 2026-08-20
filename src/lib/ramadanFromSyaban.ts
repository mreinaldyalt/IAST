/**
 * Ramadan prediction from Sya'ban anchor.
 *
 * Loads anchors_syaban.json, determines conjunction window,
 * runs Newton-Raphson, evaluates Wujudul Hilal rule.
 */
import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { findConjunction, type ConjunctionResult } from './newMoonNR';
import { getSunset } from './sunset';
import { getTopoAzEl } from './horizonsQueries';
import { checkWujudulHilal, type WujudulHilalResult } from './wujudulHilalRule';

interface AnchorEntry {
  gregorianYear: number;
  syaban1LocalDate: string; // YYYY-MM-DD
}

export interface PredictionResult {
  ramadan1LocalDate: string;
  ramadanStartLocalDateTime: string;
  conjunctionUTC: string;
  conjunctionLocal: string;
  sunsetLocal: string;
  sunsetUTC: string;
  moonAltitudeAtSunsetDeg: number;
  moonAzimuthAtSunsetDeg: number;
  sunAltitudeAtSunsetDeg: number;
  sunAzimuthAtSunsetDeg: number;
  ruleA: boolean;
  ruleB: boolean;
  isBorderline: boolean;
  nrIterations: ConjunctionResult['nrIterations'];
  converged: boolean;
  totalIterations: number;
  bisectionDeltaSec: number | null;
  bisectionWarning: boolean;
  requestParams: Record<string, string>;
  topoParams: Record<string, string>;
  timezone: string;
  dataSource: 'live' | 'mock' | 'cache';
  candidatesChecked: Array<{
    date: string;
    result: WujudulHilalResult;
  }>;
  // Idul Fitri / 1 Syawal fields
  syawalConjunctionUTC: string | null;
  syawalConjunctionLocal: string | null;
  syawalSunsetLocal: string | null;
  syawalMoonAltitudeAtSunsetDeg: number | null;
  syawalRuleA: boolean | null;
  syawalRuleB: boolean | null;
  syawalFulfilled: boolean | null;
  syawalStartLocalDateTime: string | null;
  syawal1LocalDate: string | null;
  lastFastingLocalDate: string | null;
  ramadanLengthDays: number | null;
}

function loadAnchors(): AnchorEntry[] {
  try {
    const filePath = path.join(process.cwd(), 'data', 'anchors_syaban.json');
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as AnchorEntry[];
  } catch {
    return [];
  }
}

// ─── Inline estimator (no anchor file required) ─────────────────
const SEED_YEAR = 2025;
const SEED_RAMADAN1_MS = Date.UTC(2025, 2, 1); // 2025-03-01
const ISLAMIC_YEAR_DAYS = 354.36667;

/** Estimate Ramadan 1 for a given year using arithmetic from a known seed. */
function estimateRamadan1(year: number): Date {
  const yearDiff = year - SEED_YEAR;
  const daysFromSeed = yearDiff * ISLAMIC_YEAR_DAYS;
  const est = new Date(SEED_RAMADAN1_MS + daysFromSeed * 86400000);
  while (est.getUTCFullYear() < year - 1) est.setUTCDate(est.getUTCDate() + Math.round(ISLAMIC_YEAR_DAYS));
  while (est.getUTCFullYear() > year) est.setUTCDate(est.getUTCDate() - Math.round(ISLAMIC_YEAR_DAYS));
  return est;
}

/**
 * Internal: run the WH pipeline for a single anchor year.
 * Returns the first Ramadan-start result found (may cross Gregorian year boundary).
 */
async function predictFromAnchor(
  anchorYear: number,
  lat: number,
  lon: number,
  tz: string
): Promise<PredictionResult | null> {
  const anchors = loadAnchors();
  const anchor = anchors.find((a) => a.gregorianYear === anchorYear);

  let windowStart: Date;
  let windowEnd: Date;
  if (anchor) {
    const syaban1 = DateTime.fromISO(anchor.syaban1LocalDate, { zone: tz });
    windowStart = syaban1.plus({ days: 15 }).toUTC().toJSDate();
    windowEnd = syaban1.plus({ days: 55 }).toUTC().toJSDate();
  } else {
    // Fallback: estimate conjunction window from arithmetic (no anchor needed)
    const estRamadan = estimateRamadan1(anchorYear);
    windowStart = new Date(estRamadan.getTime() - 20 * 86400000);
    windowEnd = new Date(estRamadan.getTime() + 20 * 86400000);
  }

  // Try with expanding windows on failure
  let conjResult: ConjunctionResult;
  try {
    conjResult = await findConjunction(windowStart, windowEnd);
  } catch {
    const w1s = new Date(windowStart.getTime() - 20 * 86400000);
    const w1e = new Date(windowEnd.getTime() + 20 * 86400000);
    try {
      conjResult = await findConjunction(w1s, w1e);
    } catch {
      const w2s = new Date(windowStart.getTime() - 60 * 86400000);
      const w2e = new Date(windowEnd.getTime() + 60 * 86400000);
      conjResult = await findConjunction(w2s, w2e);
    }
  }

  // Reject unconverged results — they likely landed on opposition, not conjunction
  if (!conjResult.converged) {
    return null;
  }
  const conjLocal = DateTime.fromJSDate(conjResult.conjunctionUTC, { zone: tz });
  const conjDateStr = conjLocal.toISODate()!;

  const candidatesChecked: Array<{ date: string; result: WujudulHilalResult }> = [];

  for (let offset = 0; offset <= 3; offset++) {
    const candidateDt = DateTime.fromISO(conjDateStr, { zone: tz }).plus({ days: offset });
    const candidateDate = candidateDt.toISODate()!;

    const sunset = getSunset(candidateDate, lat, lon, tz);

    const [moonTopo, sunTopo] = await Promise.all([
      getTopoAzEl("'301'", [sunset.sunsetUTC], lat, lon),
      getTopoAzEl("'10'", [sunset.sunsetUTC], lat, lon),
    ]);

    const moonAlt = moonTopo.results[0]?.el ?? 0;
    const moonAz = moonTopo.results[0]?.az ?? 0;
    const sunAlt = sunTopo.results[0]?.el ?? 0;
    const sunAz = sunTopo.results[0]?.az ?? 0;

    const whResult = checkWujudulHilal({
      conjunctionUTC: conjResult.conjunctionUTC,
      sunsetUTC: sunset.sunsetUTC,
      moonAltAtSunsetDeg: moonAlt,
      candidateDate,
    });

    candidatesChecked.push({ date: candidateDate, result: whResult });

    if (whResult.fulfilled) {
      // ── Syaban consistency: verify previous conjunction exists before this one ──
      try {
        const approxPrev = new Date(conjResult.conjunctionUTC.getTime() - 29.53 * 86400000);
        const prevWinS = new Date(approxPrev.getTime() - 5 * 86400000);
        const prevWinE = new Date(approxPrev.getTime() + 5 * 86400000);
        const prevConj = await findConjunction(prevWinS, prevWinE);
        if (prevConj.conjunctionUTC.getTime() >= conjResult.conjunctionUTC.getTime()) {
          // Previous conjunction is not actually before — skip to next offset
          continue;
        }
      } catch {
        // Can't find previous conjunction — proceed (HORIZONS/mock limitation)
      }

      const sunsetPlusOne = DateTime.fromJSDate(sunset.sunsetUTC, { zone: tz }).plus({ seconds: 1 });
      const ramadan1 = DateTime.fromISO(candidateDate, { zone: tz }).plus({ days: 1 }).toISODate()!;

      return {
        ramadan1LocalDate: ramadan1,
        ramadanStartLocalDateTime: sunsetPlusOne.toISO()!,
        conjunctionUTC: conjResult.conjunctionISO,
        conjunctionLocal: conjLocal.toISO()!,
        sunsetLocal: DateTime.fromJSDate(sunset.sunsetUTC, { zone: tz }).toISO()!,
        sunsetUTC: sunset.sunsetUTC.toISOString(),
        moonAltitudeAtSunsetDeg: parseFloat(moonAlt.toFixed(6)),
        moonAzimuthAtSunsetDeg: parseFloat(moonAz.toFixed(6)),
        sunAltitudeAtSunsetDeg: parseFloat(sunAlt.toFixed(6)),
        sunAzimuthAtSunsetDeg: parseFloat(sunAz.toFixed(6)),
        ruleA: whResult.ruleA,
        ruleB: whResult.ruleB,
        isBorderline: whResult.isBorderline,
        nrIterations: conjResult.nrIterations,
        converged: conjResult.converged,
        totalIterations: conjResult.totalIterations,
        bisectionDeltaSec: conjResult.bisectionDeltaSec,
        bisectionWarning: conjResult.bisectionWarning,
        requestParams: conjResult.requestParams,
        topoParams: moonTopo.params,
        timezone: tz,
        dataSource: moonTopo.results[0]?.source ?? 'mock',
        candidatesChecked,
        // Syawal fields — filled later by attachSyawal
        syawalConjunctionUTC: null,
        syawalConjunctionLocal: null,
        syawalSunsetLocal: null,
        syawalMoonAltitudeAtSunsetDeg: null,
        syawalRuleA: null,
        syawalRuleB: null,
        syawalFulfilled: null,
        syawalStartLocalDateTime: null,
        syawal1LocalDate: null,
        lastFastingLocalDate: null,
        ramadanLengthDays: null,
      };
    }
  }

  return null; // WH criteria not met for any candidate
}

/**
 * Compute Idul Fitri / 1 Syawal for a given Ramadan result.
 * Uses the same Rule A+B pipeline: find next conjunction after Ramadan,
 * then evaluate WH at sunset candidates.
 */
async function attachSyawal(
  result: PredictionResult,
  lat: number,
  lon: number,
  tz: string
): Promise<void> {
  const ramadanConjUTC = new Date(result.conjunctionUTC);

  // Search window: 24–35 days after Ramadan conjunction (next lunation)
  const winStart = new Date(ramadanConjUTC.getTime() + 24 * 86400000);
  const winEnd = new Date(ramadanConjUTC.getTime() + 35 * 86400000);

  let syawalConj: ConjunctionResult;
  try {
    syawalConj = await findConjunction(winStart, winEnd);
  } catch {
    return; // Cannot find Syawal conjunction — leave fields null
  }
  if (!syawalConj.converged) return;

  const conjLocal = DateTime.fromJSDate(syawalConj.conjunctionUTC, { zone: tz });
  const conjDateStr = conjLocal.toISODate()!;

  for (let offset = -1; offset <= 2; offset++) {
    const candDt = DateTime.fromISO(conjDateStr, { zone: tz }).plus({ days: offset });
    const candDate = candDt.toISODate()!;

    const sunset = getSunset(candDate, lat, lon, tz);
    const [moonTopo] = await Promise.all([
      getTopoAzEl("'301'", [sunset.sunsetUTC], lat, lon),
    ]);
    const moonAlt = moonTopo.results[0]?.el ?? 0;

    const whResult = checkWujudulHilal({
      conjunctionUTC: syawalConj.conjunctionUTC,
      sunsetUTC: sunset.sunsetUTC,
      moonAltAtSunsetDeg: moonAlt,
      candidateDate: candDate,
    });

    if (whResult.fulfilled) {
      const sunsetDt = DateTime.fromJSDate(sunset.sunsetUTC, { zone: tz });
      const syawal1 = DateTime.fromISO(candDate, { zone: tz }).plus({ days: 1 }).toISODate()!;

      result.syawalConjunctionUTC = syawalConj.conjunctionISO;
      result.syawalConjunctionLocal = conjLocal.toISO()!;
      result.syawalSunsetLocal = sunsetDt.toISO()!;
      result.syawalMoonAltitudeAtSunsetDeg = parseFloat(moonAlt.toFixed(6));
      result.syawalRuleA = whResult.ruleA;
      result.syawalRuleB = whResult.ruleB;
      result.syawalFulfilled = whResult.fulfilled;
      result.syawalStartLocalDateTime = sunsetDt.plus({ seconds: 1 }).toISO()!;
      result.syawal1LocalDate = syawal1;
      result.lastFastingLocalDate = candDate;
      // ramadanLengthDays = civil days from 1 Ramadan to 1 Syawal
      const r1 = DateTime.fromISO(result.ramadan1LocalDate, { zone: tz });
      const s1 = DateTime.fromISO(syawal1, { zone: tz });
      result.ramadanLengthDays = Math.round(s1.diff(r1, 'days').days);
      return;
    }
  }
}

export interface MultiPredictionResult {
  /** All Ramadan starts whose ramadan1LocalDate falls in the requested Gregorian year */
  results: PredictionResult[];
  /** Primary result (first chronologically), or null if none found */
  primary: PredictionResult | null;
  /** Requested year */
  year: number;
  /** Warning messages (e.g. anchor missing, mock coverage limited) */
  warnings: string[];
}

/**
 * Predict Ramadan start(s) that begin in the given Gregorian year.
 *
 * Checks anchors for `year` and `year+1` (to catch cross-year cases where
 * the anchor is in the previous year but Ramadan starts in the requested year,
 * e.g. year=2030 anchor syaban1=2029-12-06 → Ramadan starts Dec 2029).
 *
 * Returns a MultiPredictionResult with 0, 1, or 2 results.
 */
export async function predictRamadanMulti(
  year: number,
  lat: number,
  lon: number,
  tz: string
): Promise<MultiPredictionResult> {
  const warnings: string[] = [];
  const collected: PredictionResult[] = [];

  // Try anchor years that might produce a Ramadan start in the requested Gregorian year.
  // anchor year Y   → Ramadan might start in Y-1 or Y  (cross-year)
  // anchor year Y+1 → Ramadan might start in Y  or Y+1
  // So we check anchors: year (obvious) and year+1 (covers cross-year from next anchor).
  // We also check year-1 to cover the case where anchor year-1 produces a late-year Ramadan
  // that starts in the requested year.
  const anchorYearsToTry = [year - 1, year, year + 1];

  for (const ay of anchorYearsToTry) {
    try {
      const result = await predictFromAnchor(ay, lat, lon, tz);
      if (result) {
        const startYear = DateTime.fromISO(result.ramadan1LocalDate, { zone: tz }).year;
        if (startYear === year) {
          // Only include if the Ramadan start date falls in the requested Gregorian year
          // Avoid duplicates (same ramadan1LocalDate)
          if (!collected.some(r => r.ramadan1LocalDate === result.ramadan1LocalDate)) {
            // Attach Idul Fitri / 1 Syawal computation
            await attachSyawal(result, lat, lon, tz);
            collected.push(result);
          }
        }
      }
    } catch {
      // Anchor missing or WH criteria not met — not fatal, just skip
    }
  }

  // Sort by date ascending
  collected.sort((a, b) => a.ramadan1LocalDate.localeCompare(b.ramadan1LocalDate));

  if (collected.length === 0) {
    warnings.push(
      `No Ramadan start found in Gregorian year ${year}. ` +
      `This may indicate limited ephemeris data coverage (mock mode) or WH criteria not met for any candidate.`
    );
  }

  return {
    results: collected,
    primary: collected[0] ?? null,
    year,
    warnings,
  };
}

/**
 * Legacy single-result API — kept for backward compatibility.
 * Returns the first (primary) result or throws if none found.
 */
export async function predictRamadan(
  year: number,
  lat: number,
  lon: number,
  tz: string
): Promise<PredictionResult> {
  const multi = await predictRamadanMulti(year, lat, lon, tz);
  if (!multi.primary) {
    const msg = multi.warnings.length > 0
      ? multi.warnings.join('; ')
      : `No Ramadan start found for Gregorian year ${year}`;
    throw new Error(msg);
  }
  return multi.primary;
}
