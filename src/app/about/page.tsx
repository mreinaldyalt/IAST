'use client';

import { useI18n } from '@/components/I18nProvider';
import styles from './page.module.css';

const COPY = {
  id: {
    status: 'DOKUMENTASI SISTEM', eyebrow: 'IDENTITAS · METODE · TEKNOLOGI · 04', title: 'Tentang', subtitle: 'International Astronomical Studies',
    lead: 'IAST adalah platform riset astronomi internasional untuk komputasi peristiwa langit, penelitian kalender Ramadan, dan visualisasi kondisi astronomis berbasis data ilmiah.',
    identity: 'IDENTITAS PROYEK', project: 'Sistem riset astronomi dan proyek Skripsi S1 Data Sains',
    modules: [
      ['Peristiwa Astronomi', 'Kalender tahunan, parade planet, serta laboratorium Gerhana Matahari dan Bulan.'],
      ['Riset Ramadan', 'Prediksi awal Ramadan, evaluasi periode konjungsi, serta komparasi riwayat global dan lokal.'],
      ['Visualisasi Langit', 'Stellarium View dan Tata Surya untuk menelusuri kondisi langit pada waktu tertentu.'],
    ],
    methodHead: '01 / LANDASAN KOMPUTASI', techHead: '03 / TEKNOLOGI', licenseHead: '04 / LISENSI',
    methods: ['Konjungsi Bulan–Matahari dihitung dengan algoritma Newton–Raphson dan validasi bisection.', 'Prediksi KHGT mengevaluasi geometri Bulan, elongasi, ketinggian, waktu maghrib, dan saksi global.', 'Gerhana dihitung dari state vector serta geometri umbra–penumbra untuk kontak dan visibilitas pengamat.', 'Parade planet menilai kesejajaran, jumlah peserta, dan matriks visibilitas berdasarkan waktu serta lokasi.'],
    data: ['NASA/JPL Horizons sebagai sumber ephemeris utama Matahari, Bulan, dan planet.', 'Respons ephemeris divalidasi sebelum digunakan dan disimpan dalam cache agar permintaan berikutnya lebih ringan.', 'Fallback tidak disamarkan sebagai data langsung; status sumber tetap ditampilkan pada hasil.', 'Lokasi, zona waktu, dan visualisasi pengamat diproses secara topocentric bila dibutuhkan.'],
    tech: ['Next.js App Router, React, TypeScript, dan Tailwind CSS.', 'Luxon, SunCalc, tz-lookup, Leaflet, dan OpenStreetMap.', 'Stellarium Web Engine untuk visualisasi langit interaktif.', 'Three.js dan React Three Fiber untuk visualisasi Tata Surya.', 'Vitest untuk pengujian fungsi komputasi.'],
    license: 'Stellarium Web Engine digunakan berdasarkan lisensi AGPL. Data peta memakai OpenStreetMap. Hak dan atribusi masing-masing komponen tetap mengikuti lisensi sumbernya.',
    creator: 'DIRANCANG DAN DIKEMBANGKAN OLEH', degree: 'Proyek untuk memenuhi tugas Skripsi S1 Data Sains',
    thesis: '“KOMPUTASI HISAB PREDIKSI AWAL RAMADAN BERBASIS DATA EPHEMERIS NASA JPL HORIZONS MENGGUNAKAN ALGORITMA NEWTON-RAPHSON”',
    footer: 'INTERNATIONAL ASTRONOMICAL STUDIES · DOKUMENTASI SISTEM',
  },
  en: {
    status: 'SYSTEM DOCUMENTATION', eyebrow: 'IDENTITY · METHODS · TECHNOLOGY · 04', title: 'About', subtitle: 'International Astronomical Studies',
    lead: 'IAST is an international astronomy research platform for celestial-event computation, Ramadan calendar research, and scientific data-driven astronomical visualization.',
    identity: 'PROJECT IDENTITY', project: 'Astronomy research system and Bachelor of Data Science thesis project',
    modules: [
      ['Astronomical Events', 'Annual calendar, planet parades, and a complete solar and lunar eclipse laboratory.'],
      ['Ramadan Research', 'Ramadan-start prediction, conjunction-period evaluation, and global/local historical comparison.'],
      ['Sky Visualization', 'Stellarium View and Solar System tools for exploring the sky at a selected time.'],
    ],
    methodHead: '01 / COMPUTATIONAL FOUNDATION', techHead: '03 / TECHNOLOGY', licenseHead: '04 / LICENSES',
    methods: ['Moon–Sun conjunctions are solved with Newton–Raphson and bisection validation.', 'KHGT prediction evaluates lunar geometry, elongation, altitude, sunset time, and global witnesses.', 'Eclipses use state vectors and umbra–penumbra geometry for contacts and observer visibility.', 'Planet parades evaluate alignment, participant count, and a visibility matrix for the selected time and location.'],
    data: ['NASA/JPL Horizons is the primary ephemeris source for the Sun, Moon, and planets.', 'Ephemeris responses are validated before use and cached to keep subsequent requests lightweight.', 'Fallback data is never presented as live data; provenance remains visible in the results.', 'Observer location, timezone, and topocentric visualization are applied when required.'],
    tech: ['Next.js App Router, React, TypeScript, and Tailwind CSS.', 'Luxon, SunCalc, tz-lookup, Leaflet, and OpenStreetMap.', 'Stellarium Web Engine for interactive sky visualization.', 'Three.js and React Three Fiber for Solar System visualization.', 'Vitest for computational function testing.'],
    license: 'Stellarium Web Engine is used under the AGPL license. Map data is provided by OpenStreetMap. Every component retains the rights and attribution required by its source license.',
    creator: 'DESIGNED AND DEVELOPED BY', degree: 'A Bachelor of Data Science thesis project',
    thesis: '“COMPUTATIONAL HISAB FOR PREDICTING THE START OF RAMADAN BASED ON NASA JPL HORIZONS EPHEMERIS DATA USING THE NEWTON-RAPHSON ALGORITHM”',
    footer: 'INTERNATIONAL ASTRONOMICAL STUDIES · SYSTEM DOCUMENTATION',
  },
} as const;

