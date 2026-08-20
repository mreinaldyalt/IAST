/**
 * Sunset calculation using suncalc + luxon + tz-lookup.
 */
import SunCalc from 'suncalc';
import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';

export interface SunsetResult {
  sunsetUTC: Date;
  sunsetLocal: string; // ISO string in local tz
  timezone: string;
}

/**
 * Get sunset time for a given date (YYYY-MM-DD) and location.
 * Uses suncalc for sunset calculation.
 */
export function getSunset(
  dateStr: string,
  lat: number,
  lon: number,
  tz?: string
): SunsetResult {
  const timezone = tz || tzlookup(lat, lon);

  // Parse date at LOCAL NOON to ensure SunCalc finds the correct day's sunset
  // (midnight local can cause SunCalc to return the previous day's sunset in western hemispheres)
  const localDt = DateTime.fromISO(dateStr, { zone: timezone }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
  const jsDate = localDt.toJSDate();

  const times = SunCalc.getTimes(jsDate, lat, lon);
  const sunsetUTC = times.sunset;

  if (!sunsetUTC || isNaN(sunsetUTC.getTime())) {
    throw new Error(`Could not compute sunset for ${dateStr} at lat=${lat} lon=${lon}`);
  }

  const sunsetLuxon = DateTime.fromJSDate(sunsetUTC, { zone: timezone });

  return {
    sunsetUTC,
    sunsetLocal: sunsetLuxon.toISO()!,
    timezone,
  };
}

/**
 * Look up timezone from coordinates.
 */
export function getTimezone(lat: number, lon: number): string {
  return tzlookup(lat, lon);
}

// Wellington, New Zealand coordinates for KHGT PKG2
const NZ_LAT = -41.2866;
const NZ_LON = 174.7756;
const NZ_TZ = 'Pacific/Auckland';

/**
 * Get astronomical dawn (nightEnd ≈ -18° sun altitude) at Wellington, NZ
 * for the NZ local date that contains the given UTC datetime.
 * Returns the UTC Date of nightEnd.
 */
export function getNzFajrNightEndUTC(dateISO: string): Date {
  // Determine NZ local date for the given UTC time
  const nzDt = DateTime.fromISO(dateISO, { zone: NZ_TZ });
  const nzDateStr = nzDt.toISODate()!;
  // We want the nightEnd (dawn) that occurs on the NZ calendar date AFTER the conjunction
  // nightEnd is early morning, so use the next NZ date
  const nextNzDate = DateTime.fromISO(nzDateStr, { zone: NZ_TZ }).plus({ days: 1 });
  const jsDate = nextNzDate.toJSDate();
  const times = SunCalc.getTimes(jsDate, NZ_LAT, NZ_LON);
  const nightEnd = times.nightEnd;
  if (!nightEnd || isNaN(nightEnd.getTime())) {
    throw new Error(`Could not compute nightEnd for NZ on ${nzDateStr}`);
  }
  return nightEnd;
}
