/* Planetary Trajectories — long-term reality.
   The Sun moves through the galaxy; the planets keep orbiting it,
   so their paths become helices. Numbers are real (AU, years, km/s). */

export const AU = 149597870.7;          // km
export const KMS_PER_AU_YR = AU / (365.25 * 86400); // 1 AU/yr in km/s
// The Sun really crawls only ~4.6 AU a year, which would draw the
// helices as dead-straight lines. STAGE compresses that motion so the
// coils stay visible, exactly as the animation does; the readout below
// still reports the true distance.
export const STAGE = 70;

export const BODIES = [
  { id: "mercury", name: "Mercury", a: 0.387,  P: 0.2408, color: "#c2b8a3", r: 0.38, tag: "Tight Helix" },
  { id: "venus",   name: "Venus",   a: 0.723,  P: 0.6152, color: "#e6d2a2", r: 0.95, tag: "Medium Helix" },
  { id: "earth",   name: "Earth",   a: 1.000,  P: 1.0000, color: "#6db7e8", r: 1.00, tag: "Medium Helix" },
  { id: "mars",    name: "Mars",    a: 1.524,  P: 1.8808, color: "#d2644a", r: 0.53, tag: "Super Helix" },
  { id: "jupiter", name: "Jupiter", a: 5.203,  P: 11.862, color: "#d8b48a", r: 2.60, tag: "Wide Helix" },
  { id: "saturn",  name: "Saturn",  a: 9.537,  P: 29.457, color: "#e6d7a8", r: 2.30, tag: "Very Wide", ring: true },
  { id: "uranus",  name: "Uranus",  a: 19.19,  P: 84.011, color: "#b7e3e1", r: 1.60, tag: "Extremely Wide" },
  { id: "neptune", name: "Neptune", a: 30.07,  P: 164.79, color: "#4f78d0", r: 1.55, tag: "Largest & Slow" },
];

export const MODES = [
  { id: "short",  label: "Short-term",  sub: "The usual view",   years: 2,     v: 0 },
  { id: "medium", label: "Medium-term", sub: "Helices appear",   years: 120,   v: 4.2 },
  { id: "long",   label: "Long-term",   sub: "Reality",          years: 2000,  v: 7.4 },
  { id: "galaxy", label: "Galaxy",      sub: "Around Sagittarius A*", years: 12000, v: 7.4 },
];

// Staged radius so a galactic year still reads as a curve on screen.
// The true Sun-Sgr A* distance is R_SGR_AU (~26,000 ly). Galaxy view
// uses that number; the HUD never substitutes the staged radius.
export const GC_AU = 310;
export const R_SGR_AU = 1.644e9;          // 26,000 ly
export const SGR_SHADOW_AU = 0.084;       // EHT shadow diameter, ~5.2 Rs
export const SUN_RADIUS_AU = 0.00465;

export function orbitRadius(mode) {
  return mode === "galaxy" ? R_SGR_AU : GC_AU;
}

export function sunPos(years, vKms, mode) {
  const y = Math.max(0, years);
  const R = orbitRadius(mode);
  const arc = (vKms / KMS_PER_AU_YR) * y / STAGE;
  const ang = arc / R;
  return { x: R * Math.cos(ang), y: 0, z: R * Math.sin(ang) };
}

export function sunSpeedVector(years, vKms, mode) {
  const R = orbitRadius(mode);
  const ang = ((vKms / KMS_PER_AU_YR) * years) / R / STAGE;
  const sp = vKms / KMS_PER_AU_YR / STAGE;
  return { x: -sp * Math.sin(ang), y: 0, z: sp * Math.cos(ang) };
}

/** Planet position in galactic AU. */
export function planetPos(body, years, vKms, phase, mode) {
  const s = sunPos(years, vKms, mode);
  const th = phase + (2 * Math.PI * years) / body.P;
  return {
    x: s.x + body.a * Math.cos(th),
    y: body.a * Math.sin(th) * 0.16,
    z: s.z + body.a * Math.sin(th),
  };
}

/** Sample a trail. Returns array of {x,y,z}. */
export function trail(body, years, vKms, phase, steps, mode) {
  const out = [];
  const n = Math.max(2, steps);
  for (let i = 0; i <= n; i++) {
    out.push(planetPos(body, (years * i) / n, vKms, phase, mode));
  }
  return out;
}
