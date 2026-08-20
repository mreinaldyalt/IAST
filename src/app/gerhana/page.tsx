'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import CitySearch, { type CityLocation } from '@/components/CitySearch';
import styles from './page.module.css';

type EclipseKind = 'solar' | 'lunar';

interface ContactResult { code: string; label: string; timeUTC: string; altitudeDeg?: number; azimuthDeg?: number }
interface EclipseData {
  kind: EclipseKind; eclipseType: string; eclipseTypeLabel: string; greatestEclipseUTC: string; contacts: ContactResult[];
  magnitude: number; obscurationPercent: number | null; durationMinutes: number | null;
  geometry: { axisDistanceKm: number; gamma: number; sunDistanceKm: number; moonDistanceKm: number; sunAngularRadiusDeg: number; moonAngularRadiusDeg: number; umbraRadiusKm: number; penumbraRadiusKm: number };
  observer: { visible: boolean; localType: string; localTypeLabel: string; maximumAltitudeDeg: number; maximumAzimuthDeg: number; localMagnitude: number | null; localObscurationPercent: number | null; contacts: ContactResult[] };
  centralPoint: { latitude: number; longitude: number } | null;
  provenance: { source: 'live' | 'cache'; provider: string; ephemerisType: string; referenceFrame: string };
  method: { candidateCount: number; coarseStepMinutes: number; detailStepMinutes: number; contactInterpolation: string; shadowModel: string };
}

