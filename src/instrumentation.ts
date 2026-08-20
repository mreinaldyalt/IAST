/**
 * Next.js's official server-startup hook (stable since Next 15, no config
 * flag needed) — `register()` runs exactly once when the server process
 * starts, for both `next dev` and `next start`. This is what makes the
 * official-history scheduler start on boot instead of waiting for the first
 * request to /api/evaluate or /api/admin/official-history.
 *
 * Those routes still call ensureOfficialHistoryInitialized() themselves too
 * (left unchanged, on purpose) — it's idempotent (guarded by an internal
 * `initialized` flag), so this is pure defense-in-depth: if instrumentation
 * somehow doesn't fire in some environment, the app still self-heals on the
 * first real request exactly as before.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureOfficialHistoryInitialized } = await import('./lib/officialHistory/bootstrap');
    ensureOfficialHistoryInitialized();
  }
}
