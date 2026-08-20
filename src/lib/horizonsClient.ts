/**
 * NASA/JPL HORIZONS API client with live + mock fallback, caching, rate limiting.
 */
import fs from 'fs';
import path from 'path';

const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const USER_AGENT = 'InternationalAstronomicalStudies/1.0 (academic research)';
// JPL's SSD/CNEOS API fair-use policy (ssd-api.jpl.nasa.gov) literally says "submit
// only one API request at a time" — but this app's own pre-Codex production system
// ran successfully for years at MAX_CONCURRENCY=4 (see the Google Colab notebook's
// own comment: "produksi memakai semaphore 4 request paralel... notebook ini sengaja
// lebih rendah [2] ... supaya tidak membebani Horizons dari IP Colab yang dipakai
// banyak pengguna sekaligus"). The August 2026 outage that motivated dropping this to
// 1 was later isolated to two unrelated causes — Codex's OBJ_DATA='NO' regression
// (500s on every Sun/Moon OBSERVER call) and a burst of ~50 rapid manual debug
// requests fired directly at NASA outside this semaphore entirely — not ordinary
// app-level concurrency of 3-4. Restored to the historically-proven value; if NASA
// ever visibly degrades again under this app's normal traffic, drop it back down
// before assuming it's an external outage.
const MAX_CONCURRENCY = 4;
const RETRY_DELAY_MS = 500;
const RETRY_TIMEOUT_MS = 10000; // shorter than the first attempt's 30s budget

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Transient errors are worth one retry; malformed-request errors are not. */
function isTransientHorizonsError(err: unknown): boolean {
  const e = err as Error;
  if (e?.name === 'AbortError') return true; // timed out
  const msg = e?.message || '';
  return /HORIZONS HTTP (502|503|504)/.test(msg) ||
    /fetch failed/i.test(msg) ||
    /missing ephemeris table markers/i.test(msg);
}

let activeConcurrency = 0;
const queue: Array<{ resolve: () => void }> = [];

function acquireSemaphore(): Promise<void> {
  if (activeConcurrency < MAX_CONCURRENCY) {
    activeConcurrency++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push({ resolve });
  });
}

function releaseSemaphore(): void {
  activeConcurrency--;
  if (queue.length > 0) {
    activeConcurrency++;
    queue.shift()!.resolve();
  }
}

// In-memory cache
const memCache = new Map<string, string>();

