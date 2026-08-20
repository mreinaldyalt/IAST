import { seedIndonesiaIfNeeded } from './seedIndonesia';
import { startBackgroundSweep } from './updater';

/**
 * Next.js has no single "on server start" hook for a plain API-routes app
 * (no custom server here) — so initialization happens lazily on first use,
 * guarded by a module-level flag. Call this at the top of any route that
 * touches official-history data.
 */
let initialized = false;

export function ensureOfficialHistoryInitialized(): void {
  if (initialized) return;
  initialized = true;
  seedIndonesiaIfNeeded();
  startBackgroundSweep();
}
