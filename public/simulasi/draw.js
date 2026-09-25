import { canvas, ctx, state, cam, STARS, trails, view, project, projectRaw, BODIES, sunPos, GC_AU, R_SGR_AU, SGR_SHADOW_AU, SUN_RADIUS_AU } from "./app.js";
import text from "./locale.js";

const gcR = () => (state.mode === "galaxy" ? R_SGR_AU : GC_AU);

const sky = document.createElement("canvas");
const skyCtx = sky.getContext("2d");
let skyKey = "";

function skyStamp() {
  const place = cam.dist > 1e6 ? 2e5 : 40;
  return [
    view.W, view.H,
    Math.round(cam.yaw * 120), Math.round(cam.pitch * 120), Math.round(Math.log10(cam.dist) * 40),
    Math.round(cam.tx / place), Math.round(cam.ty / place), Math.round(cam.tz / place),
    state.show.stars ? 1 : 0, state.mode,
  ].join("|");
}

function paintSky(B) {
  sky.width = view.W;
  sky.height = view.H;
  skyCtx.clearRect(0, 0, view.W, view.H);
  if (!state.show.stars) return;
  const d = view.DPR;
  for (const st of STARS) {
    const q = projectRaw(st.x, st.y, st.z, B);
    if (!q || q.z > 5000) continue;
    const a = Math.min(0.8, st.m * 1.5 * (800 / q.z));
    if (a < 0.05) continue;
    const s = st.m > 0.8 ? 1.6 * d : d;
    skyCtx.fillStyle = `rgba(255,244,220,${a.toFixed(2)})`;
    skyCtx.fillRect(q.x, q.y, s, s);
  }
}

export function drawStars(B) {
  const key = skyStamp();
  if (key !== skyKey) { paintSky(B); skyKey = key; }
  ctx.drawImage(sky, 0, 0);
}

function lane(B, rad, target, color, width) {
  const n = 72;
  const pts = [];
  for (let a = 0; a <= n; a++) {
    const th = (a / n) * Math.PI * 2;
    const q = projectRaw(Math.cos(th) * rad, 0, Math.sin(th) * rad, B);
    pts.push(q ? { x: q.x, y: q.y } : null);
  }
  target.beginPath();
  let pen = false;
  for (const q of pts) {
    if (!q) { pen = false; continue; }
    pen ? target.lineTo(q.x, q.y) : target.moveTo(q.x, q.y);
    pen = true;
  }
  target.strokeStyle = color;
  target.lineWidth = width;
  target.stroke();
}

const DISK = (() => {
  const pts = [];
  let s = 20260322;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const GC = R_SGR_AU;
  for (let i = 0; i < 3400; i++) {
    const onArm = i % 8 !== 0;
    const u = rnd();
    const rad = GC * (onArm ? 0.28 + u * 2.35 : 0.12 + Math.pow(u, 0.7) * 2.5);
    const which = i % 2;
    const ang = which * Math.PI + rad / GC * 2.4 + (rnd() - 0.5) * (onArm ? 0.22 : 1.1);
    pts.push({
      x: Math.cos(ang) * rad,
      y: (rnd() - 0.5) * GC * (0.03 + rad / GC * 0.018),
      z: Math.sin(ang) * rad,
      m: onArm ? 0.55 + rnd() * 0.45 : 0.2 + rnd() * 0.35,
      arm: which === 0,
    });
  }
  return pts;
})();

const dustLayer = document.createElement("canvas");
const dustCtx = dustLayer.getContext("2d");
let dustKey = "";

function paintDust(B) {
  dustLayer.width = view.W;
  dustLayer.height = view.H;
  dustCtx.clearRect(0, 0, view.W, view.H);
  const d = view.DPR;
  const Rscale = gcR();
  const rings = state.mode === "galaxy"
    ? [0.55, 0.85, 1.15, 1.5, 1.9, 2.35]
    : [1.15, 1.55, 2.0, 2.45];
  for (const k of rings) lane(B, Rscale * k, dustCtx, "rgba(232,196,120,.16)", d);
  lane(B, Rscale, dustCtx, "rgba(255,236,210,.32)", d * 1.2);
  const gold = [[], [], []];
  const blue = [[], [], []];
  const step = cam.dist > 1e6 ? 2 : 1;
  for (let i = 0; i < DISK.length; i += step) {
    const st = DISK[i];
    const q = projectRaw(st.x, st.y, st.z, B);
    if (!q) continue;
    if (q.z > 9000 && cam.dist < 1e6) continue;
    const depth = Math.min(4, (cam.dist * 0.35) / q.z);
    const a = Math.min(0.9, st.m * depth);
    if (a < 0.04) continue;
    const bin = a > 0.45 ? 2 : a > 0.2 ? 1 : 0;
    (st.arm ? gold : blue)[bin].push(q.x, q.y);
  }
  const paint = (groups, color, alphas) => {
    for (let b = 0; b < 3; b++) {
      const pts = groups[b];
      if (!pts.length) continue;
      dustCtx.fillStyle = color + alphas[b] + ")";
      const s = (b === 2 ? d * 1.7 : d * 1.25) * (cam.dist > 1e6 ? 2.2 : 1);
      for (let i = 0; i < pts.length; i += 2) dustCtx.fillRect(pts[i], pts[i + 1], s, s);
    }
  };
  paint(blue, "rgba(150,180,255,", ["0.16", "0.32", "0.55"]);
  paint(gold, "rgba(255,214,150,", ["0.18", "0.38", "0.7"]);
}

