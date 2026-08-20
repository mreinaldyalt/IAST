import type { Vec3 } from './types';

export const ECLIPSE_CONSTANTS = {
  sunRadiusKm: 695700,
  moonRadiusKm: 1737.4,
  earthEquatorialRadiusKm: 6378.137,
  earthFlattening: 1 / 298.257223563,
  danjonEnlargement: 1 / 85,
} as const;

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const norm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  if (!Number.isFinite(n) || n === 0) throw new Error('Vektor geometri tidak valid.');
  return scale(a, 1 / n);
};

export function angleRad(a: Vec3, b: Vec3): number {
  const denominator = norm(a) * norm(b);
  if (denominator === 0) return Number.NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / denominator)));
}

export interface SolarShadowState {
  valid: boolean;
  axisPointKm: Vec3;
  axisDistanceKm: number;
  axisTravelKm: number;
  umbraRadiusKm: number;
  penumbraRadiusKm: number;
  partialMetricKm: number;
  centralMetricKm: number;
}

/** Geometri kerucut bayangan Bulan pada bidang yang paling dekat dengan pusat Bumi. */
export function solarShadowState(sun: Vec3, moon: Vec3): SolarShadowState {
  const c = ECLIPSE_CONSTANTS;
  const sunToMoon = sub(moon, sun);
  const shadowDirection = unit(sunToMoon);
  const axisTravelKm = dot(scale(moon, -1), shadowDirection);
  const axisPointKm = add(moon, scale(shadowDirection, axisTravelKm));
  const axisDistanceKm = norm(axisPointKm);
  const sunMoonDistanceKm = norm(sunToMoon);
  const umbraRadiusKm = c.moonRadiusKm - axisTravelKm * (c.sunRadiusKm - c.moonRadiusKm) / sunMoonDistanceKm;
  const penumbraRadiusKm = c.moonRadiusKm + axisTravelKm * (c.sunRadiusKm + c.moonRadiusKm) / sunMoonDistanceKm;
  const valid = axisTravelKm > 0 && norm(moon) < norm(sun);

  return {
    valid,
    axisPointKm,
    axisDistanceKm,
    axisTravelKm,
    umbraRadiusKm,
    penumbraRadiusKm,
    partialMetricKm: axisDistanceKm - (c.earthEquatorialRadiusKm + penumbraRadiusKm),
    centralMetricKm: axisDistanceKm - (c.earthEquatorialRadiusKm + Math.abs(umbraRadiusKm)),
  };
}

export interface LunarShadowState {
  valid: boolean;
  axisPointKm: Vec3;
  axisDistanceKm: number;
  moonAxisDistanceKm: number;
  umbraRadiusKm: number;
  penumbraRadiusKm: number;
  penumbralMetricKm: number;
  umbralMetricKm: number;
  totalMetricKm: number;
}

/** Bayangan Bumi di jarak Bulan, dengan pembesaran atmosfer Danjon 1/85. */
export function lunarShadowState(sun: Vec3, moon: Vec3): LunarShadowState {
  const c = ECLIPSE_CONSTANTS;
  const antiSolar = unit(scale(sun, -1));
  const moonAxisDistanceKm = dot(moon, antiSolar);
  const axisPointKm = scale(antiSolar, moonAxisDistanceKm);
  const axisDistanceKm = norm(sub(moon, axisPointKm));
  const effectiveEarthRadius = c.earthEquatorialRadiusKm * (1 + c.danjonEnlargement);
  const sunDistanceKm = norm(sun);
  const umbraRadiusKm = effectiveEarthRadius - moonAxisDistanceKm * (c.sunRadiusKm - effectiveEarthRadius) / sunDistanceKm;
  const penumbraRadiusKm = effectiveEarthRadius + moonAxisDistanceKm * (c.sunRadiusKm + effectiveEarthRadius) / sunDistanceKm;

  return {
    valid: moonAxisDistanceKm > 0,
    axisPointKm,
    axisDistanceKm,
    moonAxisDistanceKm,
    umbraRadiusKm,
    penumbraRadiusKm,
    penumbralMetricKm: axisDistanceKm - (penumbraRadiusKm + c.moonRadiusKm),
    umbralMetricKm: axisDistanceKm - (umbraRadiusKm + c.moonRadiusKm),
    totalMetricKm: axisDistanceKm - Math.max(0, umbraRadiusKm - c.moonRadiusKm),
  };
}

