/**
 * Pipeline Parade Planet (algoritma Bagian 6 MD).
 *
 * Strategi hemat panggilan NASA: RA/Dec + ObsEcLon geosentris diambil SEKALI per
 * planet untuk selubung UTC hari D (Δt kasar 30 menit), lalu konversi ke Alt/Az
 * dihitung LOKAL untuk tiap titik grid & lokasi user. Hanya kandidat teratas yang
 * diverifikasi ulang topocentric via Horizons #4 (best-effort).
 *
 * Konsisten dengan modul lain: bila Horizons tak tersedia, hasil ditandai (mock)
 * lewat dataSource — tidak memakai posisi palsu sebagai data valid.
 */
import { DateTime } from 'luxon';
import { getTimezone } from '../sunset';
import { ALL_POINTS } from '../khgtPipeline';
import {
  PARADE_PLANET_IDS, OPTICAL_CLASS,
  type ParadeCriteria, type ParadePlanetId, type PlanetVisibility,
  type ParadeInstant, type ParadeLocationResult, type ParadeResult,
  DEFAULT_CRITERIA,
} from './types';
import {
  HORIZONS_COMMAND, fetchGeoRaDec, fetchObsEcLon, fetchTopoAzEl,
  type RaDecSample, type EcLonSample,
} from './horizonsPlanets';
import { altAzFromRaDec, elongationDeg, eclipticSpanDeg, classifyPlanet } from './visibility';
import { compareParadeInstant } from './score';

const HOUR = 3600_000;
const MIN = 60_000;

/* ── Interpolasi ─────────────────────────────────────────────────────────── */

function bisect(xs: number[], x: number): number {
  // index i sehingga xs[i] <= x < xs[i+1]; clamp ke tepi
  let lo = 0, hi = xs.length - 1;
  if (x <= xs[0]) return 0;
  if (x >= xs[hi]) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  return lo;
}

function lerp(a: number, b: number, f: number): number { return a + (b - a) * f; }

/** Interpolasi sudut (derajat) dengan unwrap agar tak melompat di 0/360. */
function lerpAngle(a: number, b: number, f: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  let r = a + d * f;
  r %= 360; if (r < 0) r += 360;
  return r;
}

interface BodyTrack {
  ms: number[];
  ra: number[];
  dec: number[];
  ecLon?: number[];
}

function buildTrack(raDec: RaDecSample[], ecLon?: EcLonSample[]): BodyTrack {
  const sorted = [...raDec].sort((a, b) => a.epochMs - b.epochMs);
  const track: BodyTrack = {
    ms: sorted.map((s) => s.epochMs),
    ra: sorted.map((s) => s.ra),
    dec: sorted.map((s) => s.dec),
  };
  if (ecLon && ecLon.length) {
    const es = [...ecLon].sort((a, b) => a.epochMs - b.epochMs);
    // sejajarkan ecLon ke grid ms yang sama via interpolasi mandiri saat query
    track.ecLon = track.ms.map((m) => {
      const i = bisect(es.map((e) => e.epochMs), m);
      const f = (m - es[i].epochMs) / ((es[i + 1]?.epochMs ?? es[i].epochMs + 1) - es[i].epochMs);
      return lerpAngle(es[i].ecLon, es[i + 1]?.ecLon ?? es[i].ecLon, Math.max(0, Math.min(1, f)));
    });
  }
  return track;
}

function raAt(t: BodyTrack, ms: number): number {
  const i = bisect(t.ms, ms);
  const f = (ms - t.ms[i]) / (t.ms[i + 1] - t.ms[i]);
  return lerpAngle(t.ra[i], t.ra[i + 1] ?? t.ra[i], Math.max(0, Math.min(1, f)));
}
function decAt(t: BodyTrack, ms: number): number {
  const i = bisect(t.ms, ms);
  const f = (ms - t.ms[i]) / (t.ms[i + 1] - t.ms[i]);
  return lerp(t.dec[i], t.dec[i + 1] ?? t.dec[i], Math.max(0, Math.min(1, f)));
}
function ecLonAt(t: BodyTrack, ms: number): number {
  if (!t.ecLon) return NaN;
  const i = bisect(t.ms, ms);
  const f = (ms - t.ms[i]) / (t.ms[i + 1] - t.ms[i]);
  return lerpAngle(t.ecLon[i], t.ecLon[i + 1] ?? t.ecLon[i], Math.max(0, Math.min(1, f)));
}

