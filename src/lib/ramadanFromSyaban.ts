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

export async function predictRamadan(
  year: number,
  lat: number,
  lon: number,
  tz: string
): Promise<PredictionResult> {
  // 1. Load anchor for this year
  const anchors = loadAnchors();
  const anchor = anchors.find((a) => a.gregorianYear === year);
  if (!anchor) {
    throw new Error(`No Sya'ban anchor found for year ${year}. Please add entry to data/anchors_syaban.json`);
  }

  // 2. Compute conjunction window
  const syaban1 = DateTime.fromISO(anchor.syaban1LocalDate, { zone: tz });
  const windowStart = syaban1.plus({ days: 15 }).toUTC().toJSDate();
  const windowEnd = syaban1.plus({ days: 55 }).toUTC().toJSDate();

  // 3. Find conjunction via NR
  const conjResult = await findConjunction(windowStart, windowEnd);

  // 4. Determine candidate dates and check Wujudul Hilal
  const conjLocal = DateTime.fromJSDate(conjResult.conjunctionUTC, { zone: tz });
  const conjDateStr = conjLocal.toISODate()!;

  // Start from conjunction date, check up to D+3
  const candidatesChecked: Array<{ date: string; result: WujudulHilalResult }> = [];
  let finalResult: PredictionResult | null = null;

  for (let offset = 0; offset <= 3; offset++) {
    const candidateDt = DateTime.fromISO(conjDateStr, { zone: tz }).plus({ days: offset });
    const candidateDate = candidateDt.toISODate()!;

    // Get sunset for this candidate date
    const sunset = getSunset(candidateDate, lat, lon, tz);

    // Get topocentric Moon/Sun positions at sunset
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

    if (whResult.fulfilled && !finalResult) {
      // Validate year
      const rDate = DateTime.fromISO(candidateDate, { zone: tz });
      if (rDate.year !== year) {
        continue; // ramadan1 must be in the input year
      }

      const sunsetPlusOne = DateTime.fromJSDate(sunset.sunsetUTC, { zone: tz }).plus({ seconds: 1 });

      finalResult = {
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

  if (!finalResult) {
    throw new Error(
      `Wujudul Hilal criteria not met for any candidate date around conjunction ${conjResult.conjunctionISO}. Candidates checked: ${candidatesChecked.map((c) => `${c.date}: A=${c.result.ruleA} B=${c.result.ruleB}`).join('; ')}`
    );
  }

  return finalResult;
}