export function circleOverlapFraction(sunRadius: number, moonRadius: number, separation: number): number {
  if (separation >= sunRadius + moonRadius) return 0;
  if (separation <= Math.abs(sunRadius - moonRadius)) {
    const coveredRadius = Math.min(sunRadius, moonRadius);
    return Math.min(1, (coveredRadius * coveredRadius) / (sunRadius * sunRadius));
  }
  const d = separation;
  const r = sunRadius;
  const R = moonRadius;
  const alpha = Math.acos((d * d + r * r - R * R) / (2 * d * r));
  const beta = Math.acos((d * d + R * R - r * r) / (2 * d * R));
  const triangle = 0.5 * Math.sqrt(Math.max(0, (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R)));
  return Math.max(0, Math.min(1, (r * r * alpha + R * R * beta - triangle) / (Math.PI * r * r)));
}

export function gmstRad(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  const degrees = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - t * t * t / 38710000;
  return ((degrees % 360) + 360) % 360 * Math.PI / 180;
}

export function observerEciKm(date: Date, latitude: number, longitude: number, altitudeKm = 0): Vec3 {
  const c = ECLIPSE_CONSTANTS;
  const lat = latitude * Math.PI / 180;
  const lon = longitude * Math.PI / 180;
  const e2 = c.earthFlattening * (2 - c.earthFlattening);
  const n = c.earthEquatorialRadiusKm / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const x = (n + altitudeKm) * Math.cos(lat) * Math.cos(lon);
  const y = (n + altitudeKm) * Math.cos(lat) * Math.sin(lon);
  const z = (n * (1 - e2) + altitudeKm) * Math.sin(lat);
  const theta = gmstRad(date);
  return {
    x: Math.cos(theta) * x - Math.sin(theta) * y,
    y: Math.sin(theta) * x + Math.cos(theta) * y,
    z,
  };
}

export function topocentricVector(target: Vec3, date: Date, latitude: number, longitude: number, altitudeKm = 0): Vec3 {
  return sub(target, observerEciKm(date, latitude, longitude, altitudeKm));
}

export function horizontalCoordinates(target: Vec3, date: Date, latitude: number, longitude: number): { altitudeDeg: number; azimuthDeg: number } {
  const u = unit(target);
  const ra = Math.atan2(u.y, u.x);
  const dec = Math.asin(u.z);
  const lat = latitude * Math.PI / 180;
  const lst = gmstRad(date) + longitude * Math.PI / 180;
  const hourAngle = lst - ra;
  const altitude = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle));
  const east = -Math.cos(dec) * Math.sin(hourAngle);
  const north = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(hourAngle) * Math.sin(lat);
  const azimuth = Math.atan2(east, north);
  return {
    altitudeDeg: altitude * 180 / Math.PI,
    azimuthDeg: ((azimuth * 180 / Math.PI) % 360 + 360) % 360,
  };
}

export function inertialPointToLatLon(point: Vec3, date: Date): { latitude: number; longitude: number } {
  const theta = gmstRad(date);
  const x = Math.cos(theta) * point.x + Math.sin(theta) * point.y;
  const y = -Math.sin(theta) * point.x + Math.cos(theta) * point.y;
  return {
    latitude: Math.atan2(point.z, Math.hypot(x, y)) * 180 / Math.PI,
    longitude: ((Math.atan2(y, x) * 180 / Math.PI + 540) % 360) - 180,
  };
}
