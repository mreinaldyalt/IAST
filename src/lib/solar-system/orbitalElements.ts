/**
 * Elemen orbit Kepler (Standish / JPL "Keplerian Elements and Rates",
 * valid ~1800–2050) untuk 8 planet, epoch J2000.
 *
 * Dipakai untuk:
 *  1) menghitung posisi heliosentris ekliptika sebagai FUNGSI WAKTU
 *     (propagasi Kepler — bukan `angle += speed`), dan
 *  2) membangun lintasan orbit penuh 360°.
 *
 * Sumber angka: JPL Solar System Dynamics — "Approximate Positions of the
 * Planets" (Standish). Ini model MOCK/DEVELOPMENT sampai data NASA JPL
 * Horizons (VECTORS) diintegrasikan; lihat jplHorizons.ts.
 */
import { PlanetId, Vec3 } from './types';

/** Tiap elemen: [nilai@J2000, laju per abad Julian]. Sudut dalam derajat, a dalam AU. */
interface Elem {
  a: [number, number];   // sumbu semi-mayor (AU)
  e: [number, number];   // eksentrisitas
  i: [number, number];   // inklinasi (deg)
  L: [number, number];   // bujur rata-rata (deg)
  wbar: [number, number]; // bujur perihelion ϖ (deg)
  Omega: [number, number]; // bujur simpul naik Ω (deg)
}

export const ELEMENTS: Record<PlanetId, Elem> = {
  mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], i: [7.00497902, -0.00594749], L: [252.25032350, 149472.67411175], wbar: [77.45779628, 0.16047689], Omega: [48.33076593, -0.12534081] },
  venus:   { a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], i: [3.39467605, -0.00078890], L: [181.97909950, 58517.81538729], wbar: [131.60246718, 0.00268329], Omega: [76.67984255, -0.27769418] },
  earth:   { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], i: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], wbar: [102.93768193, 0.32327364], Omega: [0.0, 0.0] },
  mars:    { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], i: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], wbar: [-23.94362959, 0.44441088], Omega: [49.55953891, -0.29257343] },
  jupiter: { a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], i: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], wbar: [14.72847983, 0.21252668], Omega: [100.47390909, 0.20469106] },
  saturn:  { a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], i: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], wbar: [92.59887831, -0.41897216], Omega: [113.66242448, -0.28867794] },
  uranus:  { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], i: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], wbar: [170.95427630, 0.40805281], Omega: [74.01692503, 0.04240589] },
  neptune: { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], i: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], wbar: [44.96476227, -0.32241464], Omega: [131.78422574, -0.00508664] },
};

/** Aphelion terjauh (Neptune) — dipakai untuk fit kamera. */
export const NEPTUNE_AU = ELEMENTS.neptune.a[0]; // ~30.07

const DEG = Math.PI / 180;
const J2000_JD = 2451545.0;

export function jdFromMs(ms: number): number {
  return ms / 86400000 + 2440587.5;
}

function norm360(x: number): number {
  return ((x % 360) + 360) % 360;
}

function solveKepler(Mrad: number, e: number): number {
  // E - e·sinE = M ; iterasi Newton
  let E = Mrad + e * Math.sin(Mrad);
  for (let k = 0; k < 8; k++) {
    const dE = (Mrad - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

/** Posisi heliosentris ekliptika J2000 (AU) pada Julian Date jd. */
export function heliocentricAU(id: PlanetId, jd: number): Vec3 {
  const el = ELEMENTS[id];
  const T = (jd - J2000_JD) / 36525; // abad Julian sejak J2000

  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const I = (el.i[0] + el.i[1] * T) * DEG;
  const L = el.L[0] + el.L[1] * T;
  const wbar = el.wbar[0] + el.wbar[1] * T;
  const Omega = el.Omega[0] + el.Omega[1] * T;

  const omega = (wbar - Omega) * DEG; // argumen perihelion
  let M = norm360(L - wbar);
  if (M > 180) M -= 360;
  const E = solveKepler(M * DEG, e);

  // koordinat di bidang orbit (AU)
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // rotasi ke ekliptika J2000
  const cO = Math.cos(Omega * DEG), sO = Math.sin(Omega * DEG);
  const cI = Math.cos(I), sI = Math.sin(I);
  const cw = Math.cos(omega), sw = Math.sin(omega);

  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = (sw * sI) * xp + (cw * sI) * yp;
  return { x, y, z };
}

/** Lintasan orbit penuh 360° (AU), disampel merata pada anomali eksentrik. */
export function orbitPathAU(id: PlanetId, jd: number, segments = 160): Vec3[] {
  const el = ELEMENTS[id];
  const T = (jd - J2000_JD) / 36525;
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const I = (el.i[0] + el.i[1] * T) * DEG;
  const wbar = el.wbar[0] + el.wbar[1] * T;
  const Omega = el.Omega[0] + el.Omega[1] * T;
  const omega = (wbar - Omega) * DEG;

  const cO = Math.cos(Omega * DEG), sO = Math.sin(Omega * DEG);
  const cI = Math.cos(I), sI = Math.sin(I);
  const cw = Math.cos(omega), sw = Math.sin(omega);

  const pts: Vec3[] = [];
  for (let k = 0; k <= segments; k++) {
    const E = (k / segments) * 2 * Math.PI;
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    pts.push({
      x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
      y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
      z: (sw * sI) * xp + (cw * sI) * yp,
    });
  }
  return pts;
}
