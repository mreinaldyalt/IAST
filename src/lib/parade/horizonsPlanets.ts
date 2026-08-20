/**
 * Horizons query layer khusus Parade Planet — menerima COMMAND planet apa pun
 * (bukan hanya '10'/'301' seperti horizonsQueries.ts).
 *
 * Internally fetches state VECTORS (light-time + stellar-aberration corrected,
 * ICRF) instead of an OBSERVER table — same reasoning and same reduction math
 * (precession/nutation/topocentric parallax, src/lib/precessionNutation.ts) as
 * horizonsQueries.ts, which fixed the exact same class of NASA-side Observer
 * Table instability (502/503 under load) for Ramadan/KHGT. Precession and
 * nutation are purely functions of time, not of which body is being queried,
 * so the same validated transform applies unchanged to any planet. Public
 * function signatures/return shapes are unchanged, so callers need no changes.
 */
import { queryHorizons, dateToJD, isLiveMode, type HorizonsResponse } from '../horizonsClient';
import {
  julianCenturiesJ2000, meanObliquityDeg, nutationDeg, precessJ2000ToDate,
  applyNutation, cartesianToRaDec, cartesianToEclipticLon,
  observerGeocentricVec, gastDeg, raDecToAltAz, type Vec3,
} from '../precessionNutation';
import type { ParadePlanetId } from './types';

/**
 * queryHorizons + retry-on-mock. NASA sesekali membalas 502/503 saat burst;
 * queryHorizons sudah retry sekali lalu jatuh ke mock. Untuk parade (banyak
 * request paralel) satu blip tunggal cukup meracuni label dataSource seluruh
 * hasil → coba ulang beberapa kali dengan backoff selama mode live. Bila NASA
 * memang down, tetap berakhir mock (dilabeli jujur), tidak memakai posisi palsu.
 */
async function runQuery(params: Record<string, string>): Promise<HorizonsResponse> {
  let resp = await queryHorizons(params);
  let tries = 0;
  while (resp.source === 'mock' && isLiveMode() && tries < 2) {
    await new Promise((r) => setTimeout(r, 700 * (tries + 1)));
    resp = await queryHorizons(params);
    tries++;
  }
  return resp;
}

/** Kode COMMAND Horizons per benda (barycenter/pusat planet). */
export const HORIZONS_COMMAND: Record<ParadePlanetId | 'sun', string> = {
  mercury: "'199'",
  venus: "'299'",
  mars: "'499'",
  jupiter: "'599'",
  saturn: "'699'",
  uranus: "'799'",
  neptune: "'899'",
  sun: "'10'",
};

export interface RaDecSample {
  epochMs: number;
  ra: number;
  dec: number;
}
export interface EcLonSample {
  epochMs: number;
  ecLon: number;
}
export interface AzElSample {
  epochMs: number;
  az: number;
  el: number;
}

interface ApparentVectorSample {
  epochMs: number;
  jdUt: number;
  trueOfDateVec: Vec3;
  trueObliquityDeg: number;
  gastDeg: number;
}

/**
 * Fetch geocentric state VECTORS (LT+S corrected, ICRF) for any body at the
 * given epochs and reduce each to the true-equator-and-equinox-of-date
 * apparent vector (precession + nutation applied). Rows are requested and
 * returned in the exact input epoch order — no reordering needed.
 */
async function fetchApparentVectors(
  command: string,
  epochsUTC: Date[]
): Promise<{ samples: ApparentVectorSample[]; source: string }> {
  const tlist = epochsUTC.map((d) => dateToJD(d).toFixed(9)).join(', ');
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
    TLIST: `'${tlist}'`,
  };

  const resp = await runQuery(params);
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
    throw new Error(`Jumlah baris Horizons VECTORS (${lines.length}) ≠ jumlah epoch diminta (${epochsUTC.length})`);
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
    return { epochMs: epochUTC.getTime(), jdUt, trueOfDateVec, trueObliquityDeg, gastDeg: gast };
  });

  return { samples, source: resp.source };
}

/** RA/Dec apparent geosentris, banyak epoch sekali panggil. */
export async function fetchGeoRaDec(
  command: string,
  epochsUTC: Date[]
): Promise<{ samples: RaDecSample[]; source: string }> {
  const { samples: vecSamples, source } = await fetchApparentVectors(command, epochsUTC);
  const samples: RaDecSample[] = vecSamples.map((s) => {
    const { raDeg, decDeg } = cartesianToRaDec(s.trueOfDateVec);
    return { epochMs: s.epochMs, ra: raDeg, dec: decDeg };
  });
  return { samples, source };
}

/** Bujur ekliptika observer ObsEcLon. */
export async function fetchObsEcLon(
  command: string,
  epochsUTC: Date[]
): Promise<{ samples: EcLonSample[]; source: string }> {
  const { samples: vecSamples, source } = await fetchApparentVectors(command, epochsUTC);
  const samples: EcLonSample[] = vecSamples.map((s) => ({
    epochMs: s.epochMs,
    ecLon: cartesianToEclipticLon(s.trueOfDateVec, s.trueObliquityDeg),
  }));
  return { samples, source };
}

/** Alt/Az topocentris apparent (airless) untuk verifikasi kandidat. */
export async function fetchTopoAzEl(
  command: string,
  epochsUTC: Date[],
  lat: number,
  lon: number,
  altKm = 0.0
): Promise<{ samples: AzElSample[]; source: string }> {
  const { samples: vecSamples, source } = await fetchApparentVectors(command, epochsUTC);
  const samples: AzElSample[] = vecSamples.map((s) => {
    const obsVec = observerGeocentricVec(lat, lon, altKm, s.gastDeg);
    const topoVec: Vec3 = {
      x: s.trueOfDateVec.x - obsVec.x,
      y: s.trueOfDateVec.y - obsVec.y,
      z: s.trueOfDateVec.z - obsVec.z,
    };
    const { raDeg, decDeg } = cartesianToRaDec(topoVec);
    const { altDeg, azDeg } = raDecToAltAz(raDeg, decDeg, lat, lon, s.gastDeg);
    return { epochMs: s.epochMs, az: azDeg, el: altDeg };
  });
  return { samples, source };
}
