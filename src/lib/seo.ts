import type { Metadata } from 'next';

/**
 * Sumber tunggal data SEO. Semua metadata (title, canonical, Open Graph,
 * JSON-LD, sitemap) membaca dari sini supaya nama situs, penulis, dan judul
 * skripsi tidak pernah berbeda antar halaman.
 */

/** Alamat kanonis. Bare-IP VPS sengaja BUKAN kanonis agar tidak dianggap duplikat. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://iast.duckdns.org').replace(/\/$/, '');

export const SITE_NAME = 'International Astronomical Studies';
export const SITE_SHORT = 'IAST';

export const AUTHOR_NAME = 'Muhammad Reinaldy Santoso Alaratte';
export const AUTHOR_GITHUB = 'https://github.com/mreinaldyalt';

export const THESIS_TITLE_ID =
  'Komputasi Hisab Prediksi Awal Ramadan Berbasis Data Ephemeris NASA JPL Horizons Menggunakan Algoritma Newton-Raphson';
export const THESIS_TITLE_EN =
  'Computational Hisab for Predicting the Start of Ramadan Based on NASA JPL Horizons Ephemeris Data Using the Newton-Raphson Algorithm';

export const SITE_DESCRIPTION =
  `${SITE_NAME} (${SITE_SHORT}) — platform riset astronomi untuk komputasi hisab prediksi awal Ramadan ` +
  'berbasis data ephemeris NASA JPL Horizons dengan algoritma Newton-Raphson, evaluasi konjungsi, ' +
  `peristiwa astronomi, dan visualisasi langit. Dikembangkan oleh ${AUTHOR_NAME} sebagai proyek Skripsi S1 Data Sains.`;

export const SITE_KEYWORDS = [
  'IAST',
  'International Astronomical Studies',
  'hisab awal Ramadan',
  'prediksi awal Ramadan',
  'penentuan awal Ramadan',
  'wujudul hilal',
  'KHGT',
  'konjungsi bulan matahari',
  'ijtimak',
  'NASA JPL Horizons',
  'ephemeris',
  'algoritma Newton-Raphson',
  'Stellarium',
  'parade planet',
  'peristiwa astronomi',
  'gerhana',
  'skripsi Data Sains',
  AUTHOR_NAME,
  'Muhammad Reinaldy',
];

export interface RouteSeo {
  /** Path rute, mis. `/prediksi-ramadan`. Dipakai untuk canonical. */
  path: string;
  title: string;
  description: string;
}

/** Metadata per-rute: judul, deskripsi, canonical, dan Open Graph konsisten. */
export function routeMetadata({ path, title, description }: RouteSeo): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: `${SITE_NAME} [${SITE_SHORT}]`,
      locale: 'id_ID',
      alternateLocale: ['en_US'],
      url: path,
      title: `${title} | ${SITE_SHORT}`,
      description,
    },
    twitter: { card: 'summary_large_image', title: `${title} | ${SITE_SHORT}`, description },
  };
}

/** Daftar halaman publik yang boleh terindeks (dipakai sitemap.ts). */
export const INDEXABLE_ROUTES: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/prediksi-ramadan', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/evaluasi-konjungsi', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/evaluasi', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/astronomy-event', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/parade-planet', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/gerhana', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/stellarium', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/solar-system', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/simulasi', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/metode', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.8, changeFrequency: 'monthly' },
];

/**
 * Data terstruktur schema.org (JSON-LD) agar Google paham bahwa situs ini
 * milik/karya {AUTHOR_NAME} dan merupakan bagian dari skripsinya.
 */
export function buildJsonLd() {
  const personId = `${SITE_URL}/#penulis`;
  const siteId = `${SITE_URL}/#situs`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': siteId,
        url: `${SITE_URL}/`,
        name: `${SITE_NAME} [${SITE_SHORT}]`,
        alternateName: [SITE_SHORT, SITE_NAME, 'Platform Riset Astronomi Internasional'],
        description: SITE_DESCRIPTION,
        inLanguage: ['id', 'en'],
        author: { '@id': personId },
        publisher: { '@id': personId },
      },
      {
        '@type': 'Person',
        '@id': personId,
        name: AUTHOR_NAME,
        alternateName: ['Muhammad Reinaldy', 'Reinaldy Alaratte'],
        url: `${SITE_URL}/about`,
        sameAs: [AUTHOR_GITHUB],
        description: `Pengembang ${SITE_NAME} [${SITE_SHORT}] — mahasiswa S1 Data Sains.`,
      },
      {
        '@type': 'Thesis',
        name: THESIS_TITLE_ID,
        alternateName: THESIS_TITLE_EN,
        inLanguage: 'id',
        url: `${SITE_URL}/about`,
        author: { '@id': personId },
        inSupportOf: 'Skripsi S1 Data Sains',
        about: ['Hisab awal Ramadan', 'Konjungsi Bulan–Matahari', 'NASA JPL Horizons', 'Algoritma Newton-Raphson'],
        isPartOf: { '@id': siteId },
      },
    ],
  };
}
