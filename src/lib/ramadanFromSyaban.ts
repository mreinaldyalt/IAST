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
}

function loadAnchors(): AnchorEntry[] {
  const filePath = path.join(process.cwd(), 'data', 'anchors_syaban.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as AnchorEntry[];
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
  if (!anchor) return null;

  const syaban1 = DateTime.fromISO(anchor.syaban1LocalDate, { zone: tz });
  const windowStart = syaban1.plus({ days: 15 }).toUTC().toJSDate();
  const windowEnd = syaban1.plus({ days: 55 }).toUTC().toJSDate();

  const conjResult = await findConjunction(windowStart, windowEnd);
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
      const sunsetPlusOne = DateTime.fromJSDate(sunset.sunsetUTC, { zone: tz }).plus({ seconds: 1 });

      return {
        ramadan1LocalDate: candidateDate,
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
      };
    }
  }

  return null; // WH criteria not met for this anchor
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

  // Check if no anchors exist at all for any of the tried years
  const anchors = loadAnchors();
  const hasAnyAnchor = anchorYearsToTry.some(ay => anchors.some(a => a.gregorianYear === ay));
  if (!hasAnyAnchor) {
    warnings.push(
      `No Sya'ban anchor found for years ${anchorYearsToTry.join(', ')}. ` +
      `Run scripts/generate-anchors-horizons.ts or add entries to data/anchors_syaban.json.`
    );
  } else if (collected.length === 0) {
    warnings.push(
      `Anchors exist but no Ramadan start found in Gregorian year ${year}. ` +
      `This may indicate limited ephemeris data coverage (mock mode) or WH criteria not met.`
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