const COPY = {
  id: {
    brand: 'IAST / LAB GERHANA', status: 'TAUTAN NASA HORIZONS', eyebrow: 'KOMPUTASI BAYANGAN LANGIT · 01', title: 'GERHANA', subtitle: 'LABORATORIUM BAYANGAN LANGIT',
    intro: 'Telusuri gerhana Matahari dan Bulan dari vektor keadaan NASA/JPL Horizons—mulai dari kandidat fase, geometri umbra–penumbra, kontak, hingga visibilitas pengamat.',
    vectorData: 'VEKTOR / ICRF', vectorTable: 'VEKTOR', sunData: 'MATAHARI 10', moonData: 'BULAN 301', control: 'PUSAT KENDALI', search: 'CARI GERHANA BERIKUTNYA', kindLabel: 'Jenis gerhana', sun: 'Matahari', moon: 'Bulan',
    location: 'Lokasi pengamat (opsional)', globalLocation: 'Global — UTC saja', locationHint: 'Pilih lokasi untuk menambahkan waktu lokal dan analisis visibilitas pengamat.',
    start: 'Tanggal awal', range: 'Rentang pencarian', latitude: 'Lintang pengamat', longitude: 'Bujur pengamat', month: 'bulan', connecting: 'MENGHUBUNGKAN NASA…', calculate: 'MULAI KALKULASI',
    noFallback: 'Tidak memakai data simulasi pengganti. Jika NASA tidak tersedia, hasil tidak akan dibuat.', loadingTitle: 'Menelusuri simpul orbit', loadingText: 'Mengambil vektor Matahari dan Bulan, lalu menyelesaikan geometri bayangan…', interrupted: 'TAUTAN TERPUTUS', failed: 'Kalkulasi gerhana gagal.',
    missionResult: 'HASIL MISI', greatest: 'PUNCAK GERHANA', magnitude: 'Magnitudo', gamma: 'Gamma', globalDuration: 'Durasi global', maxObscuration: 'Obskurasi maks.', minutes: ' mnt',
    nasaLive: 'NASA LANGSUNG', nasaCache: 'CACHE NASA SAH', docs: 'DOKUMENTASI ↗', contacts: 'KRONOLOGI KONTAK', altitudeShort: 'Tinggi', observer: 'PENGAMAT', visible: 'TERLIHAT', notVisible: 'TIDAK TERLIHAT',
    solarSystemLink: 'LIHAT DI TATA SURYA', stellariumLink: 'BUKA DI STELLARIUM', visualizationHint: 'Visualisasi dibuka tepat pada waktu puncak gerhana.',
    visibility: 'Visibilitas dari koordinat Anda', maxAltitude: 'Ketinggian maksimum', maxAzimuth: 'Azimut maksimum', localMagnitude: 'Magnitudo lokal', localObscuration: 'Obskurasi lokal', geometry: 'GEOMETRI', shadowDimensions: 'Dimensi bayangan', axisDistance: 'Jarak sumbu', umbraRadius: 'Radius umbra', penumbraRadius: 'Radius penumbra', moonDistance: 'Jarak Bulan',
    pipeline: 'ALUR PERHITUNGAN', methodSummary: 'Catatan metode dan batas akurasi', methodNote: 'Kalkulasi ini mandiri berbasis ephemeris Horizons dan bukan pengganti buletin resmi gerhana berbasis elemen Besselian.', localNotVisible: 'Tidak Terlihat dari Lokasi', localTotal: 'Total di Lokasi', localAnnular: 'Cincin di Lokasi', localPartial: 'Sebagian di Lokasi', localLunarVisible: 'terlihat dari lokasi', jakarta: 'WIB', solarWord: 'MATAHARI', lunarWord: 'BULAN', degreeUnit: 'DER',
  },
  en: {
    brand: 'IAST / ECLIPSE LAB', status: 'NASA HORIZONS LINK', eyebrow: 'CELESTIAL SHADOW COMPUTATION · 01', title: 'ECLIPSE', subtitle: 'CELESTIAL SHADOW LABORATORY',
    intro: 'Explore solar and lunar eclipses from NASA/JPL Horizons state vectors—from phase candidates and umbra–penumbra geometry to contact times and observer visibility.',
    vectorData: 'VECTOR / ICRF', vectorTable: 'VECTORS', sunData: 'SUN 10', moonData: 'MOON 301', control: 'MISSION CONTROL', search: 'SEARCH NEXT ECLIPSE', kindLabel: 'Eclipse type', sun: 'Solar', moon: 'Lunar',
    location: 'Observer location (optional)', globalLocation: 'Global — UTC only', locationHint: 'Select a location to add local time and observer visibility analysis.',
    start: 'Start date', range: 'Search range', latitude: 'Observer latitude', longitude: 'Observer longitude', month: 'months', connecting: 'CONNECTING TO NASA…', calculate: 'START CALCULATION',
    noFallback: 'No simulation fallback is used. If NASA is unavailable, no result will be generated.', loadingTitle: 'Tracing orbital nodes', loadingText: 'Fetching Sun and Moon vectors, then solving the shadow geometry…', interrupted: 'LINK INTERRUPTED', failed: 'Eclipse calculation failed.',
    missionResult: 'MISSION RESULT', greatest: 'GREATEST ECLIPSE', magnitude: 'Magnitude', gamma: 'Gamma', globalDuration: 'Global duration', maxObscuration: 'Max. obscuration', minutes: ' min',
    nasaLive: 'NASA LIVE', nasaCache: 'NASA VALID CACHE', docs: 'DOCUMENTATION ↗', contacts: 'CONTACT CHRONOLOGY', altitudeShort: 'Alt', observer: 'OBSERVER', visible: 'VISIBLE', notVisible: 'NOT VISIBLE',
    solarSystemLink: 'VIEW IN SOLAR SYSTEM', stellariumLink: 'OPEN IN STELLARIUM', visualizationHint: 'The visualization opens at the exact greatest-eclipse time.',
    visibility: 'Visibility from your coordinates', maxAltitude: 'Maximum altitude', maxAzimuth: 'Maximum azimuth', localMagnitude: 'Local magnitude', localObscuration: 'Local obscuration', geometry: 'GEOMETRY', shadowDimensions: 'Shadow dimensions', axisDistance: 'Axis distance', umbraRadius: 'Umbra radius', penumbraRadius: 'Penumbra radius', moonDistance: 'Moon distance',
    pipeline: 'CALCULATION PIPELINE', methodSummary: 'Method and accuracy notes', methodNote: 'This is an independent Horizons ephemeris computation and does not replace an official eclipse bulletin based on Besselian elements.', localNotVisible: 'Not Visible from Location', localTotal: 'Total at Location', localAnnular: 'Annular at Location', localPartial: 'Partial at Location', localLunarVisible: 'visible from location', jakarta: 'Jakarta', solarWord: 'SOLAR', lunarWord: 'LUNAR', degreeUnit: 'DEG',
  },
} as const;

