/**
 * Reduction from J2000/ICRF mean-equatorial cartesian position to apparent
 * (true-equator-and-equinox-of-date) coordinates, plus topocentric horizon
 * transform — a from-scratch replacement for what HORIZONS' OBSERVER table
 * (APPARENT='AIRLESS') would otherwise compute server-side.
 *
 * Standard IAU 1976 precession + IAU 1980 nutation (Meeus, "Astronomical
 * Algorithms" 2nd ed., ch. 21/22/11). Truncated nutation series (dominant
 * terms only, ~0.5" accuracy) is far more than sufficient given this app's
 * decision thresholds are in whole degrees (KHGT alt>=5, elong>=8; Wujudul
 * Hilal alt>0) — the truncation error is ~4 orders of magnitude below the
 * smallest margin that ever matters here. Validated against known-correct
 * HORIZONS OBSERVER-table output captured in evaluasi.xlsx (see
 * scripts/validate-vector-transform.mjs).
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const ARCSEC2DEG = 1 / 3600;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function wrapDeg(deg: number): number {
  const w = deg % 360;
  return w < 0 ? w + 360 : w;
}

/** Julian centuries of TT/TDB from J2000.0, given a JD. */
export function julianCenturiesJ2000(jd: number): number {
  return (jd - 2451545.0) / 36525.0;
}

/** Mean obliquity of the ecliptic, IAU 1980, in degrees. */
export function meanObliquityDeg(T: number): number {
  const arcsec = 84381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T * T * T;
  return arcsec * ARCSEC2DEG;
}

export interface Nutation {
  dPsiDeg: number; // nutation in longitude
  dEpsDeg: number; // nutation in obliquity
}

/**
 * Nutation in longitude/obliquity, IAU 1980 dominant terms (Meeus ch. 22,
 * "lower accuracy" series — ~0.5" error, plenty for degree-scale thresholds).
 */
export function nutationDeg(T: number): Nutation {
  const Omega = wrapDeg(125.04452 - 1934.136261 * T);
  const Lsun = wrapDeg(280.4665 + 36000.7698 * T);
  const Lmoon = wrapDeg(218.3165 + 481267.8813 * T);

  const OmegaR = Omega * DEG2RAD;
  const LsunR = Lsun * DEG2RAD;
  const LmoonR = Lmoon * DEG2RAD;

  const dPsiArcsec =
    -17.20 * Math.sin(OmegaR) -
    1.32 * Math.sin(2 * LsunR) -
    0.23 * Math.sin(2 * LmoonR) +
    0.21 * Math.sin(2 * OmegaR);

  const dEpsArcsec =
    9.20 * Math.cos(OmegaR) +
    0.57 * Math.cos(2 * LsunR) +
    0.10 * Math.cos(2 * LmoonR) -
    0.09 * Math.cos(2 * OmegaR);

  return { dPsiDeg: dPsiArcsec * ARCSEC2DEG, dEpsDeg: dEpsArcsec * ARCSEC2DEG };
}

function rotX(v: Vec3, angleDeg: number): Vec3 {
  const a = angleDeg * DEG2RAD;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}