/* ── Evaluasi satu instan (Bagian 6.2) ──────────────────────────────────── */

interface Tracks {
  planets: Record<ParadePlanetId, BodyTrack>;
  sun: BodyTrack;
}

function evalInstant(
  tracks: Tracks, ms: number, lat: number, lon: number, tz: string, c: ParadeCriteria
): ParadeInstant | null {
  const date = new Date(ms);
  const sunRa = raAt(tracks.sun, ms);
  const sunDec = decAt(tracks.sun, ms);
  const sunAlt = altAzFromRaDec(sunRa, sunDec, lat, lon, date).alt;
  if (sunAlt > c.sMax) return null; // langit belum gelap → bukan bagian jendela

  const planets: PlanetVisibility[] = [];
  const paradeEcLons: number[] = [];
  let nParade = 0, nNaked = 0, nAided = 0, nWellPlaced = 0, altMin = Infinity;

  for (const id of PARADE_PLANET_IDS) {
    const tr = tracks.planets[id];
    const ra = raAt(tr, ms);
    const dec = decAt(tr, ms);
    const { alt, az } = altAzFromRaDec(ra, dec, lat, lon, date);
    const elong = elongationDeg(ra, dec, sunRa, sunDec);
    const cls = OPTICAL_CLASS[id];
    const k = classifyPlanet(alt, elong, c);
    planets.push({ id, altDeg: alt, azDeg: az, elongDeg: elong, opticalClass: cls, aboveHorizon: k.aboveHorizon, wellPlaced: k.wellPlaced, nearSun: k.nearSun });
    if (k.aboveHorizon) {
      nParade++;
      if (cls === 'naked-eye') nNaked++; else nAided++;
      if (k.wellPlaced) nWellPlaced++;
      altMin = Math.min(altMin, alt);
      paradeEcLons.push(ecLonAt(tr, ms));
    }
  }

  const spanDeg = paradeEcLons.length >= 2 ? eclipticSpanDeg(paradeEcLons.filter((x) => !Number.isNaN(x))) : 0;
  return {
    epochMsUTC: ms,
    localTimeISO: DateTime.fromMillis(ms, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    sunAltDeg: sunAlt,
    planets,
    nParade,
    nNaked,
    nAided,
    nWellPlaced,
    altMinDeg: nParade > 0 ? altMin : 0,
    darknessDeg: Math.min(18, -sunAlt),
    spanDeg,
  };
}

/* ── Scan satu lokasi sepanjang hari sipil lokal D (Bagian 6.1–6.3) ─────── */

function scanLocation(
  tracks: Tracks, dateD: string, lat: number, lon: number, name: string, c: ParadeCriteria
): ParadeLocationResult | null {
  let tz: string;
  try { tz = getTimezone(lat, lon); } catch { return null; }

  const dayStart = DateTime.fromISO(dateD, { zone: tz }).startOf('day');
  if (!dayStart.isValid) return null;
  const startMs = dayStart.toMillis();
  const endMs = dayStart.plus({ days: 1 }).toMillis();
  const dt = c.dtMinutes * MIN;

  let best: ParadeInstant | null = null;
  const summary: Array<{ ms: number; nParade: number }> = [];

  for (let ms = startMs; ms <= endMs; ms += dt) {
    const inst = evalInstant(tracks, ms, lat, lon, tz, c);
    if (!inst) continue;
    summary.push({ ms, nParade: inst.nParade });
    if (inst.nParade === 0) continue;
    if (!best || compareParadeInstant(inst, best) > 0) best = inst;
  }

  if (!best) return { name, lat, lon, tz, best: null, windowStartLocalISO: null, windowEndLocalISO: null, topoVerified: false };

  // Refine 1 detik LOKAL di sekitar optimum coarse (Bagian 6.3A)
  const bracketLo = best.epochMsUTC - dt;
  const bracketHi = best.epochMsUTC + dt;
  for (let ms = bracketLo; ms <= bracketHi; ms += 1000) {
    const inst = evalInstant(tracks, ms, lat, lon, tz, c);
    if (inst && inst.nParade > 0 && compareParadeInstant(inst, best) > 0) best = inst;
  }

  // Window = rentang waktu lokal dengan jumlah peserta parade = jumlah terbaik
  const matching = summary.filter((s) => s.nParade === best!.nParade);
  const wStart = matching.length ? Math.min(...matching.map((s) => s.ms)) : best.epochMsUTC;
  const wEnd = matching.length ? Math.max(...matching.map((s) => s.ms)) : best.epochMsUTC;

  return {
    name, lat, lon, tz,
    best,
    windowStartLocalISO: DateTime.fromMillis(wStart, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    windowEndLocalISO: DateTime.fromMillis(wEnd, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    topoVerified: false,
  };
}

/* ── Verifikasi topocentric kandidat teratas (Bagian 6.6, best-effort) ──── */

function angSepAzEl(az1: number, el1: number, az2: number, el2: number): number {
  const d = Math.PI / 180;
  const x1 = Math.cos(el1 * d) * Math.cos(az1 * d), y1 = Math.cos(el1 * d) * Math.sin(az1 * d), z1 = Math.sin(el1 * d);
  const x2 = Math.cos(el2 * d) * Math.cos(az2 * d), y2 = Math.cos(el2 * d) * Math.sin(az2 * d), z2 = Math.sin(el2 * d);
  return (Math.acos(Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2))) * 180) / Math.PI;
}

async function verifyTopo(loc: ParadeLocationResult, c: ParadeCriteria, warnings: string[]): Promise<void> {
  if (!loc.best) return;
  try {
    const epoch = [new Date(loc.best.epochMsUTC)];
    const sunRes = await fetchTopoAzEl(HORIZONS_COMMAND.sun, epoch, loc.lat, loc.lon);
    const sun = sunRes.samples[0];
    if (!sun) { warnings.push(`Verifikasi topocentric tak lengkap untuk ${loc.name}`); return; }

    const planetRes = await Promise.all(
      PARADE_PLANET_IDS.map((id) => fetchTopoAzEl(HORIZONS_COMMAND[id], epoch, loc.lat, loc.lon))
    );

    let nParade = 0, nNaked = 0, nAided = 0, nWellPlaced = 0, altMin = Infinity;
    const planets: PlanetVisibility[] = PARADE_PLANET_IDS.map((id, i) => {
      const s = planetRes[i].samples[0];
      const prev = loc.best!.planets.find((p) => p.id === id)!;
      if (!s) return prev;
      const elong = angSepAzEl(s.az, s.el, sun.az, sun.el);
      const cls = OPTICAL_CLASS[id];
      const k = classifyPlanet(s.el, elong, c);
      if (k.aboveHorizon) {
        nParade++;
        if (cls === 'naked-eye') nNaked++; else nAided++;
        if (k.wellPlaced) nWellPlaced++;
        altMin = Math.min(altMin, s.el);
      }
      return { id, altDeg: s.el, azDeg: s.az, elongDeg: elong, opticalClass: cls, aboveHorizon: k.aboveHorizon, wellPlaced: k.wellPlaced, nearSun: k.nearSun };
    });

    loc.best.planets = planets;
    loc.best.sunAltDeg = sun.el;
    loc.best.nParade = nParade;
    loc.best.nNaked = nNaked;
    loc.best.nAided = nAided;
    loc.best.nWellPlaced = nWellPlaced;
    loc.best.altMinDeg = nParade > 0 ? altMin : 0;
    loc.best.darknessDeg = Math.min(18, -sun.el);
    loc.topoVerified = true;
  } catch {
    warnings.push(`Verifikasi topocentric gagal untuk ${loc.name} — memakai konversi lokal`);
  }
}

/* ── Orkestrasi utama ────────────────────────────────────────────────────── */

function mergeSource(sources: string[]): string {
  if (sources.some((s) => s === 'mock')) return 'mock';
  if (sources.some((s) => s === 'live')) return 'live';
  return 'cache';
}

export interface ComputeParadeOptions {
  criteria?: Partial<ParadeCriteria>;
  userLat?: number;
  userLon?: number;
  userName?: string;
  verifyTopocentric?: boolean; // default true untuk kandidat teratas
}

export async function computeParade(
  dateD: string,
  opts: ComputeParadeOptions = {}
): Promise<ParadeResult> {
  const c: ParadeCriteria = { ...DEFAULT_CRITERIA, ...(opts.criteria ?? {}) };
  const warnings: string[] = [];

  // Selubung UTC hari D lintas seluruh zona (Bagian 6.1): D−14h .. D+36h
  const [y, mo, d] = dateD.split('-').map(Number);
  const anchor = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const envStart = anchor - 14 * HOUR;
  const envEnd = anchor + 36 * HOUR;
  // Grid RA/Dec kasar 2 jam (~26 epoch): TLIST pendek (URL aman dari 502) &
  // akurat — RA/Dec geosentris berubah lambat, gerak diurnal cepat dihitung lokal
  // dari LST pada waktu tepat (bukan interpolasi altitude).
  const epochs: Date[] = [];
  for (let ms = envStart; ms <= envEnd; ms += 120 * MIN) epochs.push(new Date(ms));

  // Ambil ephemeris geosentris SEKALI per benda
  const sources: string[] = [];
  const sunRD = await fetchGeoRaDec(HORIZONS_COMMAND.sun, epochs);
  sources.push(sunRD.source);

  const planetTracks: Partial<Record<ParadePlanetId, BodyTrack>> = {};
  await Promise.all(
    PARADE_PLANET_IDS.map(async (id) => {
      const [rd, ec] = await Promise.all([
        fetchGeoRaDec(HORIZONS_COMMAND[id], epochs),
        fetchObsEcLon(HORIZONS_COMMAND[id], epochs),
      ]);
      sources.push(rd.source, ec.source);
      planetTracks[id] = buildTrack(rd.samples, ec.samples);
    })
  );

  const tracks: Tracks = {
    planets: planetTracks as Record<ParadePlanetId, BodyTrack>,
    sun: buildTrack(sunRD.samples),
  };

  // Pindaian grid global (Bagian 6.4)
  let globalBest: ParadeLocationResult | null = null;
  for (const pt of ALL_POINTS) {
    const res = scanLocation(tracks, dateD, pt.lat, pt.lon, pt.name, c);
    if (!res || !res.best) continue;
    if (!globalBest || !globalBest.best || compareParadeInstant(res.best, globalBest.best) > 0) {
      globalBest = res;
    }
  }

  // Lokasi user (Bagian 6.5)
  let userLocation: ParadeLocationResult | null = null;
  if (opts.userLat !== undefined && opts.userLon !== undefined) {
    userLocation = scanLocation(tracks, dateD, opts.userLat, opts.userLon, opts.userName ?? 'Lokasi Anda', c);
  }

  // Verifikasi topocentric kandidat teratas (best-effort)
  const dataSource = mergeSource(sources);
  if (opts.verifyTopocentric !== false && dataSource !== 'mock') {
    if (globalBest?.best) await verifyTopo(globalBest, c, warnings);
    if (userLocation?.best) await verifyTopo(userLocation, c, warnings);
  }

  const meetsNMin = !!globalBest?.best && globalBest.best.nParade >= c.nMin;
  const meetsNMinNaked = !!globalBest?.best && globalBest.best.nNaked >= c.nMin;

  return {
    dateD,
    criteria: c,
    meetsNMin,
    meetsNMinNaked,
    globalBest,
    userLocation,
    dataSource,
    warnings,
  };
}
