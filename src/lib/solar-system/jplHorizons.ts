/**
 * Service layer NASA JPL Horizons — STUB untuk tahap berikutnya.
 *
 * Rencana integrasi (belum aktif):
 *  - EPHEM_TYPE = 'VECTORS'
 *  - CENTER = '500@10' (heliosentris, pusat Matahari)
 *  - REF_PLANE = 'ECLIPTIC'  (bidang acuan konsisten dgn orbitalElements.ts)
 *  - OUT_UNITS = 'AU-D'
 *
 * Prinsip arsitektur (spec #10, #13):
 *  - JANGAN fetch NASA pada setiap animation frame.
 *  - Prefetch rentang waktu → cache → interpolasi terhadap simulationTime →
 *    BodyState[]. Signature getBodiesAt(ms) tetap sama sehingga rendering tidak
 *    berubah saat sumber ditukar dari MOCK ke NASA.
 *
 * Saat ini semua fungsi melempar / mengembalikan penanda "belum
 * diimplementasikan" agar tidak ada posisi palsu yang mengaku sebagai NASA.
 */
import { BodyState, PlanetId } from './types';

/** Perintah objek Horizons untuk tiap planet (barycenter). */
export const HORIZONS_COMMAND: Record<PlanetId, string> = {
  mercury: '199', venus: '299', earth: '399', mars: '499',
  jupiter: '599', saturn: '699', uranus: '799', neptune: '899',
};

export interface HorizonsQuery {
  startTimeISO: string;
  stopTimeISO: string;
  stepSize: string; // mis. '1 d'
}

export interface EphemerisRange {
  bodyId: PlanetId;
  source: 'NASA';
  samples: { t: number; position: BodyState['position']; velocity?: BodyState['velocity'] }[];
}

/**
 * Placeholder — akan mengambil VECTORS heliosentris dari Horizons lalu
 * mengembalikan sampel untuk di-cache & diinterpolasi. Belum diaktifkan.
 */
export async function fetchVectorRange(
  _bodyId: PlanetId,
  _q: HorizonsQuery,
): Promise<EphemerisRange> {
  throw new Error(
    'jplHorizons.fetchVectorRange: NASA integration not implemented yet — using MOCK ephemeris (see ephemeris.ts).',
  );
}
