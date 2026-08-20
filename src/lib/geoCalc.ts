/**
 * Geocentric calculations: GMST, local sidereal time, geocentric altitude, geocentric elongation.
 * All angles in degrees unless noted.
 */
import { degToRad, radToDeg, wrapTo360 } from './mathAngle';

/**
 * Compute Greenwich Mean Sidereal Time (GMST) in degrees for a given UTC Date.
 * Uses IAU formula based on Julian centuries from J2000.0.
 */
export function gmstDeg(dateUTC: Date): number {
  const JD = dateUTC.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545.0) / 36525.0;
  const gmst =
    280.46061837 +
    360.98564736629 * (JD - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000.0;
  return wrapTo360(gmst);
}

/**
 * Local Sidereal Time in degrees.
 */
export function localSiderealDeg(gmst: number, lonDeg: number): number {
  return wrapTo360(gmst + lonDeg);
}

/**
 * Geocentric altitude of a body given its geocentric apparent RA/Dec
 * and the observer's geographic latitude/longitude at a given UTC time.
 *
 * This is the "geocentric altitude" as seen from a point on the Earth's
 * surface but using geocentric (Earth-center) RA/Dec — the key KHGT metric.
 */
export function geocentricAltDeg(
  raDeg: number,
  decDeg: number,
  latDeg: number,
  lonDeg: number,
  dateUTC: Date
): number {
  const lst = localSiderealDeg(gmstDeg(dateUTC), lonDeg);
  const ha = degToRad(wrapTo360(lst - raDeg));
  const lat = degToRad(latDeg);
  const dec = degToRad(decDeg);
  const sinAlt =
    Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  return radToDeg(Math.asin(sinAlt));
}

/**
 * Geocentric elongation (angular separation) between Moon and Sun
 * given their geocentric apparent RA/Dec.
 */
export function geocentricElongDeg(
  raMoonDeg: number,
  decMoonDeg: number,
  raSunDeg: number,
  decSunDeg: number
): number {
  const ram = degToRad(raMoonDeg);
  const decm = degToRad(decMoonDeg);
  const ras = degToRad(raSunDeg);
  const decs = degToRad(decSunDeg);
  const cosE =
    Math.sin(decm) * Math.sin(decs) +
    Math.cos(decm) * Math.cos(decs) * Math.cos(ram - ras);
  return radToDeg(Math.acos(Math.max(-1, Math.min(1, cosE))));
}
