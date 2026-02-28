/**
 * NASA/JPL HORIZONS API client with live + mock fallback, caching, rate limiting.
 */
import fs from 'fs';
import path from 'path';

const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const USER_AGENT = 'IslamicAstronomicalStudies/1.0 (academic research)';
const MAX_CONCURRENCY = 4;

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

export function isLiveMode(): boolean {
  return (process.env.HORIZONS_MODE || 'live') !== 'mock';
}

export interface HorizonsResponse {
  result: string;
  error?: string;
  source: 'live' | 'mock' | 'cache';
}

/**
 * Query HORIZONS API. Returns result string.
 */
export async function queryHorizons(
  params: Record<string, string>
): Promise<HorizonsResponse> {
  const key = cacheKey(params);

  // Check cache first
  const cached = getFromCache(key);
  if (cached) {
    return { result: cached, source: 'cache' };
  }

  // If mock mode, try mock files
  if (!isLiveMode()) {
    return queryMock(params, key);
  }

  // Live mode
  try {
    await acquireSemaphore();
    const url = new URL(HORIZONS_URL);
    url.searchParams.set('format', 'json');
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      throw new Error(`HORIZONS HTTP ${resp.status}`);
    }

    const json = await resp.json();
    if (json.error) {
      throw new Error(`HORIZONS API error: ${json.error}`);
    }

    const resultStr = json.result as string;
    setCache(key, resultStr);
    return { result: resultStr, source: 'live' };
  } catch (err) {
    console.warn('HORIZONS live failed, falling back to mock:', (err as Error).message);
    return queryMock(params, key);
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
  const tlist = (params['TLIST'] || '').replace(/'/g, '');

  // Build mock filename pattern
  const bodyName = command.includes('10') ? 'sun' : command.includes('301') ? 'moon' : 'unknown';
  const isGeocentric = center.includes('500@399');
  const centerType = isGeocentric ? 'geo' : 'topo';
  const qType = quantities.includes('31') ? 'eclon' : quantities.includes('4') ? 'azel' : 'other';

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
  const lines: string[] = [];
  lines.push('$$SOE');

  // mockData has entries keyed by approximate JD or by special keys
  const entries = (mockData.entries || []) as Array<{
    jd?: number;
    epoch?: number;
    values: number[];
  }>;

  for (const epochStr of epochs) {
    const jd = parseFloat(epochStr);
    // Linear interpolation between two closest entries
    const sorted = entries.slice().sort((a, b) => ((a.jd || a.epoch || 0) - (b.jd || b.epoch || 0)));
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

  for (const epochStr of epochs) {
    const jd = parseFloat(epochStr);
    if (qType === 'eclon') {
      // Approximate ecliptic longitude: for demo
      const dayFrac = (jd - 2451545.0) % 365.25;
      const sunEcLon = ((dayFrac / 365.25) * 360 + 280) % 360;
      const moonEcLon =
        bodyName === 'moon'
          ? ((dayFrac / 27.3217) * 360 + sunEcLon + 10) % 360
          : sunEcLon;
      lines.push(` ${jdToDateStr(jd)},  ${(bodyName === 'moon' ? moonEcLon : sunEcLon).toFixed(8)},`);
    } else if (qType === 'azel') {
      // Demo az/el
      const sunAz = 270;
      const sunEl = bodyName === 'sun' ? -0.833 : 2.5;
      const moonAz = bodyName === 'moon' ? 265 : 270;
      const moonEl = bodyName === 'moon' ? 2.5 : -0.833;
      lines.push(` ${jdToDateStr(jd)},  ${(bodyName === 'moon' ? moonAz : sunAz).toFixed(6)},  ${(bodyName === 'moon' ? moonEl : sunEl).toFixed(6)},`);
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
