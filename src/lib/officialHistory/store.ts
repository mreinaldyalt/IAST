/**
 * Runtime-writable persistence for official Ramadan history records.
 *
 * Deliberately NOT a database: this project has no DB driver, no ORM, and no
 * confirmed managed-hosting platform (checked: no vercel.json/Dockerfile/CI
 * config). It already has one proven persistence pattern though — the
 * NASA HORIZONS disk cache (`horizonsClient.ts`, `.cache/horizons/*.json`),
 * written and read at runtime with plain `fs`. This store follows the exact
 * same pattern so adding a new year of data means writing to this file at
 * runtime (via the updater or the admin endpoint) — never editing source code
 * or redeploying.
 *
 * File lives outside `data/` (which is source-controlled seed data like
 * data/ground_truth_muhammadiyah.json) and outside `.cache/` (which is
 * disposable/regenerable). `.data/` is this project's own runtime state,
 * gitignored, safe to persist across requests as long as the Node process's
 * filesystem persists (true for `next dev` / `next start`; would NOT survive
 * on a stateless serverless platform — noted as a limitation in the final
 * report since no such platform is confirmed in use here).
 */
import fs from 'fs';
import path from 'path';
import { OfficialRamadanRecord, STATUS_RANK } from './types';

const DEFAULT_STORE_FILE = path.join(process.cwd(), '.data', 'official-ramadan-history.json');

/** Overridable only by tests, so they never read/write the real runtime store. */
let storeFileOverride: string | null = null;

/** Test-only hook — production code must never call this. */
export function __setStoreFilePathForTesting(filePath: string | null): void {
  storeFileOverride = filePath;
}

function getStoreFile(): string {
  return storeFileOverride ?? DEFAULT_STORE_FILE;
}

function ensureDir(): void {
  const dir = path.dirname(getStoreFile());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load all records. Never throws — a missing or corrupt store file must not
 * take down the evaluasi endpoint; it just behaves as if no official data
 * exists yet (everything reads as `pending`/null).
 */
export function loadAllRecords(): OfficialRamadanRecord[] {
  try {
    const file = getStoreFile();
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAllRecords(records: OfficialRamadanRecord[]): void {
  ensureDir();
  fs.writeFileSync(getStoreFile(), JSON.stringify(records, null, 2), 'utf-8');
}

export function getRecord(countryCode: string, gregorianYear: number): OfficialRamadanRecord | null {
  const cc = countryCode.toUpperCase();
  const all = loadAllRecords();
  return all.find((r) => r.countryCode === cc && r.gregorianYear === gregorianYear) ?? null;
}

/** All years for a country that currently have a `verified` record, ascending. */
export function listVerifiedYears(countryCode: string): number[] {
  const cc = countryCode.toUpperCase();
  return loadAllRecords()
    .filter((r) => r.countryCode === cc && r.verificationStatus === 'verified')
    .map((r) => r.gregorianYear)
    .sort((a, b) => a - b);
}

/**
 * Insert or update one record for (countryCode, gregorianYear).
 *
 * Upsert rule: a write is only applied if the incoming status rank is >= the
 * existing record's rank (pending/rejected=0, candidate=1, verified=2). This
 * is what stops a background re-check (which might only produce a `pending`
 * or `candidate` result) from ever clobbering an already-`verified` record —
 * required behaviour per spec ("data verified tidak ditimpa candidate yang
 * lebih lemah"). Returns the record actually stored (existing one if the
 * write was rejected by this rule).
 */
export function upsertRecord(
  input: Omit<OfficialRamadanRecord, 'createdAt' | 'updatedAt'>
): OfficialRamadanRecord {
  const cc = input.countryCode.toUpperCase();
  const all = loadAllRecords();
  const idx = all.findIndex((r) => r.countryCode === cc && r.gregorianYear === input.gregorianYear);
  const now = new Date().toISOString();

  if (idx === -1) {
    const created: OfficialRamadanRecord = { ...input, countryCode: cc, createdAt: now, updatedAt: now };
    all.push(created);
    saveAllRecords(all);
    return created;
  }

  const existing = all[idx];
  if (STATUS_RANK[input.verificationStatus] < STATUS_RANK[existing.verificationStatus]) {
    // Incoming write is weaker than what's already stored — keep the existing
    // record, but still record that a check happened (lastCheckedAt), so the
    // observation-window throttle (see updater.ts) doesn't re-check instantly.
    const touched: OfficialRamadanRecord = { ...existing, lastCheckedAt: input.lastCheckedAt ?? existing.lastCheckedAt, updatedAt: now };
    all[idx] = touched;
    saveAllRecords(all);
    return touched;
  }

  const updated: OfficialRamadanRecord = { ...existing, ...input, countryCode: cc, updatedAt: now };
  all[idx] = updated;
  saveAllRecords(all);
  return updated;
}

/** Only touch lastCheckedAt without changing verification status/content. */
export function touchLastChecked(countryCode: string, gregorianYear: number): void {
  const cc = countryCode.toUpperCase();
  const all = loadAllRecords();
  const idx = all.findIndex((r) => r.countryCode === cc && r.gregorianYear === gregorianYear);
  if (idx === -1) return;
  all[idx] = { ...all[idx], lastCheckedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  saveAllRecords(all);
}
