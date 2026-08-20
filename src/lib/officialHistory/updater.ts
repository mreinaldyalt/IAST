import { estimateRamadanConjDate } from '../khgtPipeline';
import { getRecord } from './store';
import { fetchAndValidateCandidate } from './fetchAndValidate';
import { getProviderForCountry } from './providers';
import { discoverAndValidateNewSources } from './discovery';

const OBSERVATION_WINDOW_DAYS = 20;
const RECHECK_THROTTLE_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Reuses the already-validated Ramadan date estimator from khgtPipeline.ts
 * (accurate for any year, near or far future — see that function's own
 * docstring) purely as a cheap "are we anywhere near Ramadan" signal. Far
 * from this window, there is no reason to ever re-check a source.
 */
export function isWithinObservationWindow(gregorianYear: number, now: Date = new Date()): boolean {
  const estimate = estimateRamadanConjDate(gregorianYear);
  const diffDays = Math.abs(now.getTime() - estimate.getTime()) / 86400000;
  return diffDays <= OBSERVATION_WINDOW_DAYS;
}

function isStale(lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) return true;
  return Date.now() - new Date(lastCheckedAt).getTime() > RECHECK_THROTTLE_MS;
}

/**
 * Lazy, non-blocking refresh — call as a side effect of a real request
 * (never awaited by the caller, never allowed to slow down or fail the
 * response it was triggered from). Does nothing unless ALL of:
 *   - the year isn't already `verified` (verified is terminal — never re-checked)
 *   - a candidate sourceUrl is already on file (this cannot discover a URL by
 *     itself — see fetchAndValidate.ts docstring for why; someone, e.g. the
 *     admin fallback, has to supply it once)
 *   - we're within ~20 days of that year's estimated Ramadan
 *   - it hasn't been checked in the last 12 hours
 */
export function maybeRefreshInBackground(countryCode: string, gregorianYear: number): void {
  const provider = getProviderForCountry(countryCode);
  if (!provider) return;

  const existing = getRecord(countryCode, gregorianYear);
  if (existing?.verificationStatus === 'verified') return;
  if (!existing?.sourceUrl) return;
  if (!isWithinObservationWindow(gregorianYear)) return;
  if (!isStale(existing.lastCheckedAt)) return;

  fetchAndValidateCandidate(countryCode, gregorianYear, existing.sourceUrl).catch(() => {
    // fetchAndValidateCandidate already handles/records its own failures —
    // this catch only exists so an unawaited promise rejection can't surface
    // as an unhandled rejection warning.
  });
}

/**
 * Discovers brand-new candidate URLs (see discovery.ts — sitemap-based, no
 * headless browser) and hands them to the same validator as everything else.
 * Only called from the scheduler below, never from a request handler — a
 * user opening /evaluasi must never trigger an outbound fetch to kemenag.go.id.
 * Gated by the observation window so this doesn't fetch sitemaps year-round
 * for no reason — only worth doing anywhere near when an announcement could
 * plausibly appear.
 */
async function discoverForCountryIfInWindow(countryCode: string): Promise<void> {
  const thisYear = new Date().getUTCFullYear();
  const relevantYears = [thisYear, thisYear + 1];
  if (!relevantYears.some((y) => isWithinObservationWindow(y))) return;

  try {
    await discoverAndValidateNewSources(countryCode);
  } catch {
    // discoverAndValidateNewSources already isolates per-candidate failures;
    // this is just an extra safety net so the sweep loop below can never die.
  }
}

/**
 * In-process periodic sweep — appropriate for this project's actual
 * deployment model (a long-running `next dev`/`next start` Node process; no
 * vercel.json, Dockerfile, or CI config found, so no managed-cron platform is
 * assumed). This is explicitly NOT an OS-level cron: it only runs while this
 * process stays alive, and a restart resets it. The lazy per-request check
 * above (`maybeRefreshInBackground`, called from the evaluate route) covers
 * the gap for re-checking an already-known candidate URL if the process
 * restarts; discovery itself only runs from here, on a timer, plus once
 * immediately at startup (so a restart during the observation window doesn't
 * have to wait up to 6 hours for the first discovery attempt).
 *
 * Guarded by a module-level flag so Next.js dev-mode hot-reload can't stack
 * multiple overlapping intervals.
 */
let sweepStarted = false;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function startBackgroundSweep(): void {
  if (sweepStarted) return;
  sweepStarted = true;

  const sweep = () => {
    const thisYear = new Date().getUTCFullYear();
    for (const y of [thisYear, thisYear + 1]) {
      maybeRefreshInBackground('ID', y);
    }
    discoverForCountryIfInWindow('ID').catch(() => {});
  };

  sweep(); // once immediately, so a server restart during the observation window doesn't wait a full cycle
  setInterval(sweep, SWEEP_INTERVAL_MS);
}