export function drawGalacticCentre(B) {
  if (!state.show.gc || state.mode === "short" || state.mode === "medium") return;
  const d = view.DPR;
  const hole = projectRaw(0, 0, 0, B);
  if (!hole) return;
  const bh = { x: hole.x, y: hole.y, z: hole.z };

  // Shadow of Sgr A* is ~0.084 AU. The Sun's photosphere is ~0.0047 AU,
  // so a true-scale hole is ~18x the Sun. No screen-size floor: zooming
  // out must shrink it, never inflate it past the horizon.
  const R = Math.max(0.4 * d, (SGR_SHADOW_AU * cam.fov * d) / bh.z);
  const showDisk = state.mode === "galaxy" || cam.dist > 180;

  if (showDisk) {
    const glowR = Math.min(bh.z * 0.9, R * 14);
    const g = ctx.createRadialGradient(bh.x, bh.y, R, bh.x, bh.y, glowR);
    g.addColorStop(0, "rgba(255,214,140,.28)");
    g.addColorStop(0.35, "rgba(180,110,40,.08)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bh.x, bh.y, glowR, 0, 7);
    ctx.fill();
    paintDust(B);
    ctx.drawImage(dustLayer, 0, 0);
  }

  if (R > 2.2 * d) {
    ctx.save();
    ctx.translate(bh.x, bh.y);
    ctx.rotate(-0.5);
    ctx.scale(1, 0.34);
    ctx.lineWidth = Math.max(1, R * 0.18);
    ctx.strokeStyle = "rgba(255,236,200,.9)";
    ctx.beginPath(); ctx.arc(0, 0, R * 2.4, 0, 7); ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.arc(bh.x, bh.y, Math.max(R, 0.6 * d), 0, 7); ctx.fill();
}

export function drawTrail(arr, B, color, width) {
  const n = arr.length / 3;
  if (n < 2) return;
  const cap = cam.dist > 400 ? 500 : cam.dist > 80 ? 900 : 1400;
  const stride = Math.max(1, Math.ceil(n / cap));
  const far = Math.max(cam.dist * 40, 8000);
  ctx.beginPath();
  let pen = false;
  let prev = null;
  const plot = (i) => {
    const q = projectRaw(arr[i], arr[i + 1], arr[i + 2], B);
    const on = q && q.z <= far;
    if (!on) { pen = false; prev = null; return; }
    if (prev) {
      const dx = q.x - prev.x, dy = q.y - prev.y;
      if (dx * dx + dy * dy > (view.W * 0.45) ** 2) pen = false;
    }
    pen ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    pen = true;
    prev = q;
  };
  for (let i = 0; i < arr.length; i += 3 * stride) plot(i);
  const last = (n - 1) * 3;
  if (last % (3 * stride) !== 0) plot(last);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function orbitRing(B, b, v) {
  const s = sunPos(state.years, v, state.mode);
  const tilt = 0.16;
  const pts = [];
  for (let a = 0; a <= 64; a++) {
    const th = (a / 64) * Math.PI * 2;
    const o = projectRaw(
      s.x + b.a * Math.cos(th),
      b.a * Math.sin(th) * tilt,
      s.z + b.a * Math.sin(th),
      B);
    pts.push(o ? { x: o.x, y: o.y } : null);
  }
  ctx.beginPath();
  let pen = false;
  for (const o of pts) {
    if (!o) { pen = false; continue; }
    pen ? ctx.lineTo(o.x, o.y) : ctx.moveTo(o.x, o.y);
    pen = true;
  }
  ctx.strokeStyle = "rgba(255,255,255,.13)";
  ctx.lineWidth = view.DPR * 0.7;
  ctx.stroke();
}

export function drawBody(b, p, B, v) {
  const hit = project(p, B);
  if (!hit) return;
  const q = { x: hit.x, y: hit.y, z: hit.z };
  const d = view.DPR;
  const rad = Math.max(1.4 * d, ((state.mode === "galaxy" ? SUN_RADIUS_AU * 40 : b.r * 9) * d) / Math.sqrt(q.z));
  if (state.show.orbits && (state.mode === "short" || state.mode === "medium")) orbitRing(B, b, v);

  const glow = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad * 3);
  glow.addColorStop(0, b.color + "cc");
  glow.addColorStop(1, b.color + "00");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(q.x, q.y, rad * 3, 0, 7); ctx.fill();

  const shade = ctx.createRadialGradient(q.x - rad * 0.35, q.y - rad * 0.4, rad * 0.2, q.x, q.y, rad);
  shade.addColorStop(0, "#fff");
  shade.addColorStop(0.45, b.color);
  shade.addColorStop(1, "#120c08");
  ctx.fillStyle = shade;
  ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 7); ctx.fill();

  if (b.ring) {
    ctx.beginPath();
    ctx.ellipse(q.x, q.y, rad * 2.1, rad * 0.62, -0.5, 0, 7);
    ctx.strokeStyle = "rgba(230,215,170,.8)";
    ctx.lineWidth = Math.max(1, rad * 0.28);
    ctx.stroke();
  }
  labelAt(q, rad, b, d);
}

let labelBudget = 0;
const shown = new Set();
export function resetLabels() { labelBudget = 8; shown.clear(); }

function labelAt(q, rad, b, d) {
  if (!state.show.labels || rad < 5 * d || q.z > cam.dist * 6 || labelBudget <= 0) return;
  if (shown.has(b.id)) return;
  shown.add(b.id);
  labelBudget--;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.font = `${Math.round(11 * d)}px Segoe UI, sans-serif`;
  ctx.fillText(text.planets[b.id] || b.name, q.x, q.y - rad - 12 * d);
  ctx.fillStyle = "rgba(255,220,170,.75)";
  ctx.font = `${Math.round(9 * d)}px Segoe UI, sans-serif`;
  ctx.fillText(text.tags[b.id] || b.tag, q.x, q.y - rad - d);
}

export { canvas as hitCanvas };
