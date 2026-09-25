import {
  canvas, ctx, $, state, cam, trails, view, basis, project, projectRaw, record, resetTrail,
  BODIES, MODES, KMS_PER_AU_YR, sunPos, sunSpeedVector, planetPos,
} from "./app.js";
import { drawStars, drawGalacticCentre, drawTrail, drawBody, resetLabels } from "./draw.js";
import text, { locale } from "./locale.js";
const oneDecimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const oneDecimalTrim = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

$("title-main").textContent = text.title;
$("title-sub").textContent = text.subtitle;
$("view").setAttribute("aria-label", text.canvas);
$("model-label").textContent = text.model;
$("elapsed-label").textContent = text.elapsed;
$("travelled-label").textContent = text.travelled;
$("controls-btn").textContent = text.controls;
$("controls-title").textContent = text.controls;
$("pause").setAttribute("aria-label", text.pause);
$("pause").title = text.pause;
$("close").setAttribute("aria-label", text.close);
$("scale-label").textContent = text.scale;
$("mode-label").textContent = text.mode;
$("speed-label").textContent = text.speed;
$("toggle-trails").textContent = text.trails;
$("toggle-labels").textContent = text.labels;
$("toggle-stars").textContent = text.stars;
$("toggle-gc").textContent = text.gc;
$("toggle-dir").textContent = text.direction;
$("toggle-orbits").textContent = text.orbits;
$("interaction-note").textContent = text.note;

