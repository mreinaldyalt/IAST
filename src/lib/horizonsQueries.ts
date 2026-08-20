/**
 * HORIZONS query builders.
 *
 * Internally these fetch state VECTORS (light-time + stellar-aberration
 * corrected, ICRF) rather than an OBSERVER table — NASA's OBSERVER-table
 * generation for Sun/Moon has repeatedly proven unreliable (500s and,
 * separately, silently empty tables under load — confirmed via direct A/B
 * testing holding every other parameter constant), while VECTORS for the
 * same bodies has stayed reliable throughout. The reduction from VECTORS to
 * apparent RA/Dec, ecliptic longitude, and topocentric Alt/Az (precession,
 * nutation, diurnal parallax) is done in src/lib/precessionNutation.ts and
 * has been validated against evaluasi.xlsx's already-correct OBSERVER-table
 * output (originally produced by this same system before HORIZONS started
 * degrading) to within ~0.002 deg across three widely-spaced years — see
 * scripts/validate-vector-transform.mjs. The public function signatures and
 * return shapes here are unchanged, so callers need no changes.
 */
import { queryHorizons, dateToJD, type HorizonsResponse } from './horizonsClient';
import {
  julianCenturiesJ2000, meanObliquityDeg, nutationDeg, precessJ2000ToDate,
  applyNutation, cartesianToRaDec, cartesianToEclipticLon,
  observerGeocentricVec, gastDeg, raDecToAltAz, type Vec3,
} from './precessionNutation';

export interface EclipticLonResult {
  ecLon: number;
  source: 'live' | 'mock' | 'cache';
  raw: string;
}

export interface AzElResult {
  az: number;
  el: number;
  source: 'live' | 'mock' | 'cache';
  raw: string;
}

export interface RADecResult {
  ra: number;
  dec: number;
  source: 'live' | 'mock' | 'cache';
  raw: string;
}

// ── Time scale: HORIZONS VECTORS epochs are TDB; our TLIST is built from JD
// (UT-based), so UTC->TDB (via TAI) must be added — same table/approach as
// src/lib/eclipse/horizonsVectors.ts, duplicated here to avoid coupling two
// independently-evolving query modules together.
const LEAP_SECOND_EFFECTIVE: Array<[string, number]> = [
  ['1972-01-01', 10], ['1972-07-01', 11], ['1973-01-01', 12], ['1974-01-01', 13],
  ['1975-01-01', 14], ['1976-01-01', 15], ['1977-01-01', 16], ['1978-01-01', 17],
  ['1979-01-01', 18], ['1980-01-01', 19], ['1981-07-01', 20], ['1982-07-01', 21],
  ['1983-07-01', 22], ['1985-07-01', 23], ['1988-01-01', 24], ['1990-01-01', 25],
  ['1991-01-01', 26], ['1992-07-01', 27], ['1993-07-01', 28], ['1994-07-01', 29],
  ['1996-01-01', 30], ['1997-07-01', 31], ['1999-01-01', 32], ['2006-01-01', 33],
  ['2009-01-01', 34], ['2012-07-01', 35], ['2015-07-01', 36], ['2017-01-01', 37],
];
function tdbMinusUtcSeconds(date: Date): number {
  let taiMinusUtc = 10;
  for (const [effective, value] of LEAP_SECOND_EFFECTIVE) {
    if (date.getTime() >= Date.parse(`${effective}T00:00:00Z`)) taiMinusUtc = value;
    else break;
  }
  return taiMinusUtc + 32.184;
}

/**
 * "yyyy-MM-dd HH:mm:ss.SSS" — callers (khgtPipeline.ts's parseRawRADecEpochMs,
 * newMoonNR.ts) parse the epoch back out of the `raw` field with this exact
 * shape; a plain ISO string (with its trailing "Z") does not match any of
 * their accepted formats and throws "Could not parse HORIZONS ... epoch".
 */
