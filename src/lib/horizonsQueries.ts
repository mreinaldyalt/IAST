/**
 * HORIZONS query builders.
 */
import { queryHorizons, parseSOE, dateToJD, type HorizonsResponse } from './horizonsClient';

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

/**
 * Get ecliptic longitude of body at given UTC epoch(s) from GEOCENTER.
 * COMMAND: '10' (Sun) or '301' (Moon)
 * QUANTITIES: '31' (ObsEcLon)
 * CENTER: '500@399' (geocenter)
 */
export async function getEclipticLon(
  command: "'10'" | "'301'",
  epochsUTC: Date[]
): Promise<{ results: EclipticLonResult[]; params: Record<string, string> }> {
  const tlist = epochsUTC.map((d) => dateToJD(d).toFixed(8)).join(', ');

  const params: Record<string, string> = {
    COMMAND: command,
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'500@399'",
    QUANTITIES: "'31'",
    TIME_TYPE: "'UT'",
    TIME_DIGITS: "'SECONDS'",
    ANG_FORMAT: "'DEG'",
    EXTRA_PREC: "'YES'",
    APPARENT: "'AIRLESS'",
    CSV_FORMAT: "'YES'",
    CAL_TYPE: "'GREGORIAN'",
    TLIST: `'${tlist}'`,
  };

  const resp = await queryHorizons(params);
  const parsed = parseSOE(resp.result);

  const results: EclipticLonResult[] = parsed.map((p) => ({
    ecLon: p.values[0],
    source: resp.source,
    raw: `${p.dateStr}: ${p.values[0]}`,
  }));

  return { results, params };
}

/**
 * Get topocentric AZ/EL of body at given UTC epoch from a specific location.
 * COMMAND: '10' (Sun) or '301' (Moon)
 * QUANTITIES: '4' (AZ/EL)
 * CENTER: 'coord@399' with SITE_COORD
 */
export async function getTopoAzEl(
  command: "'10'" | "'301'",
  epochsUTC: Date[],
  lat: number,
  lon: number,
  altKm: number = 0.0
): Promise<{ results: AzElResult[]; params: Record<string, string> }> {
  const tlist = epochsUTC.map((d) => dateToJD(d).toFixed(8)).join(', ');

  const params: Record<string, string> = {
    COMMAND: command,
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@399'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${lon},${lat},${altKm}'`,
    QUANTITIES: "'4'",
    TIME_TYPE: "'UT'",
    TIME_DIGITS: "'SECONDS'",
    ANG_FORMAT: "'DEG'",
    EXTRA_PREC: "'YES'",
    APPARENT: "'AIRLESS'",
    CSV_FORMAT: "'YES'",
    CAL_TYPE: "'GREGORIAN'",
    TLIST: `'${tlist}'`,
  };

  const resp = await queryHorizons(params);
  const parsed = parseSOE(resp.result);

  const results: AzElResult[] = parsed.map((p) => ({
    az: p.values[0],
    el: p.values[1],
    source: resp.source,
    raw: `${p.dateStr}: AZ=${p.values[0]} EL=${p.values[1]}`,
  }));

  return { results, params };
}
