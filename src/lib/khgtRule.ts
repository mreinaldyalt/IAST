/**
 * KHGT threshold check: geocentric Moon altitude and elongation.
 */
export const KHGT_ALT_THRESHOLD = 5.0;   // degrees
export const KHGT_ELONG_THRESHOLD = 8.0; // degrees

export interface KHGTCheckResult {
  pass: boolean;
  geoAltDeg: number;
  geoElongDeg: number;
  altMargin: number;   // geoAlt - threshold
  elongMargin: number; // geoElong - threshold
}

export function checkKHGT(geoAltDeg: number, geoElongDeg: number): KHGTCheckResult {
  const altMargin = geoAltDeg - KHGT_ALT_THRESHOLD;
  const elongMargin = geoElongDeg - KHGT_ELONG_THRESHOLD;
  return {
    pass: altMargin >= 0 && elongMargin >= 0,
    geoAltDeg,
    geoElongDeg,
    altMargin,
    elongMargin,
  };
}