export default function AboutPage() {
  const { locale } = useI18n();
  const c = COPY[locale];
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" /><div className={styles.grid} aria-hidden="true" />
      <header className={styles.topbar}><div className={styles.brand}>IAST <span>/ ABOUT THE SYSTEM</span></div><div className={styles.status}><i />{c.status}</div></header>
      <main className={styles.content}>
        <section className={styles.hero}>
          <div><p className={styles.eyebrow}>{c.eyebrow}</p><h1>{c.title}<em>{c.subtitle}</em></h1><p className={styles.lead}>{c.lead}</p></div>
          <aside className={styles.identity}><small>{c.identity} / IAST</small><b>International<br />Astronomical Studies</b><p>{c.project}</p></aside>
        </section>
        <section className={styles.missionGrid}>{c.modules.map((module, index) => <article className={styles.missionCard} key={module[0]}><span>0{index + 1} / MODULE</span><i>{['◒', '☾', '✦'][index]}</i><h2>{module[0]}</h2><p>{module[1]}</p></article>)}</section>
        <div className={styles.sectionHead}>{c.methodHead}</div>
        <section className={styles.detailGrid}><Detail title={locale === 'id' ? 'Metodologi Astronomi' : 'Astronomical Methodology'} items={c.methods} /><Detail title={locale === 'id' ? 'Sumber Ephemeris' : 'Ephemeris Sources'} items={c.data} /></section>
        <div className={styles.sectionHead}>{c.techHead}</div>
        <section className={styles.detailGrid}><Detail title={locale === 'id' ? 'Arsitektur Sistem' : 'System Architecture'} items={c.tech} /><div><div className={styles.notice}><b>{c.licenseHead}</b><p>{c.license}</p></div></div></section>
        <div className={styles.sectionHead}>05 / {locale === 'id' ? 'PENGEMBANG' : 'DEVELOPER'}</div>
        <section className={styles.credits}><div className={styles.monogram}>MR</div><div><small>{c.creator}</small><h2>Muhammad Reinaldy Santoso Alaratte</h2><p>{c.degree}</p><blockquote>{c.thesis}</blockquote></div></section>
        <footer className={styles.footer}><span>{c.footer}</span><b>KKCDEV</b></footer>
      </main>
    </div>
  );
}

function Detail({ title, items }: { title: string; items: readonly string[] }) {
  return <article className={styles.detail}><h3>{title}</h3><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></article>;
}
