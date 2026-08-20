import { describe, it, expect } from 'vitest';
import { validateOfficialAnnouncement } from '../validator';

const ALLOWED = ['kemenag.go.id', 'setneg.go.id'];

describe('officialHistory/validator', () => {
  it('marks a genuine final announcement as verified and extracts date + hijri year', () => {
    const result = validateOfficialAnnouncement({
      text: 'Pemerintah Tetapkan 1 Ramadan 1446 H Jatuh pada 1 Maret 2025',
      sourceUrl: 'https://kemenag.go.id/pers-rilis/example',
      allowedDomains: ALLOWED,
      expectedGregorianYear: 2025,
    });
    expect(result.status).toBe('verified');
    expect(result.extractedDate).toBe('2025-03-01');
    expect(result.extractedHijriYear).toBe(1446);
  });

  it('rejects a prediction/forecast article even from an official domain', () => {
    const result = validateOfficialAnnouncement({
      text: 'Kapan 1 Ramadhan 2026? Simak Jadwal Sidang Isbat Kemenag (prediksi)',
      sourceUrl: 'https://kemenag.go.id/berita/example',
      allowedDomains: ALLOWED,
      expectedGregorianYear: 2026,
    });
    expect(result.status).toBe('rejected');
  });

  it('rejects a "jadwal sidang" schedule announcement (not the result itself)', () => {
    const result = validateOfficialAnnouncement({
      text: 'Sidang Isbat 1 Ramadhan 1447 H akan digelar 17 Februari 2026',
      sourceUrl: 'https://kemenag.go.id/berita/jadwal',
      allowedDomains: ALLOWED,
      expectedGregorianYear: 2026,
    });
    expect(result.status).toBe('rejected');
  });

  it('rejects a source from a non-official domain regardless of wording', () => {
    const result = validateOfficialAnnouncement({
      text: 'Pemerintah Tetapkan 1 Ramadan 1446 H Jatuh pada 1 Maret 2025',
      sourceUrl: 'https://random-blog.example.com/post',
      allowedDomains: ALLOWED,
      expectedGregorianYear: 2025,
    });
    expect(result.status).toBe('rejected');
  });

  it('downgrades to candidate when confirmed but no explicit Gregorian date is present', () => {
    const result = validateOfficialAnnouncement({
      text: 'Pemerintah Tetapkan 1 Ramadhan 1446 H',
      sourceUrl: 'https://kemenag.go.id/pers-rilis/example',
      allowedDomains: ALLOWED,
      expectedGregorianYear: 2025,
    });
    expect(result.status).toBe('candidate');
    expect(result.extractedDate).toBeNull();
  });

  it('downgrades to candidate when the extracted year does not match the expected year', () => {
    const result = validateOfficialAnnouncement({
      text: 'Pemerintah Tetapkan 1 Ramadan 1445 H Jatuh pada 12 Maret 2024',
      sourceUrl: 'https://kemenag.go.id/pers-rilis/example',
      allowedDomains: ALLOWED,
      expectedGregorianYear: 2025,
    });
    expect(result.status).toBe('candidate');
  });
});
