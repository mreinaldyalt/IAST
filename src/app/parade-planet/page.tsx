'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import CitySearch, { type CityLocation } from '@/components/CitySearch';
import type { ParadeResult, ParadeLocationResult, ParadePlanetId, OpticalClass, PlanetVisibility } from '@/lib/parade/types';
import type { ParadeCatalogEvent } from '@/lib/parade/annualCandidate';
import { computeBodiesAt } from '@/lib/solar-system/ephemeris';
import { PLANET_IDS, PLANET_VISUALS, type PlanetId } from '@/lib/solar-system/types';
import styles from './page.module.css';

type ParadeErrorCode = 'compute';

const today = new Date().toISOString().slice(0, 10);

const PLANET_NAME: Record<'en' | 'id', Record<ParadePlanetId, string>> = {
  en: { mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune' },
  id: { mercury: 'Merkurius', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturnus', uranus: 'Uranus', neptune: 'Neptunus' },
};

const SOLAR_SYSTEM_NAME: Record<'en' | 'id', Record<PlanetId, string>> = {
  en: { mercury: 'Mercury', venus: 'Venus', earth: 'Earth', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune' },
  id: { mercury: 'Merkurius', venus: 'Venus', earth: 'Bumi', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturnus', uranus: 'Uranus', neptune: 'Neptunus' },
};

// Visual (not physical-distance) radii match the Solar System overview: orbital
// order is preserved while outer planets remain readable in a compact diagram.
const ORBIT_RADIUS: Record<PlanetId, number> = {
  mercury: 10, venus: 14.5, earth: 19, mars: 24, jupiter: 30, saturn: 35, uranus: 39.5, neptune: 44,
};

const OPTICAL_LABEL: Record<'en' | 'id', Record<OpticalClass, string>> = {
  en: { 'naked-eye': 'Naked eye', 'aided-recommended': 'Optics advised', 'telescope-required': 'Telescope' },
  id: { 'naked-eye': 'Mata telanjang', 'aided-recommended': 'Disarankan alat', 'telescope-required': 'Wajib teleskop' },
};

function fmtLocalTime(iso: string | null): string {
  if (!iso) return '—';
  return iso.replace('T', ' ');
}

function dataSourceLabel(source: string, id: boolean): string {
  if (source === 'live') return id ? 'NASA langsung' : 'NASA live';
  if (source === 'cache') return id ? 'Cache NASA terverifikasi' : 'Verified NASA cache';
  if (source === 'mock') return id ? 'Data pengembangan' : 'Development data';
  return source;
}

function localizedWarning(warning: string, id: boolean): string {
  if (id) return warning;
  const incomplete = warning.match(/^Verifikasi topocentric tak lengkap untuk (.+)$/);
  if (incomplete) return `Topocentric verification was incomplete for ${incomplete[1]}`;
  const failed = warning.match(/^Verifikasi topocentric gagal untuk (.+) — memakai konversi lokal$/);
  if (failed) return `Topocentric verification failed for ${failed[1]} — local conversion was used`;
  return 'A verification warning was reported during the computation.';
}

/** Status observasi satu planet (warna + label), berbasis field baru. */
function planetStatus(p: PlanetVisibility, id: boolean) {
  if (!p.aboveHorizon) {
    return <span className={styles.statusMuted}>{id ? 'Di bawah ufuk' : 'Below horizon'}</span>;
  }
  if (p.opticalClass === 'telescope-required') {
    return <span className={styles.statusOptic}>{id ? 'Perlu teleskop' : 'Telescope needed'}</span>;
  }
  if (p.opticalClass === 'aided-recommended') {
    return <span className={styles.statusOptic}>{id ? 'Perlu binokular' : 'Binoculars needed'}</span>;
  }
  // naked-eye
  if (p.nearSun) {
    return <span className={styles.statusCaution}>{id ? 'Mata telanjang (dekat Matahari)' : 'Naked-eye (near Sun)'}</span>;
  }
  if (!p.wellPlaced) {
    return <span className={styles.statusVisible}>{id ? 'Mata telanjang (rendah)' : 'Naked-eye (low)'}</span>;
  }
  return <span className={styles.statusVisible}>{id ? 'Mata telanjang' : 'Naked-eye'}</span>;
}

export default function ParadePlanetPage() {
  const { locale } = useI18n();
  const id = locale === 'id';

  const [start, setStart] = useState(today);
  const [months, setMonths] = useState('12');
  const [location, setLocation] = useState<CityLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<ParadeErrorCode | null>(null);
  const [result, setResult] = useState<ParadeResult | null>(null);
  const [catalog, setCatalog] = useState<ParadeCatalogEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState('');

  // Deep-link ?date=YYYY-MM-DD dari kalender Peristiwa Astronomi.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('date');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) setStart(q);
  }, []);

  const loadEvent = async (date: string) => {
    setDetailLoading(true); setError(null); setSelectedDate(date);
    try {
      const p = new URLSearchParams({ date });
      if (location) { p.set('lat', String(location.latitude)); p.set('lon', String(location.longitude)); p.set('name', location.name); }
      const res = await fetch(`/api/parade?${p.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'parade-computation-failed');
      setResult(data as ParadeResult);
    } catch {
      setError('compute');
    } finally {
      setDetailLoading(false);
    }
  };

  const compute = async () => {
    setLoading(true); setError(null); setResult(null); setCatalog([]); setSelectedDate('');
    try {
      const res = await fetch(`/api/parade?${new URLSearchParams({ start, months })}`, { signal: AbortSignal.timeout(60000) });
      const data = await res.json() as { events?: ParadeCatalogEvent[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'parade-search-failed');
      const events = data.events ?? [];
      setCatalog(events);
      if (events.length === 0) throw new Error('parade-not-found');
      await loadEvent(events[0].date);
      requestAnimationFrame(() => document.getElementById('parade-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch {
      setError('compute');
    } finally {
      setLoading(false);
    }
  };

  const selectedCatalogEvent = catalog.find((event) => event.date === selectedDate) ?? catalog[0] ?? null;
  const paradeCount = Math.max(result?.globalBest?.best?.nParade ?? 0, selectedCatalogEvent?.planetCount ?? 0);
  const solarSystemDiagram = useMemo(() => {
    const epoch = result?.globalBest?.best?.epochMsUTC;
    if (!epoch) return [];
    const participants = new Set(result.globalBest?.best?.planets.filter((planet) => planet.aboveHorizon).map((planet) => planet.id) ?? []);
    return computeBodiesAt(epoch).map((body) => {
      const id = body.id as PlanetId;
      // Same top-down plane used by SolarSystemScene: screen X = ecliptic X,
      // screen Y follows scene Z = -ecliptic Y.
      const angle = Math.atan2(-body.position.y, body.position.x);
      const radius = ORBIT_RADIUS[id];
      return {
        id,
        left: 50 + Math.cos(angle) * radius,
        top: 50 + Math.sin(angle) * radius,
        participant: participants.has(id as ParadePlanetId),
      };
    });
  }, [result]);

  const errorMessage = id ? 'Perhitungan parade gagal diselesaikan.' : 'The parade computation could not be completed.';

  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.gridOverlay} aria-hidden="true" />
      <header className={styles.topbar}>
        <div className={styles.brand}>IAST <span>/ {id ? 'OBSERVATORIUM PARADE' : 'PARADE OBSERVATORY'}</span></div>
        <div className={styles.status}><i /> NASA JPL HORIZONS</div>
      </header>
      <main className={styles.content}>
      {/* Header */}
      <div className={styles.hero}>
        <p className={styles.eyebrow}>{id ? 'KOMPUTASI KESEJAJARAN PLANET' : 'PLANETARY ALIGNMENT COMPUTATION'} · 02</p>
        <h1>
          {id ? 'Parade Planet' : 'Planet Parade'}
        </h1>
        <p className={styles.subtitle}>
          {id
            ? 'Menghitung sendiri kapan & dari mana beberapa planet tampak berjajar di langit, berbasis data NASA JPL Horizons + perhitungan astronomi baku — bukan sekadar tanggal viral di media sosial.'
            : 'We compute for ourselves when and where several planets appear lined up in the sky, from NASA JPL Horizons data + standard astronomy — not merely a viral social-media date.'}
        </p>
        <div className={styles.definition}>
          <b>{id ? 'Definisi operasional: ' : 'Operational definition: '}</b>
          {id
            ? '“Parade Planet” terjadi pada tanggal D dari lokasi L bila pada suatu waktu dalam langit gelap terdapat N ≥ N_min planet target yang memenuhi kriteria visibilitas (ketinggian, kegelapan langit, elongasi) secara bersamaan. Semua ambang di bawah bersifat operasional atau heuristik, bukan standar astronomi resmi.'
            : '“Planet Parade” occurs on date D from location L if, at some moment in a dark sky, N ≥ N_min target planets simultaneously meet the visibility criteria (altitude, sky darkness, elongation). All thresholds below are operational/heuristic, not an official astronomy standard.'}
        </div>
      </div>

      {/* Input */}
      <section className={styles.controlPanel}>
        <div className={styles.panelHead}><span>01 / {id ? 'KONTROL MISI' : 'MISSION CONTROL'}</span><b>{id ? 'CARI PARADE' : 'SEARCH PARADE'}</b></div>
        {catalog.length > 0 && (
          <div className={styles.presets}>
            <p>
              {id ? 'Parade terdekat hasil pemindaian NASA' : 'Nearest parades from NASA scan'}
            </p>
            <div>
              {catalog.map((event) => (
                <button key={`${event.date}-${event.planetCount}`} onClick={() => loadEvent(event.date)}
                  className={selectedDate === event.date ? styles.activePreset : ''}>
                  <span>{event.date}</span><b>{id ? `Parade ${event.planetCount} planet` : `${event.planetCount}-planet parade`}</b>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={styles.controls}>
          <label>
            {id ? 'Tanggal awal pencarian' : 'Search start date'}
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              />
          </label>
          <label>
            {id ? 'Rentang pencarian' : 'Search range'}
            <select value={months} onChange={(e) => setMonths(e.target.value)}>
              {[3, 6, 12, 24].map((value) => <option key={value} value={value}>{value} {id ? 'bulan' : 'months'}</option>)}
            </select>
          </label>
          <CitySearch locale={locale} value={location} onChange={setLocation} />
          <button onClick={compute} disabled={loading}
            className={styles.computeButton}>
            {loading ? (id ? 'Memindai…' : 'Scanning…') : (id ? 'Cari Parade Terdekat' : 'Find Nearest Parade')}
          </button>
        </div>
        <p className={styles.criteriaNote}>
          {id
            ? 'Ambang bawaan (dapat disetel melalui API): ketinggian planet ≥ 10°, Matahari ≤ −6° (akhir senja sipil), elongasi ≥ 15°, N_min = 4. Kelas optik setiap planet mengikuti klasifikasi NASA (Merkurius–Saturnus mata telanjang; Uranus disarankan memakai alat; Neptunus wajib memakai teleskop).'
            : 'Default thresholds (tunable via API): planet altitude ≥ 10°, Sun ≤ −6° (end of civil twilight), elongation ≥ 15°, N_min = 4. Per-planet optical class follows NASA (Mercury–Saturn naked-eye; Uranus optics advised; Neptune telescope-required).'}
        </p>
        {loading && (
          <p className={styles.loadingText}>
            {id ? 'Memindai lintasan 7 planet dari NASA satu kali per rentang, lalu memverifikasi peristiwa terdekat.' : 'Scanning seven NASA planet tracks once per range, then verifying the nearest event.'}
          </p>
        )}
      </section>

      {error && (
        <div className={styles.errorPanel}>
          <b>{id ? 'PROSES TERHENTI' : 'PROCESS INTERRUPTED'}</b><p>{errorMessage}</p>
        </div>
      )}

      {result && (
        <div className={styles.results} id="parade-result">
          {result.dataSource === 'mock' && (
            <div className={styles.warningPanel}>
              <p>
                ⚠ {id ? 'DATA MOCK / PENGEMBANGAN — NASA Horizons tidak tersedia; hasil TIDAK valid untuk kesimpulan.' : 'MOCK / DEVELOPMENT DATA — NASA Horizons unavailable; results are NOT valid for conclusions.'}
              </p>
            </div>
          )}

          <section className={styles.resultShowcase}>
            <div className={styles.resultIdentity}><p>{id ? 'HASIL MISI · KESEJAJARAN' : 'MISSION RESULT · ALIGNMENT'}</p><h2>{id ? 'PARADE' : 'PARADE'} <b>{paradeCount}</b></h2><time>{result.dateD}</time><span>{selectedCatalogEvent ? `${selectedCatalogEvent.nakedEyeCount} ${id ? 'kasat mata' : 'naked-eye'} · ${selectedCatalogEvent.aidedCount} ${id ? 'memerlukan optik' : 'need optics'}` : ''}</span></div>
            <div className={styles.orbitVisual} aria-label={id ? `Posisi heliosentris planet pada waktu optimum parade ${paradeCount} planet` : `Heliocentric planet positions at the optimum ${paradeCount}-planet parade time`}>
              {PLANET_IDS.map((planet) => <i key={`orbit-${planet}`} className={styles.systemOrbit} style={{ '--orbit-inset': `${50 - ORBIT_RADIUS[planet]}%` } as CSSProperties} />)}
              <b className={styles.core}><em>{id ? 'Matahari' : 'Sun'}</em></b>
              {solarSystemDiagram.map((planet) => <span key={planet.id} className={`${styles.systemPlanet} ${planet.participant ? styles.paradeParticipant : ''} ${planet.id === 'earth' ? styles.earthPlanet : ''}`} style={{ left: `${planet.left}%`, top: `${planet.top}%`, '--planet-color': PLANET_VISUALS[planet.id].color } as CSSProperties}><em>{SOLAR_SYSTEM_NAME[locale][planet.id]}</em></span>)}
              <small>{id ? 'HELIOSENTRIS · EPOCH OPTIMUM' : 'HELIOCENTRIC · OPTIMUM EPOCH'}</small>
            </div>
            <div className={styles.showcaseMetrics}><Stat label={id ? 'Total peserta' : 'Participants'} value={`${paradeCount} ${id ? 'planet' : 'planets'}`} /><Stat label={id ? 'Sebaran ekliptika' : 'Ecliptic spread'} value={`${(selectedCatalogEvent?.spanDeg ? selectedCatalogEvent.spanDeg : result.globalBest?.best?.spanDeg ?? 0).toFixed(1)}°`} /><Stat label={id ? 'Sumber' : 'Source'} value={dataSourceLabel(result.dataSource, id)} /></div>
          </section>

          {detailLoading && <p className={styles.loadingText}>{id ? 'Memuat verifikasi topocentric peristiwa…' : 'Loading topocentric event verification…'}</p>}

          {/* Ringkasan */}
          <section className={styles.summaryPanel}>
            <div className={styles.panelHead}><span>02 / {id ? 'HASIL MISI' : 'MISSION RESULT'}</span><b>{result.dateD}</b></div>
            <h2>{id ? 'Ringkasan Parade' : 'Parade Summary'}</h2>
            {result.globalBest?.best && (
              <p className={styles.summaryLead}>
                {id ? 'Parade' : 'Parade of'} <b>{paradeCount} {id ? 'planet' : 'planets'}</b>
                {' '}<span>
                  ({result.globalBest.best.nNaked} {id ? 'mata telanjang' : 'naked-eye'}, {result.globalBest.best.nAided} {id ? 'perlu alat' : 'need optics'})
                </span>
                <small> — {id ? 'di lokasi dan waktu terbaik' : 'at the best place and time'}</small>
              </p>
            )}
            <div className={styles.badgeRow}>
              <Badge ok={result.meetsNMin} label={`${id ? 'Parade' : 'Parade'}: N ≥ ${result.criteria.nMin}`} />
              <Badge ok={result.meetsNMinNaked} label={`${id ? 'Mata telanjang' : 'Naked-eye'}: N ≥ ${result.criteria.nMin}`} />
              <span className={styles.sourceLabel}>
                {id ? 'Sumber data' : 'Data source'}: <b>{dataSourceLabel(result.dataSource, id)}</b>
              </span>
            </div>
            <p className={styles.summaryNote}>
              {id
                ? '“Parade” = jumlah planet yang berada di atas ufuk dalam langit gelap (termasuk yang perlu binokular/teleskop) — sama seperti hitungan media. Kolom Status di tabel merinci mana yang mata telanjang, perlu alat, atau menempel ufuk.'
                : '“Parade” = number of planets above the horizon in a dark sky (including those needing binoculars/telescope) — the same count the media uses. The Status column breaks down which are naked-eye, need optics, or hug the horizon.'}
            </p>
          </section>

          {result.globalBest && <LocationCard loc={result.globalBest} title={id ? 'Lokasi Terbaik Global' : 'Best Global Location'} id={id} />}
          {result.userLocation && <LocationCard loc={result.userLocation} title={id ? `Dari ${result.userLocation.name}` : `From ${result.userLocation.name}`} id={id} userSelected />}

          {result.warnings.length > 0 && (
            <div className={styles.noticePanel}>
              <p>{result.warnings.map((warning) => localizedWarning(warning, id)).join(' · ')}</p>
            </div>
          )}

          {/* Keterbatasan */}
          <section className={styles.limitsPanel}>
            <div className={styles.panelHead}><span>05 / {id ? 'BATAS METODE' : 'METHOD LIMITS'}</span><b>{id ? 'TRANSPARANSI' : 'TRANSPARENCY'}</b></div>
            <h3>{id ? 'Catatan kejujuran dan keterbatasan' : 'Honesty and limitations'}</h3>
            <ul>
              <li>{id ? '“Parade planet” bukan istilah astronomi resmi (IAU/NASA) — kriteria di sini operasional & eksplisit.' : '“Planet parade” is not an official astronomy term (IAU/NASA) — criteria here are operational & explicit.'}</li>
              <li>{id ? 'Cuaca, awan, dan polusi cahaya tidak dimodelkan; visibilitas geometris ≠ keterlihatan nyata di lapangan.' : 'Weather, clouds, and light pollution are not modeled; geometric visibility ≠ real-world sightability.'}</li>
              <li>{id ? 'Kisi lokasi diskret (±90 titik) → “lokasi terbaik” adalah yang terbaik di antara titik kisi, bukan optimum mutlak.' : 'Discrete location grid (±90 points) → “best location” is best among grid points, not an absolute optimum.'}</li>
            </ul>
          </section>
        </div>
      )}
      </main>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`${styles.badge} ${ok ? styles.badgeOk : styles.badgeOff}`}>
      <i />
      {label}
    </span>
  );
}

function LocationCard({ loc, title, id, userSelected = false }: { loc: ParadeLocationResult; title: string; id: boolean; userSelected?: boolean }) {
  const b = loc.best;
  const names = PLANET_NAME[id ? 'id' : 'en'];
  const optical = OPTICAL_LABEL[id ? 'id' : 'en'];
  const displayName = userSelected ? loc.name : id ? `Titik global ${loc.lat.toFixed(2)}°, ${loc.lon.toFixed(2)}°` : loc.name;

  if (!b) {
    return (
      <section className={styles.locationPanel}>
        <h2>{title}</h2>
        <p className={styles.noLocation}>
          {id ? 'Tidak ada planet di atas ufuk saat langit gelap pada tanggal ini di ' : 'No planets above the horizon in a dark sky on this date at '}
          {displayName}.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.locationPanel}>
      <div className={styles.locationHead}>
        <div>
          <span>03 / {id ? 'LOKASI OBSERVASI' : 'OBSERVATION SITE'}</span>
          <h2>{title}</h2>
          <p>
            {displayName} <small>({loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}° · {loc.tz})</small>
          </p>
        </div>
        {loc.topoVerified && (
          <span className={styles.verified}>
            {id ? 'Toposentrik NASA #4 terverifikasi' : 'NASA #4 topocentric verified'}
          </span>
        )}
      </div>

      <div className={styles.statGrid}>
        <Stat label={id ? 'Rentang optimal' : 'Optimal window'} value={`${fmtLocalTime(loc.windowStartLocalISO).slice(11)}–${fmtLocalTime(loc.windowEndLocalISO).slice(11)}`} />
        <Stat label={id ? 'Optimum numerik' : 'Numeric optimum'} value={fmtLocalTime(b.localTimeISO).slice(11)} />
        <Stat label={id ? 'Planet dalam parade' : 'Parade planets'} value={`${b.nParade} · ${b.nNaked}${id ? ' mata' : ' eye'} + ${b.nAided}${id ? ' alat' : ' optics'}`} />
        <Stat label={id ? 'Rentang sebaran' : 'Angular spread'} value={`${b.spanDeg.toFixed(1)}°`} />
      </div>
      <p className={styles.timeNote}>
        {id ? 'Waktu = jam lokal. “Optimum numerik” = waktu optimum menurut definisi operasional sistem, bukan “parade terjadi tepat pukul itu”.'
            : 'Times are local. “Numeric optimum” = optimum per the system’s operational definition, not “the parade happens exactly then”.'}
      </p>

      {/* Tabel planet */}
      <div className={styles.planetMatrix}>
        <div className={styles.matrixHead}><span>04 / {id ? 'MATRIKS VISIBILITAS' : 'VISIBILITY MATRIX'}</span><b>{b.planets.length} {id ? 'PLANET TARGET' : 'TARGET PLANETS'}</b></div>
        <div className={styles.tableScroll}>
        <table>
          <thead>
            <tr>
              <th>{id ? 'Planet' : 'Planet'}</th>
              <th>{id ? 'Ketinggian' : 'Altitude'}</th>
              <th>{id ? 'Azimut' : 'Azimuth'}</th>
              <th>{id ? 'Elongasi' : 'Elongation'}</th>
              <th>{id ? 'Kelas optik' : 'Optical class'}</th>
              <th>{id ? 'Status' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {b.planets.map((p) => (
              <tr key={p.id}>
                <td data-label={id ? 'Planet' : 'Planet'}><b>{names[p.id]}</b></td>
                <td data-label={id ? 'Ketinggian' : 'Altitude'}>{p.altDeg.toFixed(1)}°</td>
                <td data-label={id ? 'Azimut' : 'Azimuth'}>{p.azDeg.toFixed(0)}°</td>
                <td data-label={id ? 'Elongasi' : 'Elongation'}>{p.elongDeg.toFixed(0)}°</td>
                <td data-label={id ? 'Kelas optik' : 'Optical class'}>{optical[p.opticalClass]}</td>
                <td data-label={id ? 'Status' : 'Status'}>{planetStatus(p, id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Deep-links */}
      <div className={styles.deepLinks}>
        <Link href={`/solar-system?t=${b.epochMsUTC}`}
          >
          {id ? 'Lihat di Tata Surya →' : 'View in Solar System →'}
        </Link>
        <Link href={`/stellarium?lat=${loc.lat}&lon=${loc.lon}&tz=${encodeURIComponent(loc.tz)}&datetime=${b.localTimeISO}`}
          >
          {id ? 'Lihat di Stellarium →' : 'View in Stellarium →'}
        </Link>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
