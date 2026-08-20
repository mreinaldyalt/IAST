/**
 * Tipe data fitur Parade Planet. Lihat Catatan Komputasi/PARADE_PLANET.md untuk
 * definisi operasional, rumus, dan ambang (semua ambang = operasional/heuristik,
 * bukan standar astronomi resmi).
 */

/** Tujuh planet target (Bumi = pengamat, tidak dihitung sebagai target). */
export type ParadePlanetId =
  | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

export const PARADE_PLANET_IDS: ParadePlanetId[] = [
  'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
];

/** Kelas optik per-planet (Bagian 5 MD) — mengikuti klasifikasi NASA, bukan
 * ambang magnitudo tunggal. */
export type OpticalClass = 'naked-eye' | 'aided-recommended' | 'telescope-required';

export const OPTICAL_CLASS: Record<ParadePlanetId, OpticalClass> = {
  mercury: 'naked-eye',
  venus: 'naked-eye',
  mars: 'naked-eye',
  jupiter: 'naked-eye',
  saturn: 'naked-eye',
  uranus: 'aided-recommended',
  neptune: 'telescope-required',
};

/** Ambang operasional (Bagian 8 MD) — dapat disetel. */
export interface ParadeCriteria {
  hMin: number;      // altitude minimum planet (default 10°)
  sMax: number;      // ketinggian Matahari maksimum / langit gelap (default −6°)
  epsMin: number;    // elongasi minimum dari Matahari (default 15°)
  nMin: number;      // jumlah planet minimum disebut "parade" (default 4)
  dtMinutes: number; // langkah sampling waktu coarse (default 10 menit)
}

export const DEFAULT_CRITERIA: ParadeCriteria = {
  hMin: 10,
  sMax: -6,
  epsMin: 15,
  nMin: 4,
  dtMinutes: 10,
};

/** Status satu planet pada satu (waktu, lokasi). */
export interface PlanetVisibility {
  id: ParadePlanetId;
  altDeg: number;
  azDeg: number;
  elongDeg: number;
  opticalClass: OpticalClass;
  aboveHorizon: boolean;  // alt > 0 → IKUT parade (hitungan utama)
  wellPlaced: boolean;    // alt ≥ h_min → nyaman diamati (tak menempel ufuk)
  nearSun: boolean;       // elong < ε_min → dekat Matahari (silau/senja)
}

/**
 * Snapshot parade pada satu instan waktu di satu lokasi.
 *
 * Penting: "parade" dihitung dari planet yang ADA DI ATAS UFUK dalam langit
 * gelap (nParade) — termasuk yang perlu binokular/teleskop, konsisten dengan
 * cara media/astronom menyebut "parade N planet". Kemudian dirinci: berapa yang
 * mata-telanjang (nNaked), berapa perlu alat (nAided), berapa nyaman/tinggi
 * (nWellPlaced).
 */
export interface ParadeInstant {
  epochMsUTC: number;
  localTimeISO: string;   // waktu lokal (naive, tanpa offset) untuk tampilan/Stellarium
  sunAltDeg: number;
  planets: PlanetVisibility[];
  nParade: number;        // planet di atas ufuk (ikut parade)
  nNaked: number;         // subhimpunan berkelas mata-telanjang
  nAided: number;         // subhimpunan yang perlu alat (Uranus/Neptunus)
  nWellPlaced: number;    // di atas ufuk & alt ≥ h_min (nyaman)
  altMinDeg: number;      // altitude terendah di antara peserta parade
  darknessDeg: number;    // min(18, −alt☉)
  spanDeg: number;        // rentang bujur ekliptika peserta (360 − gap terbesar)
}

/** Hasil untuk satu lokasi (grid global atau lokasi user). */
export interface ParadeLocationResult {
  name: string;
  lat: number;
  lon: number;
  tz: string;
  best: ParadeInstant | null;         // instan terbaik (leksikografis) pada hari D
  windowStartLocalISO: string | null; // awal window kriteria-terpenuhi
  windowEndLocalISO: string | null;   // akhir window kriteria-terpenuhi
  topoVerified: boolean;              // apakah tabel planet sudah diverifikasi via Horizons #4
}

export interface ParadeResult {
  dateD: string;              // YYYY-MM-DD (hari sipil lokal)
  criteria: ParadeCriteria;
  meetsNMin: boolean;         // apakah lokasi terbaik memenuhi N_min (berbantuan alat)
  meetsNMinNaked: boolean;    // apakah memenuhi N_min mata-telanjang
  globalBest: ParadeLocationResult | null;
  userLocation: ParadeLocationResult | null;
  dataSource: string;         // 'live' | 'cache' | 'mock'
  warnings: string[];
}
