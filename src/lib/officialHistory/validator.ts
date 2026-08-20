/**
 * Strict validator for candidate official-announcement text before it can
 * become `verified`. Deliberately conservative — false negatives (leaving a
 * real announcement as `candidate` for manual review) are acceptable; false
 * positives (marking a prediction/schedule as `verified`) are not.
 */

const INDONESIAN_MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
};

// Any of these present → immediately reject, regardless of other signals.
const REJECT_PATTERNS: RegExp[] = [
  /prediksi/i,
  /perkiraan/i,
  /estimasi/i,
  /akan\s+digelar/i,
  /akan\s+menetapkan/i,
  /jadwal\s+sidang/i,
  /kemungkinan/i,
  /diperkirakan/i,
];

const CONFIRM_PATTERNS: RegExp[] = [/tetapkan/i, /ditetapkan/i, /menetapkan/i];
const RAMADAN_MENTION = /1\s*ramad(h)?an/i;
const DATE_PATTERN = /(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})/i;
const HIJRI_PATTERN = /(\d{3,4})\s*h\b/i;

export interface ValidationInput {
  /** Title / og:title / short extracted text to validate — not the full article body. */
  text: string;
  sourceUrl: string;
  /** Bare hostnames (no protocol) considered official for this country, e.g. ["kemenag.go.id"]. */
  allowedDomains: string[];
  expectedGregorianYear: number;
}

export interface ValidationResult {
  status: 'verified' | 'candidate' | 'rejected';
  extractedDate: string | null; // YYYY-MM-DD
  extractedHijriYear: number | null;
  reason: string;
}

export function validateOfficialAnnouncement(input: ValidationInput): ValidationResult {
  const { text, sourceUrl, allowedDomains, expectedGregorianYear } = input;

  let host = '';
  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return { status: 'rejected', extractedDate: null, extractedHijriYear: null, reason: 'sourceUrl tidak valid.' };
  }
  const domainOk = allowedDomains.some((d) => host === d || host.endsWith('.' + d));
  if (!domainOk) {
    return {
      status: 'rejected',
      extractedDate: null,
      extractedHijriYear: null,
      reason: `Domain sumber ("${host}") bukan domain resmi yang diizinkan untuk negara ini.`,
    };
  }

  if (REJECT_PATTERNS.some((p) => p.test(text))) {
    return {
      status: 'rejected',
      extractedDate: null,
      extractedHijriYear: null,
      reason: 'Teks mengandung indikasi prediksi/perkiraan/jadwal sidang, bukan penetapan final.',
    };
  }

  if (!RAMADAN_MENTION.test(text)) {
    return {
      status: 'rejected',
      extractedDate: null,
      extractedHijriYear: null,
      reason: 'Teks tidak menyebut "1 Ramadhan" secara eksplisit.',
    };
  }

  if (!CONFIRM_PATTERNS.some((p) => p.test(text))) {
    return {
      status: 'candidate',
      extractedDate: null,
      extractedHijriYear: null,
      reason: 'Menyebut Ramadhan tapi tidak ditemukan kata penetapan final (tetapkan/ditetapkan/menetapkan) — perlu tinjauan manual.',
    };
  }

  const dateMatch = text.match(DATE_PATTERN);
  if (!dateMatch) {
    return {
      status: 'candidate',
      extractedDate: null,
      extractedHijriYear: null,
      reason: 'Penetapan terdeteksi tapi tanggal Gregorian eksplisit tidak ditemukan — perlu tinjauan manual.',
    };
  }

  const day = parseInt(dateMatch[1], 10);
  const month = INDONESIAN_MONTHS[dateMatch[2].toLowerCase()];
  const year = parseInt(dateMatch[3], 10);

  if (year !== expectedGregorianYear) {
    return {
      status: 'candidate',
      extractedDate: null,
      extractedHijriYear: null,
      reason: `Tanggal yang terdeteksi (tahun ${year}) tidak cocok dengan tahun target (${expectedGregorianYear}) — perlu tinjauan manual.`,
    };
  }

  const extractedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const hijriMatch = text.match(HIJRI_PATTERN);
  const extractedHijriYear = hijriMatch ? parseInt(hijriMatch[1], 10) : null;

  return {
    status: 'verified',
    extractedDate,
    extractedHijriYear,
    reason: 'Memenuhi seluruh kriteria: domain resmi, penetapan final eksplisit, menyebut 1 Ramadhan, tanggal Gregorian eksplisit sesuai tahun target.',
  };
}
