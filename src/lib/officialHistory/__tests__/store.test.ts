import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  __setStoreFilePathForTesting,
  upsertRecord,
  getRecord,
  loadAllRecords,
  listVerifiedYears,
} from '../store';
import { OfficialRamadanRecord } from '../types';

let tmpFile: string;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `official-history-test-${Date.now()}-${Math.random()}.json`);
  __setStoreFilePathForTesting(tmpFile);
});

afterEach(() => {
  __setStoreFilePathForTesting(null);
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

function verifiedInput(overrides: Partial<Omit<OfficialRamadanRecord, 'createdAt' | 'updatedAt'>> = {}) {
  return {
    countryCode: 'ID',
    gregorianYear: 2025,
    hijriYear: 1446,
    officialDate: '2025-03-01',
    authority: 'Government of Indonesia',
    institution: 'Ministry of Religious Affairs (Kementerian Agama RI)',
    sourceTitle: 'Pemerintah Tetapkan 1 Ramadan 1446 H Jatuh pada 1 Maret 2025',
    sourceUrl: 'https://kemenag.go.id/example',
    sourceType: 'official_isbat_announcement',
    verificationStatus: 'verified' as const,
    rejectionReason: null,
    verifiedBy: 'test',
    lastCheckedAt: null,
    ...overrides,
  };
}

describe('officialHistory/store', () => {
  it('2. stores and retrieves a verified record', () => {
    upsertRecord(verifiedInput());
    const rec = getRecord('ID', 2025);
    expect(rec).not.toBeNull();
    expect(rec?.verificationStatus).toBe('verified');
    expect(rec?.officialDate).toBe('2025-03-01');
  });

  it('5. a record stored under ID is never returned when querying an unsupported/different country code', () => {
    upsertRecord(verifiedInput({ countryCode: 'ID', gregorianYear: 2025 }));
    expect(getRecord('MY', 2025)).toBeNull();
  });

  it('9. upserting the same (countryCode, gregorianYear) twice does not create a duplicate', () => {
    upsertRecord(verifiedInput({ gregorianYear: 2030 }));
    upsertRecord(verifiedInput({ gregorianYear: 2030, sourceTitle: 'updated title' }));
    const all = loadAllRecords().filter((r) => r.countryCode === 'ID' && r.gregorianYear === 2030);
    expect(all.length).toBe(1);
    expect(all[0].sourceTitle).toBe('updated title'); // still upserts in place, just no duplicate row
  });

  it('10. an existing `verified` record is not overwritten by a weaker candidate/pending write', () => {
    upsertRecord(verifiedInput({ gregorianYear: 2027, officialDate: '2027-01-01' }));
    upsertRecord(
      verifiedInput({
        gregorianYear: 2027,
        verificationStatus: 'candidate',
        officialDate: null,
        sourceTitle: 'weaker candidate attempt',
      })
    );
    const rec = getRecord('ID', 2027);
    expect(rec?.verificationStatus).toBe('verified');
    expect(rec?.officialDate).toBe('2027-01-01');
  });

  it('a `verified` write does overwrite an existing `candidate`/`pending` record (upgrade allowed)', () => {
    upsertRecord(verifiedInput({ gregorianYear: 2028, verificationStatus: 'pending', officialDate: null }));
    upsertRecord(verifiedInput({ gregorianYear: 2028, officialDate: '2028-01-15' }));
    const rec = getRecord('ID', 2028);
    expect(rec?.verificationStatus).toBe('verified');
    expect(rec?.officialDate).toBe('2028-01-15');
  });

  it('11. a brand-new year can be added at runtime with no code change — the store has no year-based branching', () => {
    expect(getRecord('ID', 2099)).toBeNull();
    upsertRecord(verifiedInput({ gregorianYear: 2099, officialDate: '2099-05-01' }));
    expect(getRecord('ID', 2099)?.officialDate).toBe('2099-05-01');
    expect(listVerifiedYears('ID')).toContain(2099);
  });
});
