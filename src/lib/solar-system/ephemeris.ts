/**
 * Ephemeris engine — MENGHASILKAN BodyState[] dari waktu simulasi.
 *
 * ⚠️  DATA_SOURCE = 'MOCK' (DEVELOPMENT).
 *     Posisi dihitung dari propagasi Kepler (orbitalElements.ts), BUKAN dari
 *     NASA JPL Horizons. Akurasinya baik untuk visualisasi (Standish), tetapi
 *     ditandai MOCK sampai integrasi Horizons (VECTORS) selesai — lihat
 *     jplHorizons.ts. Rendering tidak tahu perbedaannya: keduanya memenuhi
 *     kontrak computeBodiesAt(ms) → BodyState[].
 */
import { BodyState, PLANET_IDS, PLANET_NAMES } from './types';
import { heliocentricAU, jdFromMs } from './orbitalElements';

export type DataSource = 'MOCK' | 'NASA';
export const DATA_SOURCE: DataSource = 'MOCK';

/** Posisi seluruh planet pada waktu (ms epoch UTC). Sinkron, murni, tanpa fetch. */
export function computeBodiesAt(ms: number): BodyState[] {
  const jd = jdFromMs(ms);
  const iso = new Date(ms).toISOString();
  return PLANET_IDS.map((id) => {
    const pos = heliocentricAU(id, jd);
    const posNext = heliocentricAU(id, jd + 1); // +1 hari untuk kecepatan
    return {
      id,
      name: PLANET_NAMES[id],
      timestamp: iso,
      position: pos,
      velocity: {
        x: posNext.x - pos.x,
        y: posNext.y - pos.y,
        z: posNext.z - pos.z,
      },
    };
  });
}

/** Jarak dari Matahari (AU). */
export function distanceFromSunAU(b: BodyState): number {
  return Math.hypot(b.position.x, b.position.y, b.position.z);
}