function drawSun(B, sun) {
  const hit = projectRaw(sun.x, sun.y, sun.z, B);
  if (!hit) return;
  const q = { x: hit.x, y: hit.y, z: hit.z };
  const d = view.DPR;
  const rad = Math.max(4 * d, ((state.mode === "galaxy" ? 0.35 : 26) * d) / Math.sqrt(q.z));
  const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad * 6);
  g.addColorStop(0, "rgba(255,244,210,1)");
  g.addColorStop(0.18, "rgba(255,196,70,.9)");
  g.addColorStop(0.5, "rgba(255,140,20,.25)");
  g.addColorStop(1, "rgba(255,120,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(q.x, q.y, rad * 6, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff6d8";
  ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 7); ctx.fill();

  if (!state.show.dir || state.mode === "short") return;
  const vel = sunSpeedVector(state.years, state.v, state.mode);
  const L = Math.hypot(vel.x, vel.z) || 1;
  const reach = Math.min(cam.dist * 0.9, 60);
  const tipHit = projectRaw(
    sun.x + (vel.x / L) * reach, sun.y,
    sun.z + (vel.z / L) * reach, B);
  if (!tipHit) return;
  const tip = { x: tipHit.x, y: tipHit.y, z: tipHit.z };
  const ang = Math.atan2(tip.y - q.y, tip.x - q.x);
  ctx.beginPath();
  ctx.moveTo(q.x, q.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.lineWidth = 1.4 * d;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - Math.cos(ang - 0.4) * 10 * d, tip.y - Math.sin(ang - 0.4) * 10 * d);
  ctx.lineTo(tip.x - Math.cos(ang + 0.4) * 10 * d, tip.y - Math.sin(ang + 0.4) * 10 * d);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fill();
  if (state.show.labels && q.z < cam.dist * 8) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${Math.round(12 * d)}px Segoe UI, sans-serif`;
    ctx.fillText(text.sun, tip.x + 10 * d, tip.y - 30 * d);
    ctx.fillStyle = "rgba(255,220,170,.8)";
    ctx.font = `${Math.round(10 * d)}px Segoe UI, sans-serif`;
    ctx.fillText(`${state.v} km/s ${text.throughGalaxy}`, tip.x + 10 * d, tip.y - 16 * d);
  }
  if (state.show.labels) {
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.round(11 * d)}px Segoe UI, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(text.sunMotion, tip.x + 10 * d, tip.y + 16 * d);
  }
}

let prev = performance.now();
let query = null;
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (!state.paused) {
    if (!query) query = new URLSearchParams(location.search);
    const jump = query.get("year");
    state.years = jump ? Number(jump) : state.years + dt * state.scale;
    if (!jump && state.years > 1e9) state.years = 1e9;
  }
  record(state.years);

  const v = state.mode === "short" ? 0 : state.v;
  const sun = sunPos(state.years, v, state.mode);
  const want = state.follow === "sun" || state.follow === null
    ? sun
    : state.follow === "sgr"
      ? { x: 0, y: 0, z: 0 }
      : planetPos(BODIES[state.follow], state.years, v, state.follow * 0.9, state.mode);
  const k = query && query.has("year") ? 1 : 0.08;
  const galaxyWide = state.mode === "galaxy" && cam.dist > 2e6 && state.follow === null;
  const focus = galaxyWide ? { x: 0, y: 0, z: 0 } : want;
  cam.tx += (focus.x - cam.tx) * k;
  cam.ty += (focus.y - cam.ty) * k;
  cam.tz += (focus.z - cam.tz) * k;

  const B = basis();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, view.W, view.H);
  drawStars(B);
  drawGalacticCentre(B);
  resetLabels();
  ctx.lineJoin = "round";
  if (state.show.trails) {
    BODIES.forEach((b, i) => drawTrail(trails[i], B, b.color + "99", 1.1 * view.DPR));
    drawTrail(trails[2], B, "rgba(255,255,255,.8)", 1.3 * view.DPR);
  }
  BODIES.forEach((b, i) => drawBody(b, planetPos(b, state.years, v, i * 0.9, state.mode), B, v));
  drawSun(B, sun);

  const travelled = (state.v / KMS_PER_AU_YR) * (state.mode === "short" ? 0 : state.years);
  $("elapsed").textContent = oneDecimal.format(state.years) + " " + text.year;
  $("travelled").textContent = travelled < 100 ? oneDecimal.format(travelled) + " AU"
    : oneDecimal.format(travelled / 1000) + "k AU";
  $("title").classList.toggle("show", state.mode === "long" || state.mode === "galaxy");
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const scaleInput = $("scale");
function applyScale() {
  state.scale = Math.pow(10, Number(scaleInput.value));
  const s = state.scale;
  $("scale-val").textContent = (s < 10
    ? oneDecimalTrim.format(s)
    : Math.round(s).toLocaleString(locale)) + " " + text.perSecond;
}
scaleInput.addEventListener("input", applyScale);
applyScale();

$("speed").addEventListener("input", () => {
  state.v = Number($("speed").value);
  $("speed-val").textContent = state.v.toLocaleString(locale) + " km/s";
});

const modeBox = $("modes");
MODES.forEach((m) => {
  const b = document.createElement("button");
  const [label, sub] = text.modes[m.id];
  b.innerHTML = label + "<small>" + sub + "</small>";
  b.dataset.id = m.id;
  b.onclick = () => setMode(m.id);
  modeBox.appendChild(b);
});
const DIST = { short: 16, medium: 40, long: 90, galaxy: 2.6e9 };
function setMode(id) {
  state.mode = id;
  state.years = 0;
  state.follow = null;
  resetTrail();
  cam.dist = DIST[id];
  cam.pitch = id === "galaxy" ? 1.05 : 0.16;
  cam.yaw = id === "short" ? 0.4 : id === "galaxy" ? 0.35 : 0.9;
  const v = id === "short" ? 0 : state.v;
  const sun = sunPos(0, v, id);
  cam.tx = id === "galaxy" ? 0 : sun.x;
  cam.ty = 0;
  cam.tz = id === "galaxy" ? 0 : sun.z;
  [...modeBox.children].forEach((c) => c.classList.toggle("on", c.dataset.id === id));
}
setMode(new URLSearchParams(location.search).get("mode") || "long");

for (const key of Object.keys(state.show)) {
  const el = $("t-" + key);
  el.addEventListener("change", () => (state.show[key] = el.checked));
}

$("pause").onclick = () => {
  state.paused = !state.paused;
  $("pause").textContent = state.paused ? "▶" : "Ⅱ";
  $("pause").setAttribute("aria-label", state.paused ? text.resume : text.pause);
  $("pause").title = state.paused ? text.resume : text.pause;
  $("pause").classList.toggle("active", state.paused);
};
$("controls-btn").onclick = () => {
  $("sheet").hidden = !$("sheet").hidden;
  $("controls-btn").classList.toggle("active", !$("sheet").hidden);
  $("controls-btn").setAttribute("aria-expanded", String(!$("sheet").hidden));
};
$("close").onclick = () => {
  $("sheet").hidden = true;
  $("controls-btn").classList.remove("active");
  $("controls-btn").setAttribute("aria-expanded", "false");
  $("controls-btn").focus();
};

canvas.addEventListener("dblclick", (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * view.DPR, my = (e.clientY - r.top) * view.DPR;
  const B = basis();
  const v = state.mode === "short" ? 0 : state.v;
  let best = null, bestD = 34 * view.DPR;
  const consider = (id, p, reach) => {
    const q = project(p, B);
    if (!q) return;
    const dd = Math.hypot(q.x - mx, q.y - my);
    if (dd < Math.min(bestD, reach)) { bestD = dd; best = id; }
  };
  consider("sun", sunPos(state.years, v, state.mode), 40 * view.DPR);
  if (state.mode === "long" || state.mode === "galaxy") {
    consider("sgr", { x: 0, y: 0, z: 0 }, 28 * view.DPR);
  }
  BODIES.forEach((b, i) => {
    consider(i, planetPos(b, state.years, v, i * 0.9, state.mode), 30 * view.DPR);
  });
  state.follow = best === state.follow ? null : best;
  if (state.follow === "sun") cam.dist = state.mode === "galaxy" ? 80 : DIST[state.mode];
  else if (state.follow === "sgr") cam.dist = state.mode === "galaxy" ? 4e8 : 40;
  else if (state.follow !== null) cam.dist = Math.max(10, BODIES[state.follow].a * 5);
});

document.addEventListener("keydown", (e) => {
  if (e.target === canvas) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      cam.yaw += e.key === "ArrowLeft" ? -0.08 : 0.08;
      e.preventDefault();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      cam.pitch = Math.max(0.05, Math.min(1.45, cam.pitch + (e.key === "ArrowUp" ? -0.06 : 0.06)));
      e.preventDefault();
    } else if (e.key === "+" || e.key === "=") {
      cam.dist = Math.max(6, cam.dist * 0.89);
      e.preventDefault();
    } else if (e.key === "-") {
      cam.dist = Math.min(8e9, cam.dist * 1.12);
      e.preventDefault();
    }
  }
  if (e.key === "Escape" && !$("sheet").hidden) {
    $("close").click();
    return;
  }
  const target = e.target;
  const usingControl = target instanceof HTMLElement && target.closest("button, input, label");
  if (e.key === " " && !usingControl) { e.preventDefault(); $("pause").click(); }
  if (e.key.toLowerCase() === "c" && !usingControl) $("controls-btn").click();
  if (usingControl) return;
  const n = Number(e.key);
  if (n >= 1 && n <= MODES.length) setMode(MODES[n - 1].id);
});
