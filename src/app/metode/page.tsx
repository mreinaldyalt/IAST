import Link from 'next/link';
import {
  AUTHOR_NAME,
  SITE_NAME,
  SITE_SHORT,
  SITE_URL,
  THESIS_TITLE_ID,
  routeMetadata,
} from '@/lib/seo';

/**
 * Halaman penjelasan metode — SENGAJA server component (bukan 'use client')
 * supaya seluruh teksnya ada di HTML awal dan bisa dibaca Google tanpa
 * menjalankan JavaScript. Isinya harus tetap sinkron dengan kode di
 * src/lib (konjungsi, kriteria KHGT, Newton-Raphson).
 */
export const metadata = routeMetadata({
  path: '/metode',
  title: 'Metode Hisab Awal Ramadan: Konjungsi, Newton-Raphson, dan NASA JPL Horizons',
  description:
    'Penjelasan lengkap cara IAST menghitung awal Ramadan: konjungsi Bulan–Matahari dari data ephemeris NASA JPL Horizons, pencarian akar dengan algoritma Newton-Raphson, serta kriteria wujudul hilal dan KHGT (tinggi ≥ 5°, elongasi ≥ 8°).',
});

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Apa itu hisab awal Ramadan?',
    a: 'Hisab awal Ramadan adalah penentuan awal bulan Ramadan dengan perhitungan astronomi posisi Bulan dan Matahari, bukan dengan pengamatan langsung (rukyat). Hasilnya berupa waktu konjungsi dan posisi hilal saat Matahari terbenam yang kemudian dinilai terhadap suatu kriteria.',
  },
  {
    q: 'Apa itu konjungsi (ijtimak) Bulan–Matahari?',
    a: 'Konjungsi atau ijtimak adalah saat bujur ekliptika Bulan sama dengan bujur ekliptika Matahari. Pada saat itu Bulan baru secara astronomis; awal bulan Hijriah ditentukan dengan menilai posisi hilal setelah konjungsi.',
  },
  {
    q: 'Dari mana IAST mendapatkan data posisi Bulan dan Matahari?',
    a: 'Dari NASA JPL Horizons, sistem ephemeris milik Jet Propulsion Laboratory NASA. IAST mengambil vektor posisi (EPHEM_TYPE=VECTORS) lalu mentransformasikannya sendiri ke koordinat tampak untuk lokasi pengamat.',
  },
  {
    q: 'Bagaimana algoritma Newton-Raphson dipakai?',
    a: 'Waktu konjungsi adalah akar dari fungsi selisih bujur ekliptika Bulan dan Matahari. IAST memindai selisih itu per 6 jam untuk menemukan interval tempat tanda berganti (bracket), lalu menyempurnakannya dengan Newton-Raphson memakai turunan numerik central difference dengan langkah 60 detik sampai konvergen.',
  },
  {
    q: 'Apa kriteria wujudul hilal dan KHGT?',
    a: 'Wujudul hilal menilai apakah konjungsi terjadi sebelum Matahari terbenam dan Bulan sudah berada di atas ufuk saat Matahari terbenam. KHGT (Kalender Hijriah Global Tunggal) menilai apakah, di lokasi mana pun di Bumi, tinggi Bulan ≥ 5° dan elongasi dari Matahari ≥ 8° pada saat Matahari terbenam.',
  },
  {
    q: 'Apa itu istikmal?',
    a: 'Istikmal adalah penyempurnaan bulan menjadi 30 hari ketika kriteria awal bulan tidak terpenuhi pada hari ke-29, sehingga awal bulan berikutnya jatuh sehari kemudian.',
  },
];

function jsonLd() {
  const personId = `${SITE_URL}/#penulis`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        headline: 'Metode Hisab Awal Ramadan: Konjungsi, Newton-Raphson, dan NASA JPL Horizons',
        about: THESIS_TITLE_ID,
        inLanguage: 'id',
        url: `${SITE_URL}/metode`,
        author: { '@id': personId },
        isPartOf: { '@id': `${SITE_URL}/#situs` },
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_SHORT, item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Metode', item: `${SITE_URL}/metode` },
        ],
      },
    ],
  };
}

const h2 = 'mt-10 mb-3 text-xl font-semibold text-[#d8f5f5]';
const p = 'mb-4 leading-relaxed text-slate-300';

