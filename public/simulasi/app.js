import { BODIES, MODES, KMS_PER_AU_YR, GC_AU, R_SGR_AU, SGR_SHADOW_AU, SUN_RADIUS_AU, sunPos, sunSpeedVector, planetPos } from "./sim.js";

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

export const state = {
  years: 0, scale: 40, v: 220, paused: false, mode: "long", follow: null,
  show: { trails: true, labels: true, stars: true, gc: true, dir: true, orbits: true },
};
export const cam = { yaw: 0.9, pitch: 0.16, dist: 70, fov: 760, tx: 0, ty: 0, tz: 0 };

let dragging = false, pinchDistance = 0;
const activePointers = new Map();
const pointDistance = (points) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
canvas.addEventListener("pointerdown", (e) => {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (activePointers.size === 1) {
    dragging = true;
  } else if (activePointers.size === 2) {
    dragging = false;
    pinchDistance = pointDistance([...activePointers.values()]);
  }
});
const releasePointer = (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size === 1) {
    dragging = true; pinchDistance = 0;
  } else {
    dragging = false; pinchDistance = 0;
  }
};
canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
canvas.addEventListener("pointermove", (e) => {
  if (!activePointers.has(e.pointerId)) return;
  const previous = activePointers.get(e.pointerId);
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size > 1) {
    const nextDistance = pointDistance([...activePointers.values()]);
    if (pinchDistance > 0 && nextDistance > 0) {
      cam.dist = Math.max(6, Math.min(8e9, cam.dist * pinchDistance / nextDistance));
    }
    pinchDistance = nextDistance;
    return;
  }
  if (!dragging) return;
  cam.yaw -= (e.clientX - previous.x) * 0.005;
  cam.pitch = Math.max(0.05, Math.min(1.45, cam.pitch + (e.clientY - previous.y) * 0.004));
});
canvas.addEventListener("wheel", (e) => {
  cam.dist = Math.max(6, Math.min(8e9, cam.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
  e.preventDefault();
}, { passive: false });

export const STARS = Array.from({ length: 900 }, () => ({
  x: (Math.random() - 0.5) * 9000, y: (Math.random() - 0.5) * 2600,
  z: (Math.random() - 0.5) * 9000, m: Math.random() ** 2,
}));

export const trails = BODIES.map(() => []);
let lastSample = -1;
// Keep the whole path. Points are stored once and drawn with a stride,
// so a long run never drops the outer planets off the back of the helix.
const MAX_PTS = 80000;
// Years of path already drawn behind the Sun, so the system is already
// in orbit instead of popping out of the black hole.
const BACK = { short: 0, medium: 0, long: 0, galaxy: 0 };

export function resetTrail() {
  lastSample = -1;
  for (const t of trails) t.length = 0;
}

export function record(years) {
  if (years + 1e-6 < lastSample) resetTrail();
  const step = Math.min(0.05, Math.max(0.012, state.scale / 1000));
  let from = lastSample < 0 ? years - (BACK[state.mode] || 0) : lastSample;
  if (from < 0) from = 0;
  if (from > years) from = years;
  const span = years - from;
  if (span <= 1e-9) return;
  const stride = Math.min(0.12, Math.max(step, span / 4000));
  const v = state.mode === "short" ? 0 : state.v;
  const budget = 600;
  let n = 0;
  for (let t = from; t <= years + 1e-9 && n < budget; t += stride, n++) {
    for (let i = 0; i < BODIES.length; i++) {
      const p = planetPos(BODIES[i], t, v, i * 0.9, state.mode);
      trails[i].push(p.x, p.y, p.z);
    }
    lastSample = t;
  }
  const cap = MAX_PTS * 3;
  for (const arr of trails) {
    if (arr.length > cap) arr.splice(0, arr.length - cap);
  }
}

export const view = { W: 1, H: 1, DPR: 1 };
function resize() {
  view.DPR = Math.min(window.innerWidth < 768 ? 1 : 1.5, window.devicePixelRatio || 1);
  view.W = canvas.width = Math.round(innerWidth * view.DPR);
  view.H = canvas.height = Math.round(innerHeight * view.DPR);
}
addEventListener("resize", resize);
resize();

export function basis() {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const f = { x: sy * cp, y: -sp, z: cy * cp };
  const rgt = { x: cy, y: 0, z: -sy };
  const u = { x: sy * sp, y: cp, z: cy * sp };
  return { f, rgt, u, eye: { x: cam.tx - f.x * cam.dist, y: cam.ty - f.y * cam.dist, z: cam.tz - f.z * cam.dist } };
}

export function projectRaw(x, y, z, B) {
  const dx = x - B.eye.x, dy = y - B.eye.y, dz = z - B.eye.z;
  const zz = dx * B.f.x + dy * B.f.y + dz * B.f.z;
  if (zz < 0.05) return null;
  const s = (cam.fov * view.DPR) / zz;
  return {
    x: view.W / 2 + (dx * B.rgt.x + dz * B.rgt.z) * s,
    y: view.H / 2 - (dx * B.u.x + dy * B.u.y + dz * B.u.z) * s,
    z: zz,
  };
}

export function project(p, B) {
  return projectRaw(p.x, p.y, p.z, B);
}

export { canvas, ctx, $, BODIES, MODES, KMS_PER_AU_YR, GC_AU, R_SGR_AU, SGR_SHADOW_AU, SUN_RADIUS_AU, sunPos, sunSpeedVector, planetPos };