function rotZ(v: Vec3, angleDeg: number): Vec3 {
  const a = angleDeg * DEG2RAD;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

/** Standard right-handed rotation about the Y axis (direct formula — no
 *  X-axis conjugation trick, which is an easy place to get a sign wrong). */
function rotY(v: Vec3, angleDeg: number): Vec3 {
  const a = angleDeg * DEG2RAD;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

/**
 * Precess a J2000.0 mean-equatorial cartesian vector to the mean equator and
 * equinox of the target date. IAU 1976 (Lieske) precession angles.
 */
export function precessJ2000ToDate(v: Vec3, T: number): Vec3 {
  const zetaArcsec = 2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T;
  const zArcsec = 2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T;
  const thetaArcsec = 2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T;

  const zeta = zetaArcsec * ARCSEC2DEG;
  const z = zArcsec * ARCSEC2DEG;
  const theta = thetaArcsec * ARCSEC2DEG;

  // Meeus' zeta/z/theta parametrize a PASSIVE rotation (of the reference frame);
  // rotX/rotY/rotZ here implement ACTIVE rotation (of the vector) — equal in
  // magnitude but opposite in sign, so every angle is negated relative to the
  // textbook P = R_z(-z).R_y(theta).R_z(-zeta) formula.
  let p = rotZ(v, zeta);
  p = rotY(p, -theta);
  p = rotZ(p, z);
  return p;
}

/**
 * Apply nutation to a mean-of-date equatorial vector, producing the
 * true-of-date equatorial vector. First-order nutation matrix
 * N = R1(-eps-dEps) . R3(-dPsi) . R1(eps) — same passive/active sign flip as
 * precessJ2000ToDate applies (see comment there).
 */
export function applyNutation(v: Vec3, meanObliquityDegVal: number, nut: Nutation): Vec3 {
  let p = rotX(v, -meanObliquityDegVal);
  p = rotZ(p, nut.dPsiDeg);
  p = rotX(p, meanObliquityDegVal + nut.dEpsDeg);
  return p;
}

/** Full reduction: J2000/ICRF mean equatorial vector -> true-of-date equatorial vector. */
export function reduceToApparentOfDate(v: Vec3, jd: number): { vec: Vec3; trueObliquityDeg: number; nut: Nutation } {
  const T = julianCenturiesJ2000(jd);
  const eps0 = meanObliquityDeg(T);
  const nut = nutationDeg(T);
  const precessed = precessJ2000ToDate(v, T);
  const trueOfDate = applyNutation(precessed, eps0, nut);
  return { vec: trueOfDate, trueObliquityDeg: eps0 + nut.dEpsDeg, nut };
}

export interface RaDec {
  raDeg: number;
  decDeg: number;
}

export function cartesianToRaDec(v: Vec3): RaDec {
  const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const decDeg = Math.asin(v.z / r) * RAD2DEG;
  const raDeg = wrapDeg(Math.atan2(v.y, v.x) * RAD2DEG);
  return { raDeg, decDeg };
}

/** Equatorial-of-date cartesian vector -> ecliptic longitude of date (degrees). */
export function cartesianToEclipticLon(v: Vec3, trueObliquityDeg: number): number {
  const rotated = rotX(v, -trueObliquityDeg);
  return wrapDeg(Math.atan2(rotated.y, rotated.x) * RAD2DEG);
}

export function raDecDegToVec3(raDeg: number, decDeg: number, r = 1): Vec3 {
  const ra = raDeg * DEG2RAD;
  const dec = decDeg * DEG2RAD;
  return {
    x: r * Math.cos(dec) * Math.cos(ra),
    y: r * Math.cos(dec) * Math.sin(ra),
    z: r * Math.sin(dec),
  };
}

const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
const EARTH_FLATTENING = 1 / 298.257223563;

/**
 * Observer's geocentric position vector in the equatorial-of-date frame at a
 * given Greenwich Apparent Sidereal Time, using the standard oblate-Earth
 * rho*sin(phi')/rho*cos(phi') parallax factors (Meeus ch. 11).
 */
export function observerGeocentricVec(latDeg: number, lonDeg: number, heightKm: number, gastDeg: number): Vec3 {
  const phi = latDeg * DEG2RAD;
  const ea = EARTH_EQUATORIAL_RADIUS_KM;
  const f = EARTH_FLATTENING;
  const bOverA = 1 - f;
  const u = Math.atan(bOverA * bOverA * Math.tan(phi));
  const rhoSinPhiPrime = bOverA * bOverA * Math.sin(u) + (heightKm / ea) * Math.sin(phi);
  const rhoCosPhiPrime = Math.cos(u) + (heightKm / ea) * Math.cos(phi);

  const lst = (gastDeg + lonDeg) * DEG2RAD;
  return {
    x: ea * rhoCosPhiPrime * Math.cos(lst),
    y: ea * rhoCosPhiPrime * Math.sin(lst),
    z: ea * rhoSinPhiPrime,
  };
}

/** Greenwich Mean Sidereal Time, IAU formula, in degrees. */
export function gmstDeg(jdUt1: number): number {
  const T = (jdUt1 - 2451545.0) / 36525.0;
  const gmst =
    280.46061837 +
    360.98564736629 * (jdUt1 - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000.0;
  return wrapDeg(gmst);
}

/** Greenwich Apparent Sidereal Time = GMST + equation of the equinoxes. */
export function gastDeg(jdUt1: number, nut: Nutation, meanObliquityDegVal: number): number {
  const eqEquinoxDeg = nut.dPsiDeg * Math.cos(meanObliquityDegVal * DEG2RAD);
  return wrapDeg(gmstDeg(jdUt1) + eqEquinoxDeg);
}

export interface AltAz {
  altDeg: number;
  azDeg: number;
}

/**
 * Topocentric altitude/azimuth (airless, no refraction — matches HORIZONS'
 * APPARENT='AIRLESS') from a true-of-date apparent RA/Dec + observer site.
 */
export function raDecToAltAz(raDeg: number, decDeg: number, latDeg: number, lonDeg: number, gastDeg: number): AltAz {
  const lat = latDeg * DEG2RAD;
  const dec = decDeg * DEG2RAD;
  const H = wrapDeg(gastDeg + lonDeg - raDeg) * DEG2RAD;

  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAlt = Math.cos(alt);

  let azDeg: number;
  if (Math.abs(cosAlt) < 1e-9) {
    azDeg = 0;
  } else {
    const sinAz = -Math.sin(H) * Math.cos(dec) / cosAlt;
    const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (cosAlt * Math.cos(lat));
    azDeg = wrapDeg(Math.atan2(sinAz, cosAz) * RAD2DEG);
  }

  return { altDeg: alt * RAD2DEG, azDeg };
}