export default function MetodePage() {
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()).replace(/</g, '\\u003c') }}
      />
      <article className="mx-auto max-w-3xl px-5 py-12 text-[15px]">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.3em] text-[#7fd7dc]">
          {SITE_NAME} · {SITE_SHORT}
        </p>
        <h1 className="mb-4 text-3xl font-bold leading-tight text-white">
          Metode Hisab Awal Ramadan: Konjungsi, Newton-Raphson, dan NASA JPL Horizons
        </h1>
        <p className={p}>
          Halaman ini menjelaskan bagaimana sistem {SITE_SHORT} menghitung awal Ramadan. Metode ini
          dikembangkan oleh {AUTHOR_NAME} sebagai bagian dari skripsi S1 Data Sains berjudul{' '}
          <em>“{THESIS_TITLE_ID}”</em>.
        </p>

        <h2 className={h2}>1. Konjungsi (ijtimak) Bulan–Matahari</h2>
        <p className={p}>
          Konjungsi adalah saat bujur ekliptika Bulan sama dengan bujur ekliptika Matahari. Dari
          sinilah penentuan awal bulan Hijriah dimulai: setelah konjungsi, posisi hilal dinilai saat
          Matahari terbenam menurut kriteria yang dipakai.
        </p>

        <h2 className={h2}>2. Data posisi dari NASA JPL Horizons</h2>
        <p className={p}>
          Posisi Bulan dan Matahari diambil dari <strong>NASA JPL Horizons</strong> sebagai vektor
          posisi (<code>EPHEM_TYPE=VECTORS</code>), lalu direduksi sendiri oleh {SITE_SHORT} ke
          koordinat tampak (presesi, nutasi, dan paralaks topocentric) untuk lokasi pengamat. Hasil
          reduksi ini divalidasi terhadap data pembanding hingga selisih di bawah 0,01°.
        </p>

        <h2 className={h2}>3. Mencari waktu konjungsi dengan Newton-Raphson</h2>
        <p className={p}>
          Waktu konjungsi adalah akar dari fungsi selisih bujur ekliptika Bulan dan Matahari.
          {' '}{SITE_SHORT} memindai selisih tersebut setiap 6 jam untuk menemukan interval tempat
          tandanya berganti (bracket), lalu menyempurnakannya dengan{' '}
          <strong>algoritma Newton-Raphson</strong> memakai turunan numerik{' '}
          <em>central difference</em> dengan langkah 60 detik, berulang sampai konvergen. Setiap
          iterasi dapat diaudit dan diunduh pada halaman{' '}
          <Link className="text-[#7fd7dc] underline" href="/evaluasi-konjungsi">
            Evaluasi Konjungsi Periode
          </Link>
          .
        </p>

        <h2 className={h2}>4. Kriteria: wujudul hilal dan KHGT</h2>
        <p className={p}>
          <strong>Wujudul hilal</strong> menilai apakah konjungsi terjadi sebelum Matahari terbenam
          dan Bulan sudah berada di atas ufuk saat Matahari terbenam.{' '}
          <strong>KHGT (Kalender Hijriah Global Tunggal)</strong> menilai apakah di lokasi mana pun
          di Bumi tinggi Bulan ≥ 5° dan elongasi dari Matahari ≥ 8° pada saat Matahari terbenam.
          Hasil prediksinya dapat dilihat di halaman{' '}
          <Link className="text-[#7fd7dc] underline" href="/prediksi-ramadan">
            Prediksi Ramadan
          </Link>{' '}
          dan dibandingkan dengan penetapan resmi pada halaman{' '}
          <Link className="text-[#7fd7dc] underline" href="/evaluasi">
            Evaluasi Riwayat Global dan Lokal
          </Link>
          .
        </p>

        <h2 className={h2}>5. Istikmal</h2>
        <p className={p}>
          Bila kriteria tidak terpenuhi pada hari ke-29, bulan disempurnakan menjadi 30 hari
          (istikmal) sehingga awal bulan berikutnya jatuh sehari kemudian.
        </p>

        <h2 className={h2}>Pertanyaan yang sering diajukan</h2>
        <dl>
          {FAQ.map(({ q, a }) => (
            <div key={q} className="mb-5">
              <dt className="mb-1 font-semibold text-[#d8f5f5]">{q}</dt>
              <dd className="leading-relaxed text-slate-300">{a}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 border-t border-white/10 pt-5 text-[13px] text-slate-400">
          Jelajahi juga{' '}
          <Link className="text-[#7fd7dc] underline" href="/astronomy-event">Kalender Peristiwa Astronomi</Link>,{' '}
          <Link className="text-[#7fd7dc] underline" href="/parade-planet">Parade Planet</Link>,{' '}
          <Link className="text-[#7fd7dc] underline" href="/gerhana">Gerhana</Link>,{' '}
          <Link className="text-[#7fd7dc] underline" href="/stellarium">Stellarium View</Link>, dan{' '}
          <Link className="text-[#7fd7dc] underline" href="/about">profil pengembang</Link>.
        </p>
      </article>
    </div>
  );
}