const ECLIPSE_NAMES = {
  id: { solar: { total: 'Gerhana Matahari Total', annular: 'Gerhana Matahari Cincin', hybrid: 'Gerhana Matahari Hibrida', partial: 'Gerhana Matahari Sebagian' }, lunar: { total: 'Gerhana Bulan Total', partial: 'Gerhana Bulan Sebagian', penumbral: 'Gerhana Bulan Penumbra' } },
  en: { solar: { total: 'Total Solar Eclipse', annular: 'Annular Solar Eclipse', hybrid: 'Hybrid Solar Eclipse', partial: 'Partial Solar Eclipse' }, lunar: { total: 'Total Lunar Eclipse', partial: 'Partial Lunar Eclipse', penumbral: 'Penumbral Lunar Eclipse' } },
} as const;

const CONTACT_NAMES = {
  id: {
    solar: { P1: 'Kontak global pertama', U1: 'Fase sentral dimulai', MAX: 'Puncak gerhana', U4: 'Fase sentral berakhir', P4: 'Kontak global terakhir' },
    lunar: { P1: 'Penumbra dimulai', U1: 'Gerhana sebagian dimulai', U2: 'Totalitas dimulai', MAX: 'Puncak gerhana', U3: 'Totalitas berakhir', U4: 'Gerhana sebagian berakhir', P4: 'Penumbra berakhir' },
  },
  en: {
    solar: { P1: 'First global contact', U1: 'Central phase begins', MAX: 'Greatest eclipse', U4: 'Central phase ends', P4: 'Last global contact' },
    lunar: { P1: 'Penumbral phase begins', U1: 'Partial phase begins', U2: 'Totality begins', MAX: 'Greatest eclipse', U3: 'Totality ends', U4: 'Partial phase ends', P4: 'Penumbral phase ends' },
  },
} as const;

const today = new Date().toISOString().slice(0, 10);

function eclipseName(data: EclipseData, locale: 'id' | 'en') {
  const names = ECLIPSE_NAMES[locale][data.kind] as Record<string, string>;
  return names[data.eclipseType] ?? data.eclipseTypeLabel;
}

function contactName(data: EclipseData, code: string, locale: 'id' | 'en') {
  const names = CONTACT_NAMES[locale][data.kind] as Record<string, string>;
  return names[code] ?? code;
}

function formatDate(iso: string, locale: 'id' | 'en', timeZone = 'UTC') {
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { dateStyle: 'long', timeStyle: 'short', timeZone, hourCycle: 'h23' }).format(new Date(iso));
}

function formatZoneName(iso: string, locale: 'id' | 'en', timeZone: string) {
  const parts = new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date(iso));
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
}

