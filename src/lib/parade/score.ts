/**
 * Peringkat "kondisi terbaik" (Bagian 7 MD). DEFAULT = leksikografis: prioritas
 * keras berurutan, kriteria berikutnya hanya dipakai bila yang sebelumnya seri.
 * Tidak memakai bobot arbitrer → tiap keputusan bisa dijelaskan.
 */
import type { ParadeInstant } from './types';

const EPS = 1e-6;

/**
 * Bandingkan dua instan. Return > 0 bila `a` LEBIH BAIK dari `b`, < 0 bila lebih
 * buruk, 0 bila setara. Urutan prioritas:
 *   1) N_visible  2) N_naked  3) alt_min  4) darkness(cap 18°)  5) −span
 */
export function compareParadeInstant(a: ParadeInstant, b: ParadeInstant): number {
  if (a.nParade !== b.nParade) return a.nParade - b.nParade;
  if (a.nNaked !== b.nNaked) return a.nNaked - b.nNaked;
  if (a.nWellPlaced !== b.nWellPlaced) return a.nWellPlaced - b.nWellPlaced;
  if (Math.abs(a.darknessDeg - b.darknessDeg) > EPS) return a.darknessDeg - b.darknessDeg;
  // span lebih kecil = lebih rapat = lebih baik → bandingkan −span
  return b.spanDeg - a.spanDeg;
}

/** True bila `a` lebih baik (atau sama) dari `b`. */
export function isBetterOrEqual(a: ParadeInstant, b: ParadeInstant): boolean {
  return compareParadeInstant(a, b) >= 0;
}

/**
 * Skor terbobot (Bagian 7.2, OPSIONAL — mode eksperimen). Bobot harus dinyatakan
 * eksplisit; BUKAN default penelitian. Disediakan untuk eksplorasi saja.
 */
export function weightedScore(
  i: ParadeInstant,
  w: { w1: number; w2: number; w3: number; w4: number; w5: number } =
    { w1: 10, w2: 4, w3: 3, w4: 2, w5: 3 }
): number {
  return (
    w.w1 * i.nParade +
    w.w2 * i.nNaked +
    w.w3 * (i.nWellPlaced / 7) +
    w.w4 * (i.darknessDeg / 18) -
    w.w5 * (i.spanDeg / 360)
  );
}
