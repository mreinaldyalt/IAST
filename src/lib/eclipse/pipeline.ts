import {
  ECLIPSE_CONSTANTS,
  add,
  angleRad,
  circleOverlapFraction,
  horizontalCoordinates,
  inertialPointToLatLon,
  lunarShadowState,
  norm,
  scale,
  solarShadowState,
  sub,
  topocentricVector,
  unit,
} from './geometry';
import { fetchSunMoonVectors } from './horizonsVectors';
import type { EclipseContact, EclipseKind, EclipseResult, HorizonsSource, HorizonsVector, Vec3 } from './types';

const DAY_MS = 86400000;
const MINUTE_MS = 60000;
const SYNODIC_MONTH_DAYS = 29.530588853;
const MEAN_NEW_MOON_EPOCH_MS = Date.parse('2000-01-06T18:14:00.000Z');
const COARSE_STEP_MINUTES = 180;
const DETAIL_STEP_MINUTES = 5;
const DETAIL_HALF_WINDOW_HOURS = 8;

interface PairRow {
  date: Date;
  sun: HorizonsVector;
  moon: HorizonsVector;
}

interface ObserverOptions {
  latitude: number;
  longitude: number;
  altitudeKm?: number;
}

export interface EclipseCatalogEvent {
  kind: EclipseKind;
  eclipseType: string;
  eclipseTypeLabel: string;
  greatestEclipseUTC: string;
  source: HorizonsSource;
}

interface LocalSolarState {
  separationRad: number;
  sunRadiusRad: number;
  moonRadiusRad: number;
  outerMetricRad: number;
  innerMetricRad: number;
  magnitude: number;
  obscuration: number;
  altitudeDeg: number;
  azimuthDeg: number;
}

function pairRows(epochs: Date[], sun: HorizonsVector[], moon: HorizonsVector[]): PairRow[] {
  if (sun.length !== epochs.length || moon.length !== epochs.length) throw new Error('Data vector Matahari/Bulan tidak lengkap.');
  return epochs.map((date, index) => ({ date, sun: sun[index], moon: moon[index] }));
}

function phaseSeeds(kind: EclipseKind, start: Date, end: Date): Date[] {
  const phaseOffsetDays = kind === 'solar' ? 0 : SYNODIC_MONTH_DAYS / 2;
  const base = MEAN_NEW_MOON_EPOCH_MS + phaseOffsetDays * DAY_MS;
  const firstIndex = Math.floor((start.getTime() - base) / (SYNODIC_MONTH_DAYS * DAY_MS)) - 1;
  const lastIndex = Math.ceil((end.getTime() - base) / (SYNODIC_MONTH_DAYS * DAY_MS)) + 1;
  const seeds: Date[] = [];
  for (let k = firstIndex; k <= lastIndex; k++) {
    const date = new Date(base + k * SYNODIC_MONTH_DAYS * DAY_MS);
    if (date.getTime() >= start.getTime() - 2 * DAY_MS && date.getTime() <= end.getTime() + 2 * DAY_MS) seeds.push(date);
  }
  return seeds;
}

function timeGrid(center: Date, halfWindowHours: number, stepMinutes: number): Date[] {
  const rows: Date[] = [];
  const start = center.getTime() - halfWindowHours * 60 * MINUTE_MS;
  const end = center.getTime() + halfWindowHours * 60 * MINUTE_MS;
  for (let ms = start; ms <= end; ms += stepMinutes * MINUTE_MS) rows.push(new Date(ms));
  return rows;
}

function metric(kind: EclipseKind, row: PairRow): number {
  const s = row.sun.positionKm;
  const m = row.moon.positionKm;
  return kind === 'solar' ? solarShadowState(s, m).partialMetricKm : lunarShadowState(s, m).penumbralMetricKm;
}

function minIndex(values: number[]): number {
  let best = 0;
  for (let index = 1; index < values.length; index++) if (values[index] < values[best]) best = index;
  return best;
}

function parabolicMinimumTime(rows: PairRow[], values: number[], index: number): Date {
  if (index <= 0 || index >= values.length - 1) return rows[index].date;
  const denominator = values[index - 1] - 2 * values[index] + values[index + 1];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) return rows[index].date;
  const offset = Math.max(-1, Math.min(1, 0.5 * (values[index - 1] - values[index + 1]) / denominator));
  const stepMs = rows[index + 1].date.getTime() - rows[index].date.getTime();
  return new Date(rows[index].date.getTime() + offset * stepMs);
}

