import { OfficialRamadanRecord } from './types';
import { upsertRecord } from './store';

/**
 * Initial verified seed: Indonesia 1 Ramadan official government dates,
 * 2010-2026.
 *
 * Source discipline: every entry below is the Government of Indonesia's
 * official Sidang Isbat decision (Kementerian Agama RI), cross-checked against
 * 2+ independent reports per year (at least one from a kemenag.go.id /
 * setneg.go.id / setkab.go.id / mahkamahagung.go.id domain where available,
 * otherwise a major national news agency explicitly quoting the Minister of
 * Religious Affairs' announcement — never a prediction/forecast article).
 * Researched via web search on 2026-07-07; NOT the same as
 * data/ground_truth_muhammadiyah.json (a different organization).
 *
 * `verifiedBy` is left transparent about this provenance (AI-assisted
 * research, not a human archivist checking a primary government gazette) so
 * anyone citing this in academic work knows to spot-check before relying on
 * it as a primary source.
 */
const VERIFIED_BY = 'ai-assisted-multisource-research-2026-07-07';
const SOURCE_TYPE = 'official_isbat_announcement';
const AUTHORITY = 'Government of Indonesia';
const INSTITUTION = 'Ministry of Religious Affairs (Kementerian Agama RI)';

type SeedEntry = Pick<
  OfficialRamadanRecord,
  'gregorianYear' | 'hijriYear' | 'officialDate' | 'sourceTitle' | 'sourceUrl'
>;

