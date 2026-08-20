'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import styles from './dashboard.module.css';

const MODULES = [
  { id: 'calendar', href: '/astronomy-event', icon: '◫' },
  { id: 'parade', href: '/parade-planet', icon: '⟡' },
  { id: 'eclipse', href: '/gerhana', icon: '◒' },
  { id: 'prediction', href: '/prediksi-ramadan', icon: '☾' },
  { id: 'conjunction', href: '/evaluasi-konjungsi', icon: '◎' },
  { id: 'history', href: '/evaluasi', icon: '⌁' },
  { id: 'stellarium', href: '/stellarium', icon: '✦' },
  { id: 'solar', href: '/solar-system', icon: '◉' },
  { id: 'about', href: '/about', icon: 'ⓘ' },
] as const;

const COPY = {
  id: {
    lab: 'PLATFORM RISET ASTRONOMI ISLAM', status: 'SISTEM SIAP', logo: 'TEMPAT LOGO', logoHint: 'SIAP DIGANTI',
    eyebrow: 'KOMPUTASI · EPHEMERIS · VISUALISASI', acronym: 'IAST', systemLabel: 'SISTEM RISET', projectCode: 'SD / 01',
    intro: 'Satu ruang komputasi untuk menjelajahi peristiwa astronomi, hisab awal Ramadan, evaluasi konjungsi, dan visualisasi langit berbasis data ilmiah.',
    explore: 'JELAJAHI MODUL', prediction: 'BUKA PREDIKSI RAMADAN', modules: 'MODUL TERINTEGRASI', data: 'DATA NASA/JPL', languages: 'DUA BAHASA',
    creatorLabel: 'IDENTITAS PROYEK', builtBy: 'Sistem ini dibuat dan dikembangkan oleh', project: 'sebagai proyek untuk memenuhi tugas Skripsi S1 Data Sains berjudul',
    thesis: '“KOMPUTASI HISAB PREDIKSI AWAL RAMADAN BERBASIS DATA EPHEMERIS NASA JPL HORIZONS MENGGUNAKAN ALGORITMA NEWTON-RAPHSON”',
    sectionNo: '01', section: 'PILIH DESTINASI', sectionHint: 'Arahkan kursor atau sentuh modul untuk melihat ringkasan.',
    active: 'MODUL AKTIF', open: 'BUKA MODUL', footer: 'INTERNATIONAL ASTRONOMICAL STUDIES · PROYEK SKRIPSI DATA SAINS',
    moduleText: {
      calendar: ['Kalender Astronomi', 'Kalender terpadu untuk menelusuri peristiwa astronomi hasil komputasi sistem.'],
      parade: ['Parade Planet', 'Analisis kesejajaran dan visibilitas planet berdasarkan ephemeris NASA/JPL Horizons.'],
      eclipse: ['Gerhana', 'Laboratorium perhitungan Gerhana Matahari dan Bulan beserta kontak serta visibilitas lokal.'],
      prediction: ['Prediksi Ramadan', 'Komputasi awal Ramadan memakai data ephemeris dan algoritma Newton–Raphson.'],
      conjunction: ['Evaluasi Konjungsi', 'Audit konjungsi dalam suatu periode beserta detail numerik dan sumber datanya.'],
      history: ['Evaluasi Riwayat', 'Perbandingan hasil prediksi terhadap riwayat global, lokal, dan sumber resmi.'],
      stellarium: ['Tampilan Stellarium', 'Eksplorasi interaktif posisi benda langit dari sudut pandang pengamat.'],
      solar: ['Tata Surya', 'Visualisasi spasial planet, orbit, skala, dan perjalanan waktu simulasi.'],
      about: ['Tentang Sistem', 'Metode, referensi, lisensi, serta informasi pengembangan sistem.'],
    },
  },
  en: {
    lab: 'INTERNATIONAL ASTRONOMY RESEARCH PLATFORM', status: 'SYSTEM READY', logo: 'LOGO PLACEHOLDER', logoHint: 'READY TO REPLACE',
    eyebrow: 'COMPUTATION · EPHEMERIS · VISUALIZATION', acronym: 'IAST', systemLabel: 'RESEARCH SYSTEM', projectCode: 'DS / 01',
    intro: 'A unified computational space for exploring astronomical events, the start of Ramadan, conjunction evaluation, and scientific sky visualization.',
    explore: 'EXPLORE MODULES', prediction: 'OPEN RAMADAN PREDICTION', modules: 'INTEGRATED MODULES', data: 'NASA/JPL DATA', languages: 'TWO LANGUAGES',
    creatorLabel: 'PROJECT IDENTITY', builtBy: 'This system was created and developed by', project: 'as a project submitted in fulfillment of the Bachelor of Data Science thesis entitled',
    thesis: '“COMPUTATIONAL HISAB FOR PREDICTING THE START OF RAMADAN BASED ON NASA JPL HORIZONS EPHEMERIS DATA USING THE NEWTON–RAPHSON ALGORITHM”',
    sectionNo: '01', section: 'SELECT A DESTINATION', sectionHint: 'Hover, focus, or touch a module to preview its purpose.',
    active: 'ACTIVE MODULE', open: 'OPEN MODULE', footer: 'INTERNATIONAL ASTRONOMICAL STUDIES · DATA SCIENCE THESIS PROJECT',
    moduleText: {
      calendar: ['Astronomy Calendar', 'An integrated calendar for exploring astronomical events computed by the system.'],
      parade: ['Planet Parade', 'Planet alignment and visibility analysis based on NASA/JPL Horizons ephemerides.'],
      eclipse: ['Eclipse', 'A solar and lunar eclipse laboratory with contact phases and local visibility.'],
      prediction: ['Ramadan Prediction', 'Computes the start of Ramadan using ephemeris data and the Newton–Raphson algorithm.'],
      conjunction: ['Conjunction Evaluation', 'Audits conjunctions over a period with numerical details and data provenance.'],
      history: ['History Evaluation', 'Compares predictions with global, local, and official historical records.'],
      stellarium: ['Stellarium View', 'Interactively explores celestial positions from an observer’s point of view.'],
      solar: ['Solar System', 'Spatial visualization of planets, orbits, scales, and simulated time travel.'],
      about: ['About the System', 'Methods, references, licenses, and system development information.'],
    },
  },
} as const;