function formatRawEpoch(date: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`;
}

interface ApparentVectorSample {
  epochUTC: Date;
  jdUt: number;
  trueOfDateVec: Vec3;
  trueObliquityDeg: number;
  gastDeg: number;
  source: 'live' | 'mock' | 'cache';
}

/**
 * Fetch geocentric state VECTORS (LT+S corrected, ICRF) for a body at the
 * given epochs and reduce each to the true-equator-and-equinox-of-date
 * apparent vector (precession + nutation applied).
 */
async function fetchApparentGeocentricVectors(
  command: "'10'" | "'301'",
  epochsUTC: Date[]
): Promise<{ samples: ApparentVectorSample[]; params: Record<string, string> }> {
  const tlist = epochsUTC
    .map((date) => `'${(dateToJD(date) + tdbMinusUtcSeconds(date) / 86400).toFixed(9)}'`)
    .join(' ');

  const params: Record<string, string> = {
    COMMAND: command,
    MAKE_EPHEM: "'YES'",
    OBJ_DATA: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    VEC_CORR: "'LT+S'",
    CENTER: "'500@399'",
    REF_PLANE: "'FRAME'",
    REF_SYSTEM: "'ICRF'",
    OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'1'",
    CSV_FORMAT: "'YES'",
    TLIST: tlist,
  };

  const resp: HorizonsResponse = await queryHorizons(params);
  const soeIdx = resp.result.indexOf('$$SOE');
  const eoeIdx = resp.result.indexOf('$$EOE');
  if (soeIdx < 0 || eoeIdx < 0) {
    throw new Error('Could not find $$SOE/$$EOE markers in HORIZONS VECTORS response');
  }
  const lines = resp.result
    .slice(soeIdx + 5, eoeIdx)
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length !== epochsUTC.length) {
    throw new Error(`HORIZONS VECTORS row count mismatch: requested=${epochsUTC.length}, returned=${lines.length}`);
  }

  const samples: ApparentVectorSample[] = lines.map((line, i) => {
    const parts = line.split(',').map((p) => p.trim());
    const vec: Vec3 = { x: parseFloat(parts[2]), y: parseFloat(parts[3]), z: parseFloat(parts[4]) };
    if (!Number.isFinite(vec.x) || !Number.isFinite(vec.y) || !Number.isFinite(vec.z)) {
      throw new Error(`Could not parse HORIZONS VECTORS row: ${line}`);
    }
    const epochUTC = epochsUTC[i];
    const jdUt = dateToJD(epochUTC);
    const T = julianCenturiesJ2000(jdUt);
    const eps0 = meanObliquityDeg(T);
    const nut = nutationDeg(T);
    const precessed = precessJ2000ToDate(vec, T);
    const trueOfDateVec = applyNutation(precessed, eps0, nut);
    const trueObliquityDeg = eps0 + nut.dEpsDeg;
    const gast = gastDeg(jdUt, nut, eps0);
    return { epochUTC, jdUt, trueOfDateVec, trueObliquityDeg, gastDeg: gast, source: resp.source };
  });

  return { samples, params };
}

/**
 * Get ecliptic longitude of body at given UTC epoch(s), geocentric,
 * true-equator-and-equinox-of-date (matches HORIZONS QUANTITIES='31',
 * APPARENT='AIRLESS').
 */
export async function getEclipticLon(
  command: "'10'" | "'301'",
  epochsUTC: Date[]
): Promise<{ results: EclipticLonResult[]; params: Record<string, string> }> {
  const { samples, params } = await fetchApparentGeocentricVectors(command, epochsUTC);
  const results: EclipticLonResult[] = samples.map((s) => {
    const ecLon = cartesianToEclipticLon(s.trueOfDateVec, s.trueObliquityDeg);
    return { ecLon, source: s.source, raw: `${formatRawEpoch(s.epochUTC)}: ${ecLon}` };
  });
  return { results, params };
}

/**
 * Get geocentric apparent RA/Dec (true-equator-and-equinox-of-date) from
 * Earth center. Matches HORIZONS QUANTITIES='2', APPARENT='AIRLESS'.
 */
export async function getGeocentricApparentRADec(
  command: "'10'" | "'301'",
  epochsUTC: Date[]
): Promise<{ results: RADecResult[]; params: Record<string, string> }> {
  const { samples, params } = await fetchApparentGeocentricVectors(command, epochsUTC);
  const results: RADecResult[] = samples.map((s) => {
    const { raDeg, decDeg } = cartesianToRaDec(s.trueOfDateVec);
    return { ra: raDeg, dec: decDeg, source: s.source, raw: `${formatRawEpoch(s.epochUTC)}: RA=${raDeg} Dec=${decDeg}` };
  });
  return { results, params };
}

/**
 * Get topocentric AZ/EL of body at given UTC epoch from a specific location
 * (airless — no atmospheric refraction, matching APPARENT='AIRLESS').
 * Diurnal parallax applied via observerGeocentricVec (oblate-Earth site
 * vector) subtracted from the apparent geocentric vector before converting
 * to topocentric RA/Dec then Alt/Az.
 */
export async function getTopoAzEl(
  command: "'10'" | "'301'",
  epochsUTC: Date[],
  lat: number,
  lon: number,
  altKm: number = 0.0
): Promise<{ results: AzElResult[]; params: Record<string, string> }> {
  const { samples, params: vecParams } = await fetchApparentGeocentricVectors(command, epochsUTC);
  const results: AzElResult[] = samples.map((s) => {
    const obsVec = observerGeocentricVec(lat, lon, altKm, s.gastDeg);
    const topoVec: Vec3 = {
      x: s.trueOfDateVec.x - obsVec.x,
      y: s.trueOfDateVec.y - obsVec.y,
      z: s.trueOfDateVec.z - obsVec.z,
    };
    const { raDeg, decDeg } = cartesianToRaDec(topoVec);
    const { altDeg, azDeg } = raDecToAltAz(raDeg, decDeg, lat, lon, s.gastDeg);
    return { az: azDeg, el: altDeg, source: s.source, raw: `${formatRawEpoch(s.epochUTC)}: AZ=${azDeg} EL=${altDeg}` };
  });
  const params = { ...vecParams, SITE_LAT: String(lat), SITE_LON: String(lon), SITE_ALT_KM: String(altKm) };
  return { results, params };
}