const SEED_ENTRIES: SeedEntry[] = [
  { gregorianYear: 2010, hijriYear: 1431, officialDate: '2010-08-11',
    sourceTitle: 'Pemerintah Tetapkan Awal Ramadhan, Rabu 11 Agustus 2010',
    sourceUrl: 'https://kemenag.go.id/read/pemerintah-tetapkan-awal-ramadhan-rabu-11-agustus-2010-5lmn' },
  { gregorianYear: 2011, hijriYear: 1432, officialDate: '2011-08-01',
    sourceTitle: 'Pemerintah Tetapkan Awal Ramadhan Senin 1 Agustus',
    sourceUrl: 'https://jabar.antaranews.com/berita/32995/pemerintah-tetapkan-awal-ramadhan-senin-1-agustus' },
  { gregorianYear: 2012, hijriYear: 1433, officialDate: '2012-07-21',
    sourceTitle: 'Pemerintah Tetapkan Awal Ramadhan 1433H, Sabtu 21 Juli 2012',
    sourceUrl: 'https://kemenag.go.id/nasional/pemerintah-tetapkan-awal-ramadhan-1433h-sabtu-21-juli-2012-dxh8qc' },
  { gregorianYear: 2013, hijriYear: 1434, officialDate: '2013-07-10',
    sourceTitle: 'Sidang Itsbat Penentuan Awal Ramadhan 1434 H',
    sourceUrl: 'https://badilag.mahkamahagung.go.id/seputar-ditjen-badilag/seputar-ditjen-badilag/awal-ramadhan-1434-h' },
  { gregorianYear: 2014, hijriYear: 1435, officialDate: '2014-06-29',
    sourceTitle: 'Menteri Agama: 1 Ramadhan 1435 H Jatuh pada 29 Juni 2014',
    sourceUrl: 'https://nasional.kompas.com/read/2014/06/27/1953017/Menteri.Agama.1.Ramadhan.1435.H.Jatuh.pada.29.Juni.2014' },
  { gregorianYear: 2015, hijriYear: 1436, officialDate: '2015-06-18',
    sourceTitle: 'Pemerintah Tetapkan Awal Ramadhan Jatuh pada Kamis, 18 Juni 2015',
    sourceUrl: 'https://kelpurwantoro.malangkota.go.id/2015/06/17/pemerintah-tetapkan-awal-ramadhan-jatuh-pada-kamis-18-juni-2015/' },
  { gregorianYear: 2016, hijriYear: 1437, officialDate: '2016-06-06',
    sourceTitle: 'Pemerintah Tetapkan Ramadhan 1437 H Mulai Senin 6 Juni 2016',
    sourceUrl: 'https://amp.kompas.com/nasional/read/2016/06/05/19035861/pemerintah-tetapkan-ramadhan-1437-h-mulai-senin-6-juni-2016' },
  { gregorianYear: 2017, hijriYear: 1438, officialDate: '2017-05-27',
    sourceTitle: 'Pemerintah Tetapkan Awal Puasa Ramadan Mulai Sabtu, 27 Mei 2017',
    sourceUrl: 'https://setkab.go.id/pemerintah-tetapkan-awal-puasa-ramadan-mulai-sabtu-27-mei/' },
  { gregorianYear: 2018, hijriYear: 1439, officialDate: '2018-05-17',
    sourceTitle: 'Pemerintah Tetapkan 1 Ramadan 1439H/2018M Jatuh Pada Kamis, 17 Mei 2018',
    sourceUrl: 'https://kemenag.go.id/read/pemerintah-tetapkan-1-ramadan-1439h2018m-jatuh-pada-kamis-17-mei-2018-qbma6' },
  { gregorianYear: 2019, hijriYear: 1440, officialDate: '2019-05-06',
    sourceTitle: 'Sidang Isbat, Pemerintah Tetapkan Awal Puasa 1 Ramadhan 6 Mei 2019',
    sourceUrl: 'https://dki.kemenag.go.id/berita/sidang-isbat-pemerintah-tetapkan-awal-puasa-1-ramadhan-6-mei-2019-ZeNtr' },
  { gregorianYear: 2020, hijriYear: 1441, officialDate: '2020-04-24',
    sourceTitle: 'Pemerintah Tetapkan Awal Ramadan 1441H Jatuh pada 24 April 2020',
    sourceUrl: 'https://balitbangdiklat.kemenag.go.id/berita/pemerintah-tetapkan-awal-ramadan-1441h-jatuh-pada-24-april-2020' },
  { gregorianYear: 2021, hijriYear: 1442, officialDate: '2021-04-13',
    sourceTitle: 'Pemerintah Tetapkan Awal Ramadan 1442H Jatuh pada 13 April 2021',
    sourceUrl: 'https://kemenag.go.id/pers-rilis/pemerintah-tetapkan-awal-ramadan-1442h-jatuh-pada-13-april-2021-2nvbo8' },
  { gregorianYear: 2022, hijriYear: 1443, officialDate: '2022-04-03',
    sourceTitle: 'Pemerintah Tetapkan 1 Ramadan 1443H Jatuh Pada Minggu, 3 April 2022 (KMA No. 324/2022)',
    sourceUrl: 'https://setkab.go.id/pemerintah-tetapkan-1-ramadan-1443h-jatuh-pada-minggu-3-april-2022/' },
  { gregorianYear: 2023, hijriYear: 1444, officialDate: '2023-03-23',
    sourceTitle: 'Hasil Sidang Isbat Pemerintah: 1 Ramadan 1444 H Jatuh Kamis 23 Maret',
    sourceUrl: 'https://www.cnnindonesia.com/nasional/20230321191512-20-928043/hasil-sidang-isbat-pemerintah-1-ramadan-1444-h-jatuh-kamis-23-maret' },
  { gregorianYear: 2024, hijriYear: 1445, officialDate: '2024-03-12',
    sourceTitle: 'Pemerintah Tetapkan 1 Ramadan 1445 H Jatuh pada 12 Maret 2024',
    sourceUrl: 'https://kemenag.go.id/pers-rilis/pemerintah-tetapkan-1-ramadan-1445-h-jatuh-pada-12-maret-2024-6LqLP' },
  { gregorianYear: 2025, hijriYear: 1446, officialDate: '2025-03-01',
    sourceTitle: 'Pemerintah Tetapkan 1 Ramadan 1446 H Jatuh pada 1 Maret 2025',
    sourceUrl: 'https://kemenag.go.id/en/pers-rilis/pemerintah-tetapkan-1-ramadan-1446-h-jatuh-pada-1-maret-2025-YzheO' },
  { gregorianYear: 2026, hijriYear: 1447, officialDate: '2026-02-19',
    sourceTitle: 'Pemerintah Tetapkan 1 Ramadan 1447 H Jatuh pada 19 Februari 2026',
    sourceUrl: 'https://www.setneg.go.id/baca/index/pemerintah_tetapkan_1_ramadan_1447_h_jatuh_pada_kamis_19_februari_2026' },
];

/**
 * Idempotent: safe to call on every server start. Uses the same upsert rule
 * as everything else (won't downgrade/duplicate an existing record), so
 * running this after an admin or the updater has already touched a given
 * year does not clobber their work.
 */
export function seedIndonesiaIfNeeded(): void {
  for (const entry of SEED_ENTRIES) {
    upsertRecord({
      countryCode: 'ID',
      gregorianYear: entry.gregorianYear,
      hijriYear: entry.hijriYear,
      officialDate: entry.officialDate,
      authority: AUTHORITY,
      institution: INSTITUTION,
      sourceTitle: entry.sourceTitle,
      sourceUrl: entry.sourceUrl,
      sourceType: SOURCE_TYPE,
      verificationStatus: 'verified',
      rejectionReason: null,
      verifiedBy: VERIFIED_BY,
      lastCheckedAt: null,
    });
  }
}