export default function DashboardPage() {
  const { locale, toggleLocale } = useI18n();
  const c = COPY[locale];
  const [activeId, setActiveId] = useState<(typeof MODULES)[number]['id']>('prediction');
  const active = MODULES.find((module) => module.id === activeId) ?? MODULES[3];
  const activeText = c.moduleText[active.id];

  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.gridOverlay} aria-hidden="true" />

      <header className={styles.topbar}>
        <div className={styles.miniBrand}><b>IAST</b><span>{c.lab}</span></div>
        <div className={styles.topActions}>
          <span className={styles.status}><i />{c.status}</span>
          <button type="button" onClick={toggleLocale} aria-label={locale === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}>
            {locale === 'id' ? 'EN' : 'ID'}
          </button>
        </div>
      </header>

      <main className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroMain}>
            <p className={styles.eyebrow}>{c.eyebrow}</p>
            <div className={styles.titleRow}>
              <div className={styles.logoSlot} aria-label={c.logo}>
                <span>{c.logo}</span><small>{c.logoHint}</small>
              </div>
              <div>
                <h1>International Astronomical<br />Studies <em>[IAST]</em></h1>
                <span className={styles.acronym}>{c.acronym} / {c.systemLabel}</span>
              </div>
            </div>
            <p className={styles.intro}>{c.intro}</p>
            <div className={styles.ctaRow}>
              <a className={styles.primaryCta} href="#modules">{c.explore}<b>↓</b></a>
              <Link className={styles.secondaryCta} href="/prediksi-ramadan">{c.prediction}<b>↗</b></Link>
            </div>
            <div className={styles.stats}>
              <div><strong>09</strong><span>{c.modules}</span></div>
              <div><strong>JPL</strong><span>{c.data}</span></div>
              <div><strong>ID/EN</strong><span>{c.languages}</span></div>
            </div>
          </div>

          <aside className={styles.identityCard}>
            <div className={styles.cardHeader}><span>{c.creatorLabel}</span><b>{c.projectCode}</b></div>
            <div className={styles.authorMark}>MR</div>
            <p>{c.builtBy}</p>
            <h2>Muhammad Reinaldy<br />Santoso Alaratte</h2>
            <p>{c.project}</p>
            <blockquote>{c.thesis}</blockquote>
          </aside>
        </section>

        <section className={styles.modulesSection} id="modules">
          <div className={styles.sectionHeader}>
            <div><span>{c.sectionNo}</span><h2>{c.section}</h2></div>
            <p>{c.sectionHint}</p>
          </div>

          <div className={styles.moduleLayout}>
            <div className={styles.moduleGrid}>
              {MODULES.map((module, index) => {
                const text = c.moduleText[module.id];
                const selected = activeId === module.id;
                return (
                  <Link
                    key={module.id}
                    href={module.href}
                    className={`${styles.moduleCard} ${selected ? styles.selected : ''}`}
                    onMouseEnter={() => setActiveId(module.id)}
                    onFocus={() => setActiveId(module.id)}
                    onTouchStart={() => setActiveId(module.id)}
                  >
                    <span className={styles.moduleIndex}>{String(index + 1).padStart(2, '0')}</span>
                    <b className={styles.moduleIcon}>{module.icon}</b>
                    <h3>{text[0]}</h3>
                    <p>{text[1]}</p>
                    <i>↗</i>
                  </Link>
                );
              })}
            </div>

            <aside className={styles.activePanel}>
              <div className={styles.activeOrbit}><span>{active.icon}</span></div>
              <small>{c.active} / {activeText[0].toUpperCase()}</small>
              <h3>{activeText[0]}</h3>
              <p>{activeText[1]}</p>
              <Link href={active.href}>{c.open}<b>↗</b></Link>
            </aside>
          </div>
        </section>
      </main>

      <footer className={styles.footer}><span>{c.footer}</span><b>KKCDEV</b></footer>
    </div>
  );
}