function crossingTimes(dates: Date[], values: number[]): [Date, Date] | null {
  const crossings: Date[] = [];
  for (let index = 0; index < values.length - 1; index++) {
    const a = values[index];
    const b = values[index + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if ((a > 0 && b <= 0) || (a <= 0 && b > 0)) {
      const fraction = a === b ? 0.5 : a / (a - b);
      crossings.push(new Date(dates[index].getTime() + fraction * (dates[index + 1].getTime() - dates[index].getTime())));
    }
  }
  return crossings.length >= 2 ? [crossings[0], crossings[crossings.length - 1]] : null;
}

function durationMinutes(pair: [Date, Date] | null): number | null {
  return pair ? (pair[1].getTime() - pair[0].getTime()) / MINUTE_MS : null;
}

function contact(code: string, label: string, date: Date, coordinates?: { altitudeDeg: number; azimuthDeg: number }): EclipseContact {
  return {
    code,
    label,
    timeUTC: date.toISOString(),
    ...(coordinates ? { altitudeDeg: coordinates.altitudeDeg, azimuthDeg: coordinates.azimuthDeg } : {}),
  };
}

function lerpVec(a: Vec3, b: Vec3, fraction: number): Vec3 {
  return add(a, scale(sub(b, a), fraction));
}

function interpolatePositions(rows: PairRow[], date: Date): { sun: Vec3; moon: Vec3 } {
  const ms = date.getTime();
  if (ms <= rows[0].date.getTime()) return { sun: rows[0].sun.positionKm, moon: rows[0].moon.positionKm };
  for (let index = 0; index < rows.length - 1; index++) {
    const left = rows[index].date.getTime();
    const right = rows[index + 1].date.getTime();
    if (ms >= left && ms <= right) {
      const f = (ms - left) / (right - left);
      return {
        sun: lerpVec(rows[index].sun.positionKm, rows[index + 1].sun.positionKm, f),
        moon: lerpVec(rows[index].moon.positionKm, rows[index + 1].moon.positionKm, f),
      };
    }
  }
  const last = rows[rows.length - 1];
  return { sun: last.sun.positionKm, moon: last.moon.positionKm };
}

function solarObserverState(date: Date, sun: Vec3, moon: Vec3, observer: ObserverOptions): LocalSolarState {
  const altitudeKm = observer.altitudeKm ?? 0;
  const topoSun = topocentricVector(sun, date, observer.latitude, observer.longitude, altitudeKm);
  const topoMoon = topocentricVector(moon, date, observer.latitude, observer.longitude, altitudeKm);
  const separationRad = angleRad(topoSun, topoMoon);
  const sunRadiusRad = Math.asin(ECLIPSE_CONSTANTS.sunRadiusKm / norm(topoSun));
  const moonRadiusRad = Math.asin(ECLIPSE_CONSTANTS.moonRadiusKm / norm(topoMoon));
  const horizontal = horizontalCoordinates(topoSun, date, observer.latitude, observer.longitude);
  return {
    separationRad,
    sunRadiusRad,
    moonRadiusRad,
    outerMetricRad: separationRad - (sunRadiusRad + moonRadiusRad),
    innerMetricRad: separationRad - Math.abs(sunRadiusRad - moonRadiusRad),
    magnitude: Math.max(0, (sunRadiusRad + moonRadiusRad - separationRad) / (2 * sunRadiusRad)),
    obscuration: circleOverlapFraction(sunRadiusRad, moonRadiusRad, separationRad),
    altitudeDeg: horizontal.altitudeDeg,
    azimuthDeg: horizontal.azimuthDeg,
  };
}

function solarSurfacePoint(sun: Vec3, moon: Vec3): Vec3 {
  const state = solarShadowState(sun, moon);
  const radius = ECLIPSE_CONSTANTS.earthEquatorialRadiusKm;
  if (state.axisDistanceKm < radius) {
    const direction = unit(sub(moon, sun));
    const rootOffset = Math.sqrt(Math.max(0, radius * radius - state.axisDistanceKm * state.axisDistanceKm));
    return add(moon, scale(direction, state.axisTravelKm - rootOffset));
  }
  if (state.axisDistanceKm > 1e-6) return scale(unit(state.axisPointKm), radius);
  return scale(unit(moon), radius);
}

function sourceFromRows(...groups: HorizonsVector[][]): HorizonsSource {
  return groups.some((group) => group.some((row) => row.source === 'live')) ? 'live' : 'cache';
}

function classifySolar(state: ReturnType<typeof solarShadowState>): { id: string; label: string } {
  if (state.centralMetricKm > 0) return { id: 'partial', label: 'Gerhana Matahari Sebagian' };
  const c = ECLIPSE_CONSTANTS;
  const coneSlope = (c.moonRadiusKm - state.umbraRadiusKm) / Math.max(1, state.axisTravelKm);
  const nearUmbra = state.umbraRadiusKm + c.earthEquatorialRadiusKm * coneSlope;
  const farUmbra = state.umbraRadiusKm - c.earthEquatorialRadiusKm * coneSlope;
  if (nearUmbra * farUmbra < 0) return { id: 'hybrid', label: 'Gerhana Matahari Hibrida' };
  return state.umbraRadiusKm >= 0
    ? { id: 'total', label: 'Gerhana Matahari Total' }
    : { id: 'annular', label: 'Gerhana Matahari Cincin' };
}

/**
 * Lightweight yearly catalog for the calendar. It evaluates every new/full-moon
 * candidate from NASA/JPL Horizons vectors in one coarse pass, without running
 * the much heavier contact/observer calculation used by the Eclipse Lab.
 */
export async function findEclipseCatalog(start: Date, end: Date): Promise<EclipseCatalogEvent[]> {
  const catalog: EclipseCatalogEvent[] = [];
  for (const kind of ['solar', 'lunar'] as EclipseKind[]) {
    const seeds = phaseSeeds(kind, start, end);
    const epochs = seeds.flatMap((seed) => timeGrid(seed, 18, COARSE_STEP_MINUTES));
    const vectors = await fetchSunMoonVectors(epochs);
    const rows = pairRows(epochs, vectors.sun, vectors.moon);
    const rowsPerSeed = timeGrid(seeds[0] ?? start, 18, COARSE_STEP_MINUTES).length;
    for (let index = 0; index < seeds.length; index++) {
      const candidateRows = rows.slice(index * rowsPerSeed, (index + 1) * rowsPerSeed);
      if (candidateRows.length === 0) continue;
      const values = candidateRows.map((row) => metric(kind, row));
      const best = minIndex(values);
      if (!Number.isFinite(values[best]) || values[best] >= 0) continue;
      const greatest = parabolicMinimumTime(candidateRows, values, best);
      if (greatest < start || greatest >= end) continue;
      const state = kind === 'solar'
        ? solarShadowState(candidateRows[best].sun.positionKm, candidateRows[best].moon.positionKm)
        : lunarShadowState(candidateRows[best].sun.positionKm, candidateRows[best].moon.positionKm);
      const classified = kind === 'solar'
        ? classifySolar(state as ReturnType<typeof solarShadowState>)
        : (state as ReturnType<typeof lunarShadowState>).totalMetricKm <= 0
          ? { id: 'total', label: 'Gerhana Bulan Total' }
          : (state as ReturnType<typeof lunarShadowState>).umbralMetricKm <= 0
            ? { id: 'partial', label: 'Gerhana Bulan Sebagian' }
            : { id: 'penumbral', label: 'Gerhana Bulan Penumbra' };
      catalog.push({
        kind,
        eclipseType: classified.id,
        eclipseTypeLabel: classified.label,
        greatestEclipseUTC: greatest.toISOString(),
        source: sourceFromRows(vectors.sun, vectors.moon),
      });
    }
  }
  return catalog.sort((a, b) => a.greatestEclipseUTC.localeCompare(b.greatestEclipseUTC));
}

function classifyLocalSolar(state: LocalSolarState): { id: string; label: string } {
  if (state.outerMetricRad > 0) return { id: 'not-visible', label: 'Tidak Melintasi Lokasi' };
  if (state.innerMetricRad <= 0) {
    return state.moonRadiusRad >= state.sunRadiusRad
      ? { id: 'total', label: 'Total di Lokasi' }
      : { id: 'annular', label: 'Cincin di Lokasi' };
  }
  return { id: 'partial', label: 'Sebagian di Lokasi' };
}

async function findCoarseEvent(kind: EclipseKind, start: Date, end: Date): Promise<{ center: Date; candidates: number; sun: HorizonsVector[]; moon: HorizonsVector[] }> {
  const seeds = phaseSeeds(kind, start, end);
  const offsetsPerSeed = 13;
  const epochs = seeds.flatMap((seed) => timeGrid(seed, 18, COARSE_STEP_MINUTES));
  const vectors = await fetchSunMoonVectors(epochs);
  const rows = pairRows(epochs, vectors.sun, vectors.moon);

  for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
    const candidateRows = rows.slice(seedIndex * offsetsPerSeed, (seedIndex + 1) * offsetsPerSeed);
    const values = candidateRows.map((row) => metric(kind, row));
    const best = minIndex(values);
    const stateValid = kind === 'solar'
      ? solarShadowState(candidateRows[best].sun.positionKm, candidateRows[best].moon.positionKm).valid
      : lunarShadowState(candidateRows[best].sun.positionKm, candidateRows[best].moon.positionKm).valid;
    const time = candidateRows[best].date.getTime();
    if (stateValid && values[best] < 0 && time >= start.getTime() && time <= end.getTime()) {
      return { center: candidateRows[best].date, candidates: seeds.length, sun: vectors.sun, moon: vectors.moon };
    }
  }
  throw new Error('Tidak ditemukan gerhana pada rentang pencarian ini. Perpanjang rentang bulan lalu coba lagi.');
}

