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

  // Parse date in local timezone to get the calendar date
  const localDt = DateTime.fromISO(dateStr, { zone: timezone });
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
