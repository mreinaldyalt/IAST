import { OPTICAL_CLASS, PARADE_PLANET_IDS, type ParadePlanetId } from './types';
import { HORIZONS_COMMAND, fetchObsEcLon } from './horizonsPlanets';

const DAY_MS = 86_400_000;
const SAMPLE_DAYS = 5;
// A single Horizons TLIST request stops working past ~80 epochs — confirmed by
// direct binary search: 70 epochs (URL ~1764 chars) succeeds, 90 epochs (~2184
// chars) 502s (a gateway/proxy URL-length limit, not a NASA application error —
// the response is a plain HTML error page, not JSON). The previous BATCH_SIZE=160
// assumed a 24-month/five-day scan (~148 epochs) fit in one request; it never did,
// which is why annual parade scans intermittently 502'd regardless of which
// ephemeris type (OBSERVER or VECTORS) was used. 60 leaves comfortable margin.
const BATCH_SIZE = 60;

export interface ParadeCatalogEvent {
  date: string;
  planetCount: number;
  participants: ParadePlanetId[];
  nakedEyeCount: number;
  aidedCount: number;
  spanDeg: number;
  source: string;
}

interface Cluster {
  spanDeg: number;
  participants: ParadePlanetId[];
}

/** Angular limits are explicit operational search thresholds, not an IAU definition. */
const MAX_SPAN: Record<number, number> = { 4: 110, 5: 155, 6: 205, 7: 235 };

function minimumCluster(values: Array<{ id: ParadePlanetId; angle: number }>, count: number): Cluster {
  const sorted = values
    .map((value) => ({ ...value, angle: ((value.angle % 360) + 360) % 360 }))
    .sort((a, b) => a.angle - b.angle);
  const extended = [...sorted, ...sorted.map((value) => ({ ...value, angle: value.angle + 360 }))];
  let best: Cluster = { spanDeg: 360, participants: [] };
  for (let index = 0; index < sorted.length; index++) {
    const spanDeg = extended[index + count - 1].angle - extended[index].angle;
    if (spanDeg < best.spanDeg) {
      best = { spanDeg, participants: extended.slice(index, index + count).map((value) => value.id) };
    }
  }
  return best;
}

async function fetchTrack(command: string, epochs: Date[]) {
  const samples: Awaited<ReturnType<typeof fetchObsEcLon>>['samples'] = [];
  const sources = new Set<string>();
  for (let index = 0; index < epochs.length; index += BATCH_SIZE) {
    const result = await fetchObsEcLon(command, epochs.slice(index, index + BATCH_SIZE));
    samples.push(...result.samples);
    sources.add(result.source);
  }
  return { samples, source: sources.has('live') ? 'live' : sources.has('cache') ? 'cache' : 'mock' };
}

function refinedDate(epochs: Date[], spans: number[], index: number): string {
  const previous = spans[index - 1];
  const current = spans[index];
  const next = spans[index + 1];
  const denominator = previous - (2 * current) + next;
  const fraction = Math.abs(denominator) < 1e-9 ? 0 : Math.max(-1, Math.min(1, 0.5 * (previous - next) / denominator));
  return new Date(epochs[index].getTime() + fraction * SAMPLE_DAYS * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Build a light-weight NASA Horizons parade catalogue for a date range. This
 * scans each planet track once in five-day steps, detects local alignment
 * minima for 4, 5, 6 (and 7) participants, and avoids running the expensive
 * global topocentric solver for every day. A selected event is verified by the
 * full /api/parade single-date computation.
 */
export async function findParadeEventsInRange(start: Date, end: Date): Promise<ParadeCatalogEvent[]> {
  if (!(start < end)) throw new Error('Invalid parade search range.');
  const epochs: Date[] = [];
  const scanStart = start.getTime() - SAMPLE_DAYS * DAY_MS;
  const scanEnd = end.getTime() + SAMPLE_DAYS * DAY_MS;
  for (let time = scanStart; time <= scanEnd; time += SAMPLE_DAYS * DAY_MS) epochs.push(new Date(time));

  const tracks = await Promise.all(PARADE_PLANET_IDS.map((planet) => fetchTrack(HORIZONS_COMMAND[planet], epochs)));
  if (tracks.some((track) => track.source === 'mock')) throw new Error('NASA Horizons parade catalogue is unavailable.');
  const source = tracks.some((track) => track.source === 'live') ? 'live' : 'cache';
  const valuesByEpoch = epochs.map((_, index) => PARADE_PLANET_IDS.map((id, planetIndex) => ({
    id,
    angle: tracks[planetIndex].samples[index]?.ecLon,
  })).filter((value): value is { id: ParadePlanetId; angle: number } => Number.isFinite(value.angle)));

  const candidates: ParadeCatalogEvent[] = [];
  for (const count of [7, 6, 5, 4]) {
    const clusters = valuesByEpoch.map((values) => values.length >= count ? minimumCluster(values, count) : { spanDeg: 360, participants: [] });
    const spans = clusters.map((cluster) => cluster.spanDeg);
    for (let index = 1; index < epochs.length - 1; index++) {
      const cluster = clusters[index];
      if (cluster.spanDeg > MAX_SPAN[count] || cluster.spanDeg > spans[index - 1] || cluster.spanDeg > spans[index + 1]) continue;
      const date = refinedDate(epochs, spans, index);
      const time = Date.parse(`${date}T12:00:00.000Z`);
      if (time < start.getTime() || time >= end.getTime()) continue;
      const nakedEyeCount = cluster.participants.filter((id) => OPTICAL_CLASS[id] === 'naked-eye').length;
      candidates.push({
        date,
        planetCount: count,
        participants: cluster.participants,
        nakedEyeCount,
        aidedCount: count - nakedEyeCount,
        spanDeg: cluster.spanDeg,
        source,
      });
    }
  }

  // Nested 4/5/6 minima often describe the same physical alignment. Keep the
  // largest participant count within a 12-day event window.
  const ranked = candidates.sort((a, b) => b.planetCount - a.planetCount || a.spanDeg - b.spanDeg || a.date.localeCompare(b.date));
  const selected: ParadeCatalogEvent[] = [];
  for (const candidate of ranked) {
    const candidateTime = Date.parse(`${candidate.date}T12:00:00.000Z`);
    if (selected.some((event) => Math.abs(Date.parse(`${event.date}T12:00:00.000Z`) - candidateTime) <= 12 * DAY_MS)) continue;
    selected.push(candidate);
  }
  return selected.sort((a, b) => a.date.localeCompare(b.date));
}

/** Backwards-compatible helper used by older callers. */
export async function findAnnualParadeCandidate(year: number): Promise<{ date: string; spanDeg: number; source: string; planetCount: number }> {
  const events = await findParadeEventsInRange(new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1)));
  const event = events[0];
  if (!event) throw new Error('Annual planet alignment candidate could not be computed.');
  return { date: event.date, spanDeg: event.spanDeg, source: event.source, planetCount: event.planetCount };
}