export async function computeEclipse(
  kind: EclipseKind,
  start: Date,
  end: Date,
  observer: ObserverOptions,
): Promise<EclipseResult> {
  const coarse = await findCoarseEvent(kind, start, end);
  const detailEpochs = timeGrid(coarse.center, DETAIL_HALF_WINDOW_HOURS, DETAIL_STEP_MINUTES);
  const detailedVectors = await fetchSunMoonVectors(detailEpochs);
  const detailRows = pairRows(detailEpochs, detailedVectors.sun, detailedVectors.moon);
  const primaryMetrics = detailRows.map((row) => metric(kind, row));
  const bestIndex = minIndex(primaryMetrics);
  const estimatedGreatest = parabolicMinimumTime(detailRows, primaryMetrics, bestIndex);
  const exactVectors = await fetchSunMoonVectors([estimatedGreatest]);
  const exactSun = exactVectors.sun[0].positionKm;
  const exactMoon = exactVectors.moon[0].positionKm;
  const allSource = sourceFromRows(coarse.sun, coarse.moon, detailedVectors.sun, detailedVectors.moon, exactVectors.sun, exactVectors.moon);
  const dates = detailRows.map((row) => row.date);
  const c = ECLIPSE_CONSTANTS;

  if (kind === 'solar') {
    const exactState = solarShadowState(exactSun, exactMoon);
    const globalType = classifySolar(exactState);
    const partialPair = crossingTimes(dates, detailRows.map((row) => solarShadowState(row.sun.positionKm, row.moon.positionKm).partialMetricKm));
    const centralPair = crossingTimes(dates, detailRows.map((row) => solarShadowState(row.sun.positionKm, row.moon.positionKm).centralMetricKm));
    const contacts: EclipseContact[] = [];
    if (partialPair) contacts.push(contact('P1', 'Kontak global pertama', partialPair[0]));
    if (centralPair) contacts.push(contact('U1', 'Fase sentral dimulai', centralPair[0]));
    contacts.push(contact('MAX', 'Puncak gerhana', estimatedGreatest));
    if (centralPair) contacts.push(contact('U4', 'Fase sentral berakhir', centralPair[1]));
    if (partialPair) contacts.push(contact('P4', 'Kontak global terakhir', partialPair[1]));

    const bestPoint = solarSurfacePoint(exactSun, exactMoon);
    const bestLatLon = inertialPointToLatLon(bestPoint, estimatedGreatest);
    const bestGlobal = solarObserverState(estimatedGreatest, exactSun, exactMoon, bestLatLon);

    const localStates = detailRows.map((row) => solarObserverState(row.date, row.sun.positionKm, row.moon.positionKm, observer));
    const localIndex = minIndex(localStates.map((state) => state.outerMetricRad));
    const localBestDate = parabolicMinimumTime(detailRows, localStates.map((state) => state.separationRad), localIndex);
    const localPositions = interpolatePositions(detailRows, localBestDate);
    const localBest = solarObserverState(localBestDate, localPositions.sun, localPositions.moon, observer);
    const localType = classifyLocalSolar(localBest);
    const localOuterPair = crossingTimes(dates, localStates.map((state) => state.outerMetricRad));
    const localInnerPair = crossingTimes(dates, localStates.map((state) => state.innerMetricRad));
    const localContacts: EclipseContact[] = [];
    if (localOuterPair) localContacts.push(contact('C1', 'Gerhana lokal dimulai', localOuterPair[0]));
    if (localInnerPair && localType.id !== 'partial' && localType.id !== 'not-visible') localContacts.push(contact('C2', 'Fase sentral lokal dimulai', localInnerPair[0]));
    if (localType.id !== 'not-visible') localContacts.push(contact('MAX', 'Maksimum di lokasi', localBestDate, { altitudeDeg: localBest.altitudeDeg, azimuthDeg: localBest.azimuthDeg }));
    if (localInnerPair && localType.id !== 'partial' && localType.id !== 'not-visible') localContacts.push(contact('C3', 'Fase sentral lokal berakhir', localInnerPair[1]));
    if (localOuterPair) localContacts.push(contact('C4', 'Gerhana lokal berakhir', localOuterPair[1]));
    const localVisible = localType.id !== 'not-visible' && localBest.altitudeDeg > -0.833;

    return {
      kind,
      eclipseType: globalType.id,
      eclipseTypeLabel: globalType.label,
      greatestEclipseUTC: estimatedGreatest.toISOString(),
      searchWindow: { startUTC: start.toISOString(), endUTC: end.toISOString() },
      contacts,
      magnitude: bestGlobal.magnitude,
      obscurationPercent: bestGlobal.obscuration * 100,
      durationMinutes: durationMinutes(partialPair),
      geometry: {
        axisDistanceKm: exactState.axisDistanceKm,
        gamma: exactState.axisDistanceKm / c.earthEquatorialRadiusKm,
        sunDistanceKm: norm(exactSun),
        moonDistanceKm: norm(exactMoon),
        sunAngularRadiusDeg: Math.asin(c.sunRadiusKm / norm(exactSun)) * 180 / Math.PI,
        moonAngularRadiusDeg: Math.asin(c.moonRadiusKm / norm(exactMoon)) * 180 / Math.PI,
        umbraRadiusKm: exactState.umbraRadiusKm,
        penumbraRadiusKm: exactState.penumbraRadiusKm,
      },
      observer: {
        latitude: observer.latitude,
        longitude: observer.longitude,
        altitudeKm: observer.altitudeKm ?? 0,
        visible: localVisible,
        localType: localType.id,
        localTypeLabel: localVisible ? localType.label : 'Tidak Terlihat dari Lokasi',
        maximumAltitudeDeg: localBest.altitudeDeg,
        maximumAzimuthDeg: localBest.azimuthDeg,
        localMagnitude: localType.id === 'not-visible' ? null : localBest.magnitude,
        localObscurationPercent: localType.id === 'not-visible' ? null : localBest.obscuration * 100,
        contacts: localContacts,
      },
      centralPoint: globalType.id === 'partial' ? null : bestLatLon,
      provenance: {
        provider: 'NASA/JPL Horizons', endpoint: 'https://ssd.jpl.nasa.gov/api/horizons.api', ephemerisType: 'VECTORS',
        referenceFrame: 'ICRF', correction: 'geometric', source: allSource, sunCommand: '10', moonCommand: '301',
      },
      method: {
        candidateCount: coarse.candidates, coarseStepMinutes: COARSE_STEP_MINUTES, detailStepMinutes: DETAIL_STEP_MINUTES,
        contactInterpolation: 'Interpolasi linear di antara state vector 5 menit; puncak diperhalus secara parabola.',
        shadowModel: 'Kerucut umbra/penumbra tiga dimensi; WGS-84 untuk pengamat; pembesaran bayangan Bumi Danjon 1/85.',
        constants: { sunRadiusKm: c.sunRadiusKm, moonRadiusKm: c.moonRadiusKm, earthRadiusKm: c.earthEquatorialRadiusKm, danjon: c.danjonEnlargement },
      },
    };
  }

  const exactState = lunarShadowState(exactSun, exactMoon);
  const penMagnitude = (exactState.penumbraRadiusKm + c.moonRadiusKm - exactState.axisDistanceKm) / (2 * c.moonRadiusKm);
  const umbMagnitude = (exactState.umbraRadiusKm + c.moonRadiusKm - exactState.axisDistanceKm) / (2 * c.moonRadiusKm);
  const lunarType = exactState.totalMetricKm <= 0
    ? { id: 'total', label: 'Gerhana Bulan Total' }
    : exactState.umbralMetricKm <= 0
      ? { id: 'partial', label: 'Gerhana Bulan Sebagian' }
      : { id: 'penumbral', label: 'Gerhana Bulan Penumbra' };
  const states = detailRows.map((row) => lunarShadowState(row.sun.positionKm, row.moon.positionKm));
  const pPair = crossingTimes(dates, states.map((state) => state.penumbralMetricKm));
  const uPair = crossingTimes(dates, states.map((state) => state.umbralMetricKm));
  const totalPair = crossingTimes(dates, states.map((state) => state.totalMetricKm));
  const lunarCoords = (date: Date) => {
    const positions = interpolatePositions(detailRows, date);
    return horizontalCoordinates(topocentricVector(positions.moon, date, observer.latitude, observer.longitude, observer.altitudeKm ?? 0), date, observer.latitude, observer.longitude);
  };
  const contacts: EclipseContact[] = [];
  if (pPair) contacts.push(contact('P1', 'Penumbra dimulai', pPair[0], lunarCoords(pPair[0])));
  if (uPair) contacts.push(contact('U1', 'Gerhana sebagian dimulai', uPair[0], lunarCoords(uPair[0])));
  if (totalPair) contacts.push(contact('U2', 'Totalitas dimulai', totalPair[0], lunarCoords(totalPair[0])));
  const maxCoordinates = lunarCoords(estimatedGreatest);
  contacts.push(contact('MAX', 'Puncak gerhana', estimatedGreatest, maxCoordinates));
  if (totalPair) contacts.push(contact('U3', 'Totalitas berakhir', totalPair[1], lunarCoords(totalPair[1])));
  if (uPair) contacts.push(contact('U4', 'Gerhana sebagian berakhir', uPair[1], lunarCoords(uPair[1])));
  if (pPair) contacts.push(contact('P4', 'Penumbra berakhir', pPair[1], lunarCoords(pPair[1])));
  const visible = contacts.some((item) => (item.altitudeDeg ?? -90) > -0.5667);

  return {
    kind,
    eclipseType: lunarType.id,
    eclipseTypeLabel: lunarType.label,
    greatestEclipseUTC: estimatedGreatest.toISOString(),
    searchWindow: { startUTC: start.toISOString(), endUTC: end.toISOString() },
    contacts,
    magnitude: lunarType.id === 'penumbral' ? penMagnitude : umbMagnitude,
    obscurationPercent: null,
    durationMinutes: durationMinutes(pPair),
    geometry: {
      axisDistanceKm: exactState.axisDistanceKm,
      gamma: exactState.axisDistanceKm / c.earthEquatorialRadiusKm,
      sunDistanceKm: norm(exactSun),
      moonDistanceKm: norm(exactMoon),
      sunAngularRadiusDeg: Math.asin(c.sunRadiusKm / norm(exactSun)) * 180 / Math.PI,
      moonAngularRadiusDeg: Math.asin(c.moonRadiusKm / norm(exactMoon)) * 180 / Math.PI,
      umbraRadiusKm: exactState.umbraRadiusKm,
      penumbraRadiusKm: exactState.penumbraRadiusKm,
    },
    observer: {
      latitude: observer.latitude,
      longitude: observer.longitude,
      altitudeKm: observer.altitudeKm ?? 0,
      visible,
      localType: visible ? lunarType.id : 'not-visible',
      localTypeLabel: visible ? `${lunarType.label} terlihat` : 'Tidak Terlihat dari Lokasi',
      maximumAltitudeDeg: maxCoordinates.altitudeDeg,
      maximumAzimuthDeg: maxCoordinates.azimuthDeg,
      localMagnitude: visible ? (lunarType.id === 'penumbral' ? penMagnitude : umbMagnitude) : null,
      localObscurationPercent: null,
      contacts,
    },
    centralPoint: null,
    provenance: {
      provider: 'NASA/JPL Horizons', endpoint: 'https://ssd.jpl.nasa.gov/api/horizons.api', ephemerisType: 'VECTORS',
      referenceFrame: 'ICRF', correction: 'geometric', source: allSource, sunCommand: '10', moonCommand: '301',
    },
    method: {
      candidateCount: coarse.candidates, coarseStepMinutes: COARSE_STEP_MINUTES, detailStepMinutes: DETAIL_STEP_MINUTES,
      contactInterpolation: 'Interpolasi linear di antara state vector 5 menit; puncak diperhalus secara parabola.',
      shadowModel: 'Kerucut umbra/penumbra Bumi tiga dimensi dengan pembesaran atmosfer Danjon 1/85.',
      constants: { sunRadiusKm: c.sunRadiusKm, moonRadiusKm: c.moonRadiusKm, earthRadiusKm: c.earthEquatorialRadiusKm, danjon: c.danjonEnlargement },
    },
  };
}