function toLocalDateTimeInput(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}`;
}

function formatNumber(value: number, locale: 'id' | 'en', digits = 3) {
  return new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: digits }).format(value);
}

function Metric({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}{suffix && <small>{suffix}</small>}</strong></div>;
}

export default function EclipsePage() {
  const { locale } = useI18n();
  const c = COPY[locale];
  const [kind, setKind] = useState<EclipseKind>('solar');
  const [start, setStart] = useState(today);
  const [months, setMonths] = useState('12');
  const [selectedLocation, setSelectedLocation] = useState<CityLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<EclipseData | null>(null);
  const [resultLocation, setResultLocation] = useState<CityLocation | null>(null);

  // Deep-link dari Kalender Astronomi: /gerhana?type=solar|lunar&start=YYYY-MM-DD
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedType = params.get('type');
    const linkedStart = params.get('start');
    if (linkedType === 'solar' || linkedType === 'lunar') setKind(linkedType);
    if (linkedStart && /^\d{4}-\d{2}-\d{2}$/.test(linkedStart)) setStart(linkedStart);
  }, []);

  const diagramClass = useMemo(() => {
    if (!result) return '';
    return result.eclipseType === 'total' ? styles.total : result.eclipseType === 'annular' ? styles.annular : result.eclipseType === 'hybrid' ? styles.hybrid : styles.partial;
  }, [result]);
  const localLabel = result ? (!result.observer.visible ? c.localNotVisible : result.kind === 'lunar' ? `${eclipseName(result, locale)} ${c.localLunarVisible}` : result.observer.localType === 'total' ? c.localTotal : result.observer.localType === 'annular' ? c.localAnnular : c.localPartial) : '';
  const processSteps = result ? (locale === 'id' ? [
    ['01', 'Benih fase', `${result.method.candidateCount} kandidat konjungsi/oposisi disusun dalam rentang pilihan.`],
    ['02', 'Vektor NASA', 'Vektor geosentrik Matahari (10) dan Bulan (301) diambil dalam kerangka ICRF.'],
    ['03', 'Kerucut bayangan', 'Sumbu serta radius umbra–penumbra dihitung pada bidang Bumi atau Bulan.'],
    ['04', 'Pendekatan terdekat', `Puncak dipindai setiap ${result.method.detailStepMinutes} menit dan diperhalus dengan minimum parabola.`],
    ['05', 'Penyelesai kontak', 'Akar batas singgung setiap fase diinterpolasi dari perubahan tanda fungsi jarak.'],
    ['06', 'Kerangka lokal', resultLocation ? 'Posisi pengamat WGS-84 dirotasi ke ICRF untuk ketinggian, azimut, dan fase lokal.' : 'Analisis lokal dinonaktifkan karena lokasi pengamat belum dipilih.'],
  ] : [
    ['01', 'Phase seeds', `${result.method.candidateCount} conjunction/opposition candidates are generated within the selected range.`],
    ['02', 'NASA vectors', 'Geocentric Sun (10) and Moon (301) vectors are retrieved in the ICRF frame.'],
    ['03', 'Shadow cone', 'The axis and umbra–penumbra radii are solved at the Earth or Moon plane.'],
    ['04', 'Closest approach', `The peak is scanned every ${result.method.detailStepMinutes} minutes and refined with a parabolic minimum.`],
    ['05', 'Contact solver', 'Each tangency boundary is interpolated from a sign change in the distance function.'],
    ['06', 'Local frame', resultLocation ? 'The WGS-84 observer position is rotated into ICRF for altitude, azimuth, and local phases.' : 'Local analysis is disabled until an observer location is selected.'],
  ]) : [];

  async function calculate(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(''); setResult(null);
    try {
      const params = new URLSearchParams({ type: kind, start, months, lat: String(selectedLocation?.latitude ?? 0), lon: String(selectedLocation?.longitude ?? 0) });
      const response = await fetch(`/api/eclipse?${params}`, { signal: AbortSignal.timeout(60000) });
      const payload = await response.json();
      if (!response.ok) throw new Error(locale === 'en' ? c.failed : payload.error || c.failed);
      setResult(payload);
      setResultLocation(selectedLocation);
      requestAnimationFrame(() => document.getElementById('eclipse-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (caught) { setError(locale === 'en' ? c.failed : caught instanceof Error ? caught.message : c.failed); }
    finally { setLoading(false); }
  }

  const n = (value: number, digits = 3) => formatNumber(value, locale, digits);
  const visualizationLat = resultLocation?.latitude ?? result?.centralPoint?.latitude ?? 0;
  const visualizationLon = resultLocation?.longitude ?? result?.centralPoint?.longitude ?? 0;
  const visualizationZone = resultLocation?.timeZone ?? 'UTC';
  const stellariumHref = result ? `/stellarium?${new URLSearchParams({
    lat: String(visualizationLat),
    lon: String(visualizationLon),
    tz: visualizationZone,
    datetime: toLocalDateTimeInput(result.greatestEclipseUTC, visualizationZone),
  })}` : '/stellarium';

  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" /><div className={styles.scanline} aria-hidden="true" />
      <header className={styles.topbar}><div className={styles.brand}>{c.brand.split(' / ')[0]} <span>/ {c.brand.split(' / ')[1]}</span></div><div className={styles.systemStatus}><i /> {c.status}</div></header>
      <main className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{c.eyebrow}</p><h1>{c.title}<span>{c.subtitle}</span></h1><p className={styles.intro}>{c.intro}</p>
            <div className={styles.dataRail}><span>{c.vectorData}</span><span>{c.sunData}</span><span>{c.moonData}</span><span>WGS-84</span></div>
          </div>
          <form className={styles.console} onSubmit={calculate}>
            <div className={styles.consoleHeader}><span>{c.control}</span><small>{c.search}</small></div>
            <div className={styles.segmented} aria-label={c.kindLabel}>
              <button type="button" className={kind === 'solar' ? styles.active : ''} onClick={() => setKind('solar')}><b>☀</b><span>{c.sun}</span></button>
              <button type="button" className={kind === 'lunar' ? styles.active : ''} onClick={() => setKind('lunar')}><b>◐</b><span>{c.moon}</span></button>
            </div>
            <div className={styles.formGrid}>
              <label><span>{c.start}</span><input type="date" value={start} min="1972-01-01" max="2100-12-31" onChange={(event) => setStart(event.target.value)} required /></label>
              <label><span>{c.range}</span><select value={months} onChange={(event) => setMonths(event.target.value)}>{[3,6,12,24].map((value) => <option key={value} value={value}>{value} {c.month}</option>)}</select></label>
              <div className={styles.locationField}><CitySearch locale={locale} value={selectedLocation} onChange={setSelectedLocation} /></div>
            </div>
            <button className={styles.launch} disabled={loading}><span>{loading ? c.connecting : c.calculate}</span><b>{loading ? '•••' : '↗'}</b></button><p className={styles.consoleNote}>{c.noFallback}</p>
          </form>
        </section>

        {loading && <section className={styles.loadingPanel} aria-live="polite"><div className={styles.loaderOrbit}><i /><b /></div><div><strong>{c.loadingTitle}</strong><span>{c.loadingText}</span></div></section>}
        {error && <div className={styles.error} role="alert"><b>{c.interrupted}</b><span>{error}</span></div>}

        {result && <section className={styles.results} id="eclipse-result">
          <div className={styles.resultHero}>
            <div className={styles.resultTitle}><p>{c.missionResult} · {result.kind === 'solar' ? c.solarWord : c.lunarWord}</p><h2>{eclipseName(result, locale)}</h2><time>{formatDate(result.greatestEclipseUTC, locale)} UTC</time>{resultLocation && <span>{resultLocation.displayName} · {formatDate(result.greatestEclipseUTC, locale, resultLocation.timeZone)} {formatZoneName(result.greatestEclipseUTC, locale, resultLocation.timeZone)}</span>}</div>
            <div className={`${styles.eclipseVisual} ${diagramClass}`} aria-label={eclipseName(result, locale)}><div className={styles.orbitRing} /><div className={styles.sunDisc} /><div className={styles.moonDisc} /><small>{c.greatest}</small></div>
            <div className={styles.primaryMetrics}><Metric label={c.magnitude} value={n(result.magnitude,4)} /><Metric label={c.gamma} value={n(result.geometry.gamma,4)} /><Metric label={c.globalDuration} value={result.durationMinutes ? n(result.durationMinutes,1) : '—'} suffix={result.durationMinutes ? c.minutes : ''} /><Metric label={c.maxObscuration} value={result.obscurationPercent === null ? '—' : n(result.obscurationPercent,2)} suffix={result.obscurationPercent === null ? '' : '%'} /></div>
          </div>
          <div className={styles.provenanceBar}><span><i /> {result.provenance.source === 'live' ? c.nasaLive : c.nasaCache}</span><b>JPL HORIZONS · {c.vectorTable} · {result.provenance.referenceFrame}</b><a href="https://ssd-api.jpl.nasa.gov/doc/horizons.html" target="_blank" rel="noreferrer">{c.docs}</a></div>
          <div className={styles.resultActions}><div><b>{c.visualizationHint}</b><span>{resultLocation ? resultLocation.displayName : result.centralPoint ? (locale === 'id' ? 'Titik pusat global · UTC' : 'Global central point · UTC') : (locale === 'id' ? 'Referensi global · UTC' : 'Global reference · UTC')}</span></div><Link href={`/solar-system?t=${Date.parse(result.greatestEclipseUTC)}`}>{c.solarSystemLink}<b>↗</b></Link><Link href={stellariumHref}>{c.stellariumLink}<b>↗</b></Link></div>
          <div className={styles.sectionLabel}><span>01</span> {c.contacts}</div>
          <div className={styles.timeline}>{result.contacts.map((item,index) => <div className={styles.contact} key={`${item.code}-${item.timeUTC}`}><div className={styles.contactDot}>{item.code}</div>{index < result.contacts.length-1 && <i />}<strong>{new Date(item.timeUTC).toISOString().slice(11,19)}</strong><span>{contactName(result,item.code,locale)}</span>{resultLocation && item.altitudeDeg !== undefined && <small>{c.altitudeShort} {n(item.altitudeDeg,1)}°</small>}</div>)}</div>
          <div className={`${styles.resultGrid} ${resultLocation ? '' : styles.globalResultGrid}`}>
            {resultLocation && <article className={styles.glassPanel}><div className={styles.panelHead}><span>02 / {c.observer}</span><b>{result.observer.visible ? c.visible : c.notVisible}</b></div><h3>{c.visibility} · {resultLocation.name}</h3><p className={result.observer.visible ? styles.good : styles.muted}>{localLabel}</p><div className={styles.compactMetrics}><Metric label={c.maxAltitude} value={n(result.observer.maximumAltitudeDeg,2)} suffix="°" /><Metric label={c.maxAzimuth} value={n(result.observer.maximumAzimuthDeg,2)} suffix="°" /><Metric label={c.localMagnitude} value={result.observer.localMagnitude === null ? '—' : n(result.observer.localMagnitude,4)} /><Metric label={c.localObscuration} value={result.observer.localObscurationPercent === null ? '—' : n(result.observer.localObscurationPercent,2)} suffix={result.observer.localObscurationPercent === null ? '' : '%'} /></div></article>}
            <article className={styles.glassPanel}><div className={styles.panelHead}><span>03 / {c.geometry}</span><b>KM / {c.degreeUnit}</b></div><h3>{c.shadowDimensions}</h3><div className={styles.compactMetrics}><Metric label={c.axisDistance} value={n(result.geometry.axisDistanceKm,1)} suffix=" km" /><Metric label={c.umbraRadius} value={n(result.geometry.umbraRadiusKm,1)} suffix=" km" /><Metric label={c.penumbraRadius} value={n(result.geometry.penumbraRadiusKm,1)} suffix=" km" /><Metric label={c.moonDistance} value={n(result.geometry.moonDistanceKm,0)} suffix=" km" /></div></article>
          </div>
          <div className={styles.sectionLabel}><span>04</span> {c.pipeline}</div><div className={styles.processGrid}>{processSteps.map(([step,title,copy]) => <article key={step}><b>{step}</b><h4>{title}</h4><p>{copy}</p></article>)}</div>
          <details className={styles.methodNote}><summary>{c.methodSummary}</summary><p>{c.methodNote}</p></details>
        </section>}
      </main>
    </div>
  );
}
