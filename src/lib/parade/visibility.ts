/**
 * Rumus transformasi koordinat & uji kriteria visibilitas (Bagian 4–5 MD).
 * Semua sudut derajat kecuali dinyatakan lain. Konversi RA/Dec geosentris →
 * Alt/Az lokal memakai GMST (mean sidereal) — cukup untuk pindaian coarse;
 * kandidat teratas diverifikasi ulang topocentric via Horizons #4 (Bagian 6.6).
 */
import { degToRad, radToDeg, wrapTo360 } from '../mathAngle';
import { gmstDeg, localSiderealDeg } from '../geoCalc';
import {
  type ParadeCriteria, type OpticalClass, OPTICAL_CLASS, type ParadePlanetId,
} from './types';

export interface AltAz {
  alt: number;
  az: number;
}

/** Alt & Az dari RA/Dec geosentris untuk pengamat (φ, λ) pada waktu UTC (4.5). */
export function altAzFromRaDec(
  raDeg: number, decDeg: number, latDeg: number, lonDeg: number, dateUTC: Date
): AltAz {
  const lst = localSiderealDeg(gmstDeg(dateUTC), lonDeg);
  const H = degToRad(wrapTo360(lst - raDeg));
  const lat = degToRad(latDeg);
  const dec = degToRad(decDeg);

  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const alt = radToDeg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));

  const cosAz = (Math.sin(dec) - Math.sin(lat) * Math.sin(degToRad(alt))) /
    (Math.cos(lat) * Math.cos(degToRad(alt)));
  let az = radToDeg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  if (Math.sin(H) > 0) az = 360 - az; // diukur dari Utara searah jarum jam

  return { alt, az };
}

/** Refraksi atmosfer Bennett (arcmin) — opsional, signifikan hanya di alt rendah. */
export function bennettRefractionArcmin(altDeg: number): number {
  return 1.02 / Math.tan(degToRad(altDeg + 10.3 / (altDeg + 5.11)));
}

/** Elongasi planet–Matahari (4.7 fallback, spherical law of cosines). */
export function elongationDeg(
  raPlanet: number, decPlanet: number, raSun: number, decSun: number
): number {
  const rp = degToRad(raPlanet), dp = degToRad(decPlanet);
  const rs = degToRad(raSun), ds = degToRad(decSun);
  const cosE = Math.sin(dp) * Math.sin(ds) + Math.cos(dp) * Math.cos(ds) * Math.cos(rp - rs);
  return radToDeg(Math.acos(Math.max(-1, Math.min(1, cosE))));
}

/** Rentang bujur ekliptika (4.9): 360 − celah kosong terbesar antar planet. */
export function eclipticSpanDeg(eclLons: number[]): number {
  if (eclLons.length <= 1) return 0;
  const sorted = eclLons.map((x) => wrapTo360(x)).sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = i === sorted.length - 1 ? sorted[0] + 360 : sorted[i + 1];
    maxGap = Math.max(maxGap, next - sorted[i]);
  }
  return 360 - maxGap;
}

export function opticalClassOf(id: ParadePlanetId): OpticalClass {
  return OPTICAL_CLASS[id];
}

export interface PlanetClass {
  aboveHorizon: boolean; // alt > 0 → ikut parade
  wellPlaced: boolean;   // alt ≥ h_min → nyaman
  nearSun: boolean;      // elong < ε_min → dekat Matahari
}

/**
 * Klasifikasi satu planet pada satu instan. Sebuah planet IKUT parade bila ada
 * di atas ufuk (alt > 0) saat langit gelap — termasuk yang perlu alat, sesuai
 * cara media/astronom menghitung "parade N planet". `wellPlaced`/`nearSun`
 * hanya penanda kualitas, tidak mengeluarkan planet dari hitungan parade.
 */
export function classifyPlanet(
  altDeg: number, elongDeg: number, c: ParadeCriteria
): PlanetClass {
  return {
    aboveHorizon: altDeg > 0,
    wellPlaced: altDeg >= c.hMin,
    nearSun: elongDeg < c.epsMin,
  };
}