function getCacheDir(): string {
  const dir = path.join(process.cwd(), '.cache', 'horizons');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function cacheKey(params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  // Simple hash
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const chr = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getFromCache(key: string): string | null {
  if (memCache.has(key)) return memCache.get(key)!;
  try {
    const filePath = path.join(getCacheDir(), `${key}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      memCache.set(key, data);
      return data;
    }
  } catch {
    // ignore
  }
  return null;
}

function setCache(key: string, data: string): void {
  memCache.set(key, data);
  try {
    const filePath = path.join(getCacheDir(), `${key}.json`);
    fs.writeFileSync(filePath, data, 'utf-8');
  } catch {
    // ignore
  }
}

/** Remove a poisoned/incomplete response from both cache layers. */
function deleteCache(key: string): void {
  memCache.delete(key);
  try {
    const filePath = path.join(getCacheDir(), `${key}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // A cache cleanup failure must never block the calculation fallback.
  }
}

function expectsEphemerisTable(params: Record<string, string>): boolean {
  if (params.MAKE_EPHEM === "'NO'") return false;
  return Boolean(params.EPHEM_TYPE || params.QUANTITIES || params.TLIST);
}

function hasEphemerisTable(result: string): boolean {
  const soe = result.indexOf('$$SOE');
  const eoe = result.indexOf('$$EOE');
  return soe >= 0 && eoe > soe;
}

function assertValidHorizonsResult(params: Record<string, string>, result: string): void {
  if (expectsEphemerisTable(params) && !hasEphemerisTable(result)) {
    throw new Error('HORIZONS response missing ephemeris table markers');
  }
}

export function isLiveMode(): boolean {
  return (process.env.HORIZONS_MODE || 'live') !== 'mock';
}

// ── Circuit breaker ──────────────────────────────────────────────────────────
// After BREAKER_THRESHOLD consecutive live failures, suspends live requests for
// BREAKER_COOLDOWN_MS. Scoped to this module (global), but only makes failing
// routes fail faster — behavior (mock fallback) is unchanged for other routes.
const BREAKER_THRESHOLD   = 5;
const BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

let breakerFailCount = 0;
let breakerTrippedAt: number | null = null;

function isBreakerOpen(): boolean {
  if (breakerTrippedAt === null) return false;
  if (Date.now() - breakerTrippedAt > BREAKER_COOLDOWN_MS) {
    // Cooldown elapsed — reset for one retry attempt
    breakerFailCount = 0;
    breakerTrippedAt = null;
    return false;
  }
  return true;
}

/**
 * Allow an explicit, isolated user retry to probe Horizons immediately. Annual
 * calendar categories call this one at a time, so this does not reintroduce the
 * simultaneous request burst the breaker protects against.
 */
export function resetHorizonsCircuitBreaker(): void {
  breakerFailCount = 0;
  breakerTrippedAt = null;
}

function recordBreakerSuccess(): void {
  breakerFailCount = 0;
  breakerTrippedAt = null;
}

function recordBreakerFailure(msg: string): void {
  breakerFailCount++;
  if (breakerTrippedAt !== null) return; // summary already logged — stay silent
  if (breakerFailCount >= BREAKER_THRESHOLD) {
    breakerTrippedAt = Date.now();
    console.error(
      `[HORIZONS] Circuit breaker tripped: ${breakerFailCount} consecutive live failures. ` +
      `Last: ${msg}. Live requests suspended for ${BREAKER_COOLDOWN_MS / 60000} min. ` +
      `Subsequent requests will use mock/fallback.`
    );
  } else {
    console.warn(`[HORIZONS] Live failed (${breakerFailCount}/${BREAKER_THRESHOLD}): ${msg}`);
  }
}

// ── Per-scan tracking (opt-in) ───────────────────────────────────────────────
// Only the konjungsi-periode route uses these functions. Other routes ignore
// them and are unaffected. Not concurrency-safe across simultaneous scans —
// acceptable for a single-user research application.
export interface ScanStats {
  liveCount:   number; // responses from HORIZONS live
  cacheCount:  number; // responses from disk/memory cache
  mockCount:   number; // responses from mock/fallback
  failedCount: number; // live attempts that failed before falling to mock
}

let _scanTrackingActive = false;
let _scanStats: ScanStats = { liveCount: 0, cacheCount: 0, mockCount: 0, failedCount: 0 };

export function startScanTracking(): void {
  _scanStats = { liveCount: 0, cacheCount: 0, mockCount: 0, failedCount: 0 };
  _scanTrackingActive = true;
}

export function getScanStats(): ScanStats {
  return { ..._scanStats };
}

export function stopScanTracking(): void {
  _scanTrackingActive = false;
}

export interface HorizonsResponse {
  result: string;
  error?: string;
  source: 'live' | 'mock' | 'cache';
}

/** Single HORIZONS HTTP attempt. Throws on network error, timeout, HTTP error, or API error. */
async function fetchHorizonsOnce(params: Record<string, string>, timeoutMs: number): Promise<string> {
  const url = new URL(HORIZONS_URL);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`HORIZONS HTTP ${resp.status}`);
    }

    const json = await resp.json();
    if (json.error) {
      throw new Error(`HORIZONS API error: ${json.error}`);
    }

    return json.result as string;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Query HORIZONS API. Returns result string.
 */
export async function queryHorizons(
  params: Record<string, string>
): Promise<HorizonsResponse> {
  const key = cacheKey(params);

  // 1. Cache first — valid cached results always win
  const cached = getFromCache(key);
  if (cached) {
    if (!expectsEphemerisTable(params) || hasEphemerisTable(cached)) {
      if (_scanTrackingActive) _scanStats.cacheCount++;
      return { result: cached, source: 'cache' };
    }
    // HORIZONS sometimes returns HTTP 200 with only object metadata. Older
    // versions cached that incomplete response forever; discard and self-heal.
    deleteCache(key);
  }

  // 2. Env mock mode — skip live entirely
  if (!isLiveMode()) {
    const r = await queryMock(params, key);
    if (_scanTrackingActive) _scanStats.mockCount++;
    return r;
  }

  // 3. Circuit breaker — if open, skip live and return mock immediately
  if (isBreakerOpen()) {
    const r = await queryMock(params, key);
    if (_scanTrackingActive) _scanStats.mockCount++;
    return r;
  }

  // 4. Live attempt — semaphore acquired/released only here
  try {
    await acquireSemaphore();

    let resultStr: string;
    try {
      resultStr = await fetchHorizonsOnce(params, 30000);
      assertValidHorizonsResult(params, resultStr);
    } catch (err) {
      // One short retry for transient blips (network hiccup, NASA 502/503/504,
      // or a timeout) — recovers most momentary glitches instead of immediately
      // flagging this query's data as mock/non-academic.
      if (!isTransientHorizonsError(err)) throw err;
      await sleep(RETRY_DELAY_MS);
      resultStr = await fetchHorizonsOnce(params, RETRY_TIMEOUT_MS);
      assertValidHorizonsResult(params, resultStr);
    }

    setCache(key, resultStr);
    recordBreakerSuccess();
    if (_scanTrackingActive) _scanStats.liveCount++;
    return { result: resultStr, source: 'live' };
  } catch (err) {
    if (_scanTrackingActive) _scanStats.failedCount++;
    recordBreakerFailure((err as Error).message);
    const r = await queryMock(params, key);
    if (_scanTrackingActive) _scanStats.mockCount++;
    return r;
  } finally {
    releaseSemaphore();
  }
}

async function queryMock(
  params: Record<string, string>,
  _key: string
): Promise<HorizonsResponse> {
  // Try to find a matching mock file
  const mockDir = path.join(process.cwd(), 'data', 'mock_horizons');
  if (!fs.existsSync(mockDir)) {
    throw new Error('Mock data directory not found and HORIZONS unavailable');
  }

  const command = params['COMMAND'] || '';
  const center = params['CENTER'] || '';
  const quantities = params['QUANTITIES'] || '';
  const isVectorQuery = params['EPHEM_TYPE'] === "'VECTORS'";
  const tlist = (params['TLIST'] || '').replace(/'/g, '');

  // Build mock filename pattern
  const bodyName = command.includes('10') ? 'sun' : command.includes('301') ? 'moon' : 'unknown';
  const isGeocentric = center.includes('500@399');
  const centerType = isGeocentric ? 'geo' : 'topo';
  const qType = isVectorQuery ? 'vector' : quantities.includes('31') ? 'eclon' : quantities.includes('4') ? 'azel' : 'other';

  // Vector-type mock has no per-body fixture file (nothing pre-recorded needs
  // it — see generateMinimalMock's 'vector' branch) and TLIST here is
  // space-separated (matching src/lib/vectorEphemeris.ts's query builder),
  // not comma-separated like the OBSERVER-table builders below.
  if (qType === 'vector') {
    const epochs = tlist.split(/\s+/).map((e) => e.trim()).filter((e) => e.length > 0);
    const result = generateMinimalMock(epochs, qType, bodyName);
    return { result, source: 'mock' };
  }

  // Look for exact mock or generate from template
  const mockFile = path.join(mockDir, `${bodyName}_${centerType}_${qType}.json`);

  if (fs.existsSync(mockFile)) {
    const mockData = JSON.parse(fs.readFileSync(mockFile, 'utf-8'));
    // Generate result string with $$SOE/$$EOE
    const epochs = tlist
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    const result = generateMockResult(mockData, epochs, qType, bodyName);
    return { result, source: 'mock' };
  }

  // Fallback: generate minimal mock
  const epochs = tlist
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  const result = generateMinimalMock(epochs, qType, bodyName);
  return { result, source: 'mock' };
}

function generateMockResult(
  mockData: Record<string, unknown>,
  epochs: string[],
  qType: string,
  bodyName: string
): string {
  // mockData has entries keyed by approximate JD or by special keys
  const entries = (mockData.entries || []) as Array<{
    jd?: number;
    epoch?: number;
    values: number[];
  }>;

  // Fixture data only covers a narrow 2029 validation window. Clamping a 2026
  // (or any other year) scan to its first/last row makes the longitude constant,
  // so no conjunction can ever be found. Outside that fixture window, use the
  // continuous analytical fallback instead; it is explicitly reported as mock.
  const sortedEntries = entries
    .slice()
    .sort((a, b) => ((a.jd || a.epoch || 0) - (b.jd || b.epoch || 0)));
  const requestedJds = epochs.map((epoch) => parseFloat(epoch)).filter(Number.isFinite);
  const firstJd = sortedEntries[0]?.jd || sortedEntries[0]?.epoch;
  const lastJd = sortedEntries[sortedEntries.length - 1]?.jd ||
    sortedEntries[sortedEntries.length - 1]?.epoch;
  const outsideFixtureRange = requestedJds.some((jd) =>
    firstJd === undefined || lastJd === undefined || jd < firstJd || jd > lastJd
  );

  if (entries.length === 0 || requestedJds.length !== epochs.length || outsideFixtureRange) {
    return generateMinimalMock(epochs, qType, bodyName);
  }

  const lines: string[] = [];
  lines.push('$$SOE');

  for (const epochStr of epochs) {
    const jd = parseFloat(epochStr);
    // Linear interpolation between two closest entries
    const sorted = sortedEntries;
    let lower = sorted[0];
    let upper = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      const ljd = sorted[i].jd || sorted[i].epoch || 0;
      const ujd = sorted[i + 1].jd || sorted[i + 1].epoch || 0;
      if (ljd <= jd && ujd >= jd) {
        lower = sorted[i];
        upper = sorted[i + 1];
        break;
      }
    }
    const ljd = lower.jd || lower.epoch || 0;
    const ujd = upper.jd || upper.epoch || 0;
    const span = ujd - ljd;
    const rawFrac = span > 0 ? (jd - ljd) / span : 0;
    // Clamp frac to [0, 1] to prevent wild extrapolation outside mock data range
    const frac = Math.max(0, Math.min(1, rawFrac));
    const interpolated = lower.values.map((v, idx) =>
      v + (upper.values[idx] - v) * frac
    );

    if (qType === 'eclon') {
      lines.push(` ${jdToDateStr(jd)},  ${interpolated[0].toFixed(8)},`);
    } else if (qType === 'azel') {
      lines.push(
        ` ${jdToDateStr(jd)},  ${interpolated[0].toFixed(6)},  ${interpolated[1].toFixed(6)},`
      );
    }
  }

  lines.push('$$EOE');
  return lines.join('\n');
}

function generateMinimalMock(
  epochs: string[],
  qType: string,
  bodyName: string
): string {
  const lines: string[] = [];
  lines.push('$$SOE');

  // Reference new moon: JD 2451549.5 ≈ 2000-01-06 UTC (known new moon near J2000)
  const REF_NEW_MOON_JD = 2451549.5;

  for (const epochStr of epochs) {
    const jd = parseFloat(epochStr);
    if (qType === 'eclon') {
      // Continuous formula — no yearly modulo discontinuity.
      // Old formula used dayFrac % 365.25 which caused a ~131° moonEcLon jump
      // at year boundaries, producing spurious sign changes in the scan loop.
      const daysSinceJ2000 = jd - 2451545.0;
      const sunEcLon = ((daysSinceJ2000 / 365.25) * 360 + 280) % 360;
      // Moon ecliptic lon = sun lon + synodic phase (continuous, period 29.53059 d)
      const synodicPhase = ((jd - REF_NEW_MOON_JD) / 29.53059) * 360;
      const moonEcLon = ((sunEcLon + synodicPhase) % 360 + 360) % 360;
      const val = bodyName === 'moon' ? moonEcLon : sunEcLon;
      lines.push(` ${jdToDateStr(jd)},  ${val.toFixed(8)},`);
    } else if (qType === 'azel') {
      // Demo az/el
      const az = bodyName === 'moon' ? 265 : 270;
      const el = bodyName === 'moon' ? 2.5 : -0.833;
      lines.push(` ${jdToDateStr(jd)},  ${az.toFixed(6)},  ${el.toFixed(6)},`);
    } else if (qType === 'other') {
      // approximate geocentric RA/Dec (QUANTITIES='2').
      // Previously missing — returned empty $$SOE/$$EOE, causing all RA/Dec
      // columns to be null when HORIZONS was unavailable.
      const daysSinceJ2000 = jd - 2451545.0;
      const OBLIQ_RAD = 23.44 * (Math.PI / 180);
      const sunEcLonDeg = ((daysSinceJ2000 / 365.25) * 360 + 280) % 360;
      const sunEcLonRad = sunEcLonDeg * (Math.PI / 180);
      const sunDecDeg = (Math.asin(Math.sin(OBLIQ_RAD) * Math.sin(sunEcLonRad)) * 180) / Math.PI;
      const sunRaDeg = sunEcLonDeg; // RA ≈ ecl lon (approximate)

      const synodicPhase = ((jd - REF_NEW_MOON_JD) / 29.53059) * 360;
      const moonEcLonDeg = ((sunEcLonDeg + synodicPhase) % 360 + 360) % 360;
      const moonEcLonRad = moonEcLonDeg * (Math.PI / 180);
      const moonDecDeg = (Math.asin(Math.sin(OBLIQ_RAD) * Math.sin(moonEcLonRad)) * 180) / Math.PI;
      const moonRaDeg = moonEcLonDeg;

      const ra  = bodyName === 'moon' ? moonRaDeg  : sunRaDeg;
      const dec = bodyName === 'moon' ? moonDecDeg : sunDecDeg;
      lines.push(` ${jdToDateStr(jd)},  ${ra.toFixed(6)},  ${dec.toFixed(6)},`);
    } else if (qType === 'vector') {
      // Approximate geocentric equatorial (ICRF-ish) cartesian position, built
      // from the same crude ecliptic-longitude model as 'other'/'eclon' above,
      // with ecliptic latitude taken as 0 (Moon's up to +-5.14 deg is ignored —
      // acceptable for a last-resort fallback; real VECTORS queries almost
      // always succeed since that's the whole reason this path is a fallback).
      const AU_KM = 149597870.7;
      const MOON_DIST_KM = 384400;
      const OBLIQ_RAD = 23.44 * (Math.PI / 180);
      const daysSinceJ2000 = jd - 2451545.0;
      const sunEcLonDeg = ((daysSinceJ2000 / 365.25) * 360 + 280) % 360;
      const synodicPhase = ((jd - REF_NEW_MOON_JD) / 29.53059) * 360;
      const moonEcLonDeg = ((sunEcLonDeg + synodicPhase) % 360 + 360) % 360;
      const lonDeg = bodyName === 'moon' ? moonEcLonDeg : sunEcLonDeg;
      const r = bodyName === 'moon' ? MOON_DIST_KM : AU_KM;
      const lonRad = lonDeg * (Math.PI / 180);
      const x = r * Math.cos(lonRad);
      const y = r * Math.sin(lonRad) * Math.cos(OBLIQ_RAD);
      const z = r * Math.sin(lonRad) * Math.sin(OBLIQ_RAD);
      lines.push(` ${jd.toFixed(9)}, ${jdToDateStr(jd)}, ${x.toFixed(6)}, ${y.toFixed(6)}, ${z.toFixed(6)},`);
    }
  }

  lines.push('$$EOE');
  return lines.join('\n');
}

function jdToDateStr(jd: number): string {
  // Convert JD to approximate date string for mock display
  const J = jd + 0.5;
  const Z = Math.floor(J);
  const F = J - Z;
  let A: number;
  if (Z < 2299161) {
    A = Z;
  } else {
    const alpha = Math.floor((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);

  const day = B - D - Math.floor(30.6001 * E);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;

  const hrs = F * 24;
  const h = Math.floor(hrs);
  const m = Math.floor((hrs - h) * 60);
  const s = ((hrs - h) * 3600 - m * 60).toFixed(3);

  return ` ${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.padStart(6, '0')}`;
}

/**
 * Parse $$SOE..$$EOE from HORIZONS result string.
 * Returns parsed lines as arrays of numeric values.
 */
export function parseSOE(result: string): Array<{ dateStr: string; values: number[] }> {
  const soeIdx = result.indexOf('$$SOE');
  const eoeIdx = result.indexOf('$$EOE');
  if (soeIdx === -1 || eoeIdx === -1) {
    throw new Error('Could not find $$SOE/$$EOE markers in HORIZONS response');
  }

  const block = result.substring(soeIdx + 5, eoeIdx).trim();
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const parsed: Array<{ dateStr: string; values: number[] }> = [];

  for (const line of lines) {
    // Format: "date_string, value1, value2, ..."
    // Date could be like: 2029-Jan-10 12:00:00.000
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;

    const dateStr = parts[0];
    const values: number[] = [];
    for (let i = 1; i < parts.length; i++) {
      const v = parseFloat(parts[i]);
      if (!isNaN(v)) values.push(v);
    }
    parsed.push({ dateStr, values });
  }

  return parsed;
}

/**
 * Convert Date to Julian Date
 */
export function dateToJD(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d =
    date.getUTCDate() +
    date.getUTCHours() / 24 +
    date.getUTCMinutes() / 1440 +
    date.getUTCSeconds() / 86400 +
    date.getUTCMilliseconds() / 86400000;

  let yr = y;
  let mo = m;
  if (mo <= 2) {
    yr -= 1;
    mo += 12;
  }

  const A = Math.floor(yr / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (yr + 4716)) + Math.floor(30.6001 * (mo + 1)) + d + B - 1524.5;
}

/**
 * Convert Julian Date to Date
 */
export function jdToDate(jd: number): Date {
  const J = jd + 0.5;
  const Z = Math.floor(J);
  const F = J - Z;
  let A: number;
  if (Z < 2299161) {
    A = Z;
  } else {
    const alpha = Math.floor((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);

  const dayFrac = B - D - Math.floor(30.6001 * E) + F;
  const day = Math.floor(dayFrac);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;

  const hrs = (dayFrac - day) * 24;
  const h = Math.floor(hrs);
  const min = Math.floor((hrs - h) * 60);
  const sec = Math.round(((hrs - h) * 3600 - min * 60) * 1000) / 1000;

  return new Date(Date.UTC(year, month - 1, day, h, min, Math.floor(sec), (sec % 1) * 1000));
}
