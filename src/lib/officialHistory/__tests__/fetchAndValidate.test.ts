import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { __setStoreFilePathForTesting, getRecord, upsertRecord } from '../store';
import { fetchAndValidateCandidate } from '../fetchAndValidate';

let tmpFile: string;
const originalFetch = global.fetch;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `official-history-fav-test-${Date.now()}-${Math.random()}.json`);
  __setStoreFilePathForTesting(tmpFile);
});

afterEach(() => {
  __setStoreFilePathForTesting(null);
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  global.fetch = originalFetch;
});

describe('officialHistory/fetchAndValidate', () => {
  it('12a. a network failure while checking a source never throws — it degrades to a recorded pending state', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network unreachable')) as unknown as typeof fetch;

    await expect(
      fetchAndValidateCandidate('ID', 2077, 'https://kemenag.go.id/unreachable')
    ).resolves.not.toThrow();

    const rec = getRecord('ID', 2077);
    expect(rec).not.toBeNull();
    expect(rec?.verificationStatus).not.toBe('verified');
    expect(rec?.officialDate).toBeNull();
  });

  it('12b. a failed check does not corrupt or remove an already-verified record for a different year', async () => {
    upsertRecord({
      countryCode: 'ID',
      gregorianYear: 2025,
      hijriYear: 1446,
      officialDate: '2025-03-01',
      authority: 'Government of Indonesia',
      institution: 'Ministry of Religious Affairs (Kementerian Agama RI)',
      sourceTitle: 'title',
      sourceUrl: 'https://kemenag.go.id/x',
      sourceType: 'official_isbat_announcement',
      verificationStatus: 'verified',
      rejectionReason: null,
      verifiedBy: 'test',
      lastCheckedAt: null,
    });

    global.fetch = vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;
    await fetchAndValidateCandidate('ID', 2077, 'https://kemenag.go.id/unreachable');

    // The unrelated, already-verified 2025 record must be untouched.
    const rec2025 = getRecord('ID', 2025);
    expect(rec2025?.verificationStatus).toBe('verified');
    expect(rec2025?.officialDate).toBe('2025-03-01');
  });

  it('an HTTP error response (not a thrown network error) also degrades gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);

    const rec = await fetchAndValidateCandidate('ID', 2078, 'https://kemenag.go.id/down');
    expect(rec).not.toBeNull();
    expect(rec?.verificationStatus).not.toBe('verified');
  });
});
