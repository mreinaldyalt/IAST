/**
 * Posisi satelit dari TLE (CelesTrak) via SGP4 (paket `satellite.js`, MIT,
 * implementasi standar NORAD). Alt/Az topocentris dihitung penuh (termasuk
 * paralaks pengamat), cocok utk proyeksi overlay.
 */
import {
  twoline2satrec, propagate, gstime, eciToEcf, ecfToLookAngles,
  radiansLat, radiansLong,
} from 'satellite.js';

export interface SatEntry {
  name: string;
  l1: string;
  l2: string;
}

export interface SatPosition {
  name: string;
  azDeg: number;
  altDeg: number;
  rangeKm: number;
}

/** Hitung Az/Alt topocentris semua satelit pada waktu & lokasi tertentu. */
export function computeSatellitePositions(
  sats: SatEntry[], dateUTC: Date, latDeg: number, lonDeg: number, altKm = 0
): SatPosition[] {
  const gmst = gstime(dateUTC);
  const observerGd = {
    latitude: radiansLat(latDeg),
    longitude: radiansLong(lonDeg),
    height: altKm,
  };
  const out: SatPosition[] = [];
  for (const s of sats) {
    try {
      const satrec = twoline2satrec(s.l1, s.l2);
      const pv = propagate(satrec, dateUTC);
      if (!pv || !pv.position || typeof pv.position === 'boolean') continue;
      const ecf = eciToEcf(pv.position, gmst);
      const look = ecfToLookAngles(observerGd, ecf);
      const azDeg = (look.azimuth * 180 / Math.PI + 360) % 360;
      const altDeg = look.elevation * 180 / Math.PI;
      if (altDeg < -1) continue; // di bawah horizon, buang lbh awal
      out.push({ name: s.name, azDeg, altDeg, rangeKm: look.rangeSat });
    } catch {
      // TLE tak valid/decayed — lewati diam-diam
    }
  }
  return out;
}
