/**
 * Proyeksi RA/Dec (atau Az/Alt) -> koordinat piksel kanvas Stellarium.
 *
 * Dasar: dibaca dari source code asli stellarium-web-engine (bukan tebakan):
 *  - `Module.s2c(theta,phi)` -> vektor unit kartesian dari sudut bola (rad).
 *  - `Module.convertFrame(obs, from, to, vec)` -> transformasi antar frame;
 *    'ICRF'->'VIEW' dan 'OBSERVED'->'VIEW' SUDAH memasukkan arah pandang
 *    kamera (yaw/pitch/roll) — lihat src/frames.c FRAME_VIEW: "Observed
 *    frame rotated in the observer view direction".
 *  - Proyeksi layar: **STEREOGRAFIK** (src/projections/proj_stereographic.c),
 *    BUKAN perspektif biasa — dikonfirmasi dari `max_ui_fov=185°` di source
 *    resminya, PERSIS sama dgn FOV yg dipakai stellarium-web.org (screenshot
 *    pembanding user menunjukkan "FOV 185°"). Proyeksi perspektif standar
 *    (proj_perspective.c, dipakai versi awal modul ini) matematis terdistorsi
 *    parah mendekati FOV lebar (radius layar ∝ tan(θ), meledak dekat θ=90°)
 *    — itu penyebab bug "numpuk"/garis rasi memancar dari satu titik saat
 *    zoom out jauh. Stereografik (radius ∝ 2·tan(θ/2)) valid mulus s.d.
 *    hampir 360°, cuma pecah tepat di titik antipodal (persis di belakang).
 *    Rumus & derivasi konstanta fovy2 diverifikasi cocok formula resmi.
 *
 * Kamera menghadap -Z pada frame VIEW (konvensi OpenGL) — divalidasi empiris:
 * arah pandang sendiri (core.observer.azalt) jatuh tepat di tengah layar.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StelModule = any;

export interface ScreenPoint {
  x: number;
  y: number;
  /** true bila titik bisa diproyeksikan (bukan tepat di titik antipodal) */
  inFront: boolean;
}

/** RA/Dec (derajat, ICRF) -> vektor VIEW-space. */
export function icrfToView(Module: StelModule, obs: unknown, raDeg: number, decDeg: number): number[] {
  const vec = Module.s2c(raDeg * Math.PI / 180, decDeg * Math.PI / 180);
  return Module.convertFrame(obs, 'ICRF', 'VIEW', vec);
}

/** Az/Alt (derajat, OBSERVED) -> vektor VIEW-space. Az diukur dari Utara searah jarum jam. */
export function observedToView(Module: StelModule, obs: unknown, azDeg: number, altDeg: number): number[] {
  const vec = Module.s2c(azDeg * Math.PI / 180, altDeg * Math.PI / 180);
  return Module.convertFrame(obs, 'OBSERVED', 'VIEW', vec);
}

/**
 * Vektor VIEW-space -> piksel layar, via proyeksi STEREOGRAFIK (identik
 * proj_stereographic.c milik engine). fovRad = field-of-view VERTIKAL
 * (core.fov, radian). width/height = ukuran kanvas CSS.
 */
export function viewToScreen(
  view: number[], fovRad: number, width: number, height: number
): ScreenPoint {
  const [x, y, z] = view; // vektor unit, forward = -Z
  // Diskontinuitas persis di titik antipodal (z=+1, tepat di belakang).
  if (z >= 1 - 1e-9) return { x: NaN, y: NaN, inFront: false };
  // x' = 2·tan(θ/2) — lihat proj_stereographic_project (ASCII-art rumus di
  // source resmi). one_over_h dgn z RAW (bukan -z) krn forward sudah -1.
  const oneOverH = 1 / (0.5 * (1 - z));
  const sx = x * oneOverH;
  const sy = y * oneOverH;
  // fovy2 = remap fovy stereografik -> fovy setara utk matriks proyeksi
  // standar (identik proj_stereographic_init: fovy2=2·atan(2·tan(fovy/4))).
  const fovy2 = 2 * Math.atan(2 * Math.tan(fovRad / 4));
  const f = 1 / Math.tan(fovy2 / 2);
  const aspect = width / height;
  const ndcX = sx * f / aspect;
  const ndcY = sy * f;
  return {
    x: (ndcX + 1) / 2 * width,
    y: (-ndcY + 1) / 2 * height,
    inFront: true,
  };
}

export function raDecToScreen(
  Module: StelModule, obs: unknown, raDeg: number, decDeg: number,
  fovRad: number, width: number, height: number
): ScreenPoint {
  const view = icrfToView(Module, obs, raDeg, decDeg);
  return viewToScreen(view, fovRad, width, height);
}

export function azAltToScreen(
  Module: StelModule, obs: unknown, azDeg: number, altDeg: number,
  fovRad: number, width: number, height: number
): ScreenPoint {
  const view = observedToView(Module, obs, azDeg, altDeg);
  return viewToScreen(view, fovRad, width, height);
}
