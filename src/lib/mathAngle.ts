/** Math angle utilities */

/** Wrap angle to [-180, 180) degrees */
export function wrapTo180(deg: number): number {
  let r = deg % 360;
  if (r >= 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

/** Wrap angle to [0, 360) degrees */
export function wrapTo360(deg: number): number {
  let r = deg % 360;
  if (r < 0) r += 360;
  return r;
}

/** Degrees to radians */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Radians to degrees */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
