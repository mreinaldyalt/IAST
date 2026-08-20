/**
 * Transformasi skala & koordinat: AU (heliosentris ekliptika) → satuan scene
 * Three.js. Dua mode sesuai spec:
 *
 *  - OVERVIEW    : kompresi radial (pow 0.5) agar Mercury–Neptune terlihat
 *                  jelas. Arah/sudut posisi DIPERTAHANKAN, hanya radius yang
 *                  dikompres → indikator "DISTANCE: VISUAL SCALE".
 *  - SCIENTIFIC  : satu faktor skala global (linear) — rasio jarak antarplanet
 *                  dipertahankan → "DISTANCE: TO SCALE" (ukuran bola tetap
 *                  diperbesar → "PLANET SIZE: EXAGGERATED").
 *
 * Kedua mode memakai radius terluar (Neptune) yang sama → fit kamera konsisten.
 */
import { ScaleMode, Vec3 } from './types';
import { NEPTUNE_AU } from './orbitalElements';

/** Radius scene untuk orbit Neptune (dipakai fit kamera). */
export const OUTER_SCENE = 30;

/** 1 AU dalam km. */
export const AU_KM = 149_597_870.7;

/** Faktor skala jarak linear untuk mode SCIENTIFIC (satuan scene per AU). */
export const SCI_UNITS_PER_AU = OUTER_SCENE / NEPTUNE_AU;

/**
 * Radius bola scene pada mode SCIENTIFIC = radius fisik nyata (km) × faktor
 * skala jarak yang SAMA. Jadi ukuran & jarak 100% konsisten to-scale
 * (akibatnya bola menjadi sangat kecil — planet dilokasikan lewat marker,
 * bukan dengan memperbesar ukuran).
 */
export function realRadiusScene(realRadiusKm: number): number {
  return (realRadiusKm / AU_KM) * SCI_UNITS_PER_AU;
}

/** Peta radius AU → radius scene sesuai mode (mempertahankan arah). */
export function radiusScale(rAU: number, mode: ScaleMode): number {
  if (mode === 'scientific') {
    return OUTER_SCENE * (rAU / NEPTUNE_AU);
  }
  // overview: kompresi akar kuadrat
  return OUTER_SCENE * Math.pow(rAU / NEPTUNE_AU, 0.5);
}

/**
 * AU ekliptika → koordinat Three.js [x, y, z] (Y = utara ekliptika/atas).
 * Bidang ekliptika dipetakan ke bidang XZ agar tampilan top-down alami.
 */
export function auToScene(p: Vec3, mode: ScaleMode): [number, number, number] {
  const r = Math.hypot(p.x, p.y, p.z) || 1e-9;
  const f = radiusScale(r, mode) / r;
  return [p.x * f, p.z * f, -p.y * f];
}

/** Radius fit kamera: orbit terluar + padding ~10%. */
export function fitRadius(): number {
  return OUTER_SCENE * 1.1;
}

/**
 * Radius-tampil bola pada mode SCIENTIFIC = fungsi SUB-LINEAR dari jarak kamera.
 * Tujuan: (a) bola tetap terlihat saat zoom-out (tak sub-pixel), (b) zoom-IN
 * MEMPERBESAR bola di layar (seperti mode Ikhtisar) alih-alih ukuran konstan.
 * Eksponen < 1 → ukuran-layar (∝ radius/jarak) naik saat jarak mengecil.
 * `k` = pengali (Matahari sedikit lebih besar dari planet).
 */
export function sciMarkerRadius(distToCamera: number, k = 1): number {
  return k * 0.035 * Math.pow(Math.max(distToCamera, 0.001), 0.55);
}
