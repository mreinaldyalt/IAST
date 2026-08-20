/**
 * Solar System — tipe data bersama.
 *
 * Kontrak inti: rendering HANYA menerima BodyState[]. Ia tidak tahu dari mana
 * data astronominya berasal (mock/Kepler sekarang, NASA JPL Horizons nanti).
 */

export type PlanetId =
  | 'mercury' | 'venus' | 'earth' | 'mars'
  | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

export type ScaleMode = 'overview' | 'scientific';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * State satu benda langit pada satu waktu. Posisi heliosentris ekliptika J2000,
 * satuan AU (Astronomical Unit). Inilah SATU-SATUNYA bentuk yang diterima
 * rendering engine.
 */
export interface BodyState {
  id: string;
  name: string;
  timestamp: string;   // ISO 8601 (UTC)
  position: Vec3;       // heliosentris ekliptika J2000 (AU)
  velocity?: Vec3;      // AU/hari (opsional)
}

/** Definisi visual planet. */
export interface PlanetVisual {
  id: PlanetId;
  color: string;
  emissive?: string;
  visualRadius: number;   // satuan scene untuk mode OVERVIEW (diperbesar agar terlihat)
  realRadiusKm: number;   // radius fisik nyata (km) untuk mode SCIENTIFIC (to-scale)
  hasRing?: boolean;
  ringColor?: string;
}

/** Radius fisik Matahari (km). */
export const SUN_RADIUS_KM = 696_340;

export const PLANET_IDS: PlanetId[] = [
  'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
];

/** Nama kanonik (EN). UI melokalkan lewat id → i18n. */
export const PLANET_NAMES: Record<PlanetId, string> = {
  mercury: 'Mercury', venus: 'Venus', earth: 'Earth', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune',
};

export const PLANET_VISUALS: Record<PlanetId, PlanetVisual> = {
  mercury: { id: 'mercury', color: '#9c8e80', visualRadius: 0.34, realRadiusKm: 2439.7 },
  venus:   { id: 'venus',   color: '#d9b382', visualRadius: 0.46, realRadiusKm: 6051.8 },
  earth:   { id: 'earth',   color: '#4b7fd4', emissive: '#12325f', visualRadius: 0.48, realRadiusKm: 6371.0 },
  mars:    { id: 'mars',    color: '#c1502e', visualRadius: 0.40, realRadiusKm: 3389.5 },
  jupiter: { id: 'jupiter', color: '#c9a06a', visualRadius: 0.95, realRadiusKm: 69911 },
  saturn:  { id: 'saturn',  color: '#d8c39a', visualRadius: 0.82, realRadiusKm: 58232, hasRing: true, ringColor: '#c2ad86' },
  uranus:  { id: 'uranus',  color: '#8fd3e0', visualRadius: 0.64, realRadiusKm: 25362 },
  neptune: { id: 'neptune', color: '#3f66d6', visualRadius: 0.62, realRadiusKm: 24622 },
};
