'use client';

import { useState, useEffect, useRef } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { useRouter } from 'next/navigation';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface KHGTWitness {
  lat: number;
  lon: number;
  name: string;
  tz: string;
  sunsetUTC: string;
  sunsetLocal: string;
  geoMoonAltDeg: number;
  geoMoonElongDeg: number;
  geoMoonIlluminationPct?: number;
  topoMoonAzDeg?: number | null;
  topoMoonAltDeg?: number | null;
  topoMoonElongDeg?: number | null;
  topoMoonIlluminationPct?: number | null;
  observationFrame?: string;
  observationComputedAtUTC?: string | null;
  referenceFrame: string;
}

interface PKG2Detail {
  nzFajrEvent: string;
  nzFajrUTC: string;
  conjBeforeNzFajr: boolean;
  marginHours: number;
}

interface KHGTResult {
  year: number;
  khgtStartCivilDate: string;
  conjunctionUTC: string;
  pkgVariant: 'PKG1' | 'PKG2' | 'NONE';
  witness: KHGTWitness | null;
  witnessBestEngine?: KHGTWitness | null;
  witnessFirstQualifiedByTime?: KHGTWitness | null;
  witnessCanonicalId?: string | null;
  witnessFirstQualifiedCanonicalId?: string | null;
  pkg2Detail: PKG2Detail | null;
  scanSummary: {
    totalCandidates: number;
    pkg1Passed: number;
    pkg2Passed: number;
  };
  warnings: string[];
  dataSource: string;
}

interface KHGTFullResult {
  ramadan: KHGTResult;
  syawal: KHGTResult;
}

interface PredictResponse {
  year: number;
  results: KHGTFullResult[];
  resultScope?: string;
  emptyReason?: string | null;
}

function normalizeWitnessName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toWitnessCanonicalId(witness: KHGTWitness | null): string | null {
  if (!witness) return null;
  return `lat:${witness.lat.toFixed(2)}|lon:${witness.lon.toFixed(2)}|name:${normalizeWitnessName(witness.name)}`;
}

/* ------------------------------------------------------------------ */
/*  Read-only witness map component                                     */
/* ------------------------------------------------------------------ */

function ReadOnlyWitnessMap({ lat, lon, name }: { lat: number; lon: number; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current, {
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomControl: false,
      }).setView([lat, lon], 5);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OSM',
        maxZoom: 18,
      }).addTo(map);

      L.marker([lat, lon])
        .addTo(map)
        .bindPopup(`<b>${name}</b><br>${lat.toFixed(2)}\u00b0, ${lon.toFixed(2)}\u00b0`)
        .openPopup();

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
  }, [lat, lon, name]);

  return <div ref={containerRef} className="h-[280px] md:h-[360px] w-full rounded-lg border border-white/10" />;
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const { t } = useI18n();
  const router = useRouter();

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PredictResponse | null>(null);

  async function computePrediction() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const resp = await fetch(`/api/predict?year=${year}`);
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data as PredictResponse);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function openStellarium(w: KHGTWitness) {
    const params = new URLSearchParams({
      lat: w.lat.toString(),
      lon: w.lon.toString(),
      tz: w.tz,
      datetime: w.sunsetLocal,
      mode: 'sunset',
    });
    router.push(`/stellarium?${params.toString()}`);
  }

  function tarawihDate(khgtDate: string): string {
    const d = new Date(khgtDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-blue-300 bg-clip-text text-transparent mb-6">
        {t.khgtTitle ?? 'Prediksi Ramadhan - Kalender Hijriah Global Tunggal (KHGT)'}
      </h1>

      {/* Form \u2014 year only */}
      <div className="glass-card p-6 mb-8">
        <label className="block text-sm font-medium text-slate-300 mb-1">{t.targetYear}</label>
        <div className="flex gap-3 items-end">
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
            className="w-32 px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500 [color-scheme:dark]"
            min={2000}
          />
          <button
            onClick={computePrediction}
            disabled={loading}
            className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20"
          >
            {loading ? (t.computing ?? 'Computing...') : (t.computeBtn ?? 'Compute')}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {t.khgtDesc ?? 'Kriteria Rule A dan Rule B: Rule A \u2014 konjungsi terjadi sebelum maghrib; Rule B \u2014 altitude Bulan > 0\u00b0 saat maghrib.'}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-6">
          <h3 className="font-bold text-red-400">{t.errorTitle}</h3>
          <p className="text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && result.results.length === 0 && (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4 mb-6">
          <p className="text-yellow-200 text-sm">
            {(t.multiRamadanFound ?? 'Tidak ada Ramadan KHGT yang jatuh di tahun Masehi {year}').replace('{year}', String(result.year)).replace('{count}', '0')}
          </p>
          <p className="text-yellow-200/80 text-xs mt-2">
            {result.emptyReason ?? `Respons kosong berarti tidak ada 1 Ramadan KHGT dalam scope Gregorian-year ${result.year}, bukan otomatis kegagalan data NASA.`}
          </p>
        </div>
      )}

      {result && result.results.map((item, idx) => {
        const r = item.ramadan;
        const s = item.syawal;
        const rWitnessBest = r.witnessBestEngine ?? r.witness;
        const rWitnessFirst = r.witnessFirstQualifiedByTime ?? null;
        const rBestCanonical = r.witnessCanonicalId ?? toWitnessCanonicalId(rWitnessBest);
        const rFirstCanonical = r.witnessFirstQualifiedCanonicalId ?? toWitnessCanonicalId(rWitnessFirst);
        const rHasParityDifference = !!rWitnessBest && !!rWitnessFirst && rBestCanonical !== rFirstCanonical;

        const sWitnessBest = s.witnessBestEngine ?? s.witness;
        const sWitnessFirst = s.witnessFirstQualifiedByTime ?? null;
        const sBestCanonical = s.witnessCanonicalId ?? toWitnessCanonicalId(sWitnessBest);
        const sFirstCanonical = s.witnessFirstQualifiedCanonicalId ?? toWitnessCanonicalId(sWitnessFirst);
        const sHasParityDifference = !!sWitnessBest && !!sWitnessFirst && sBestCanonical !== sFirstCanonical;

        const label = result.results.length > 1
          ? ` (${(t.ramadanNth ?? 'Ramadan {n}').replace('{n}', String(idx + 1))})`
          : '';

        return (
          <div key={idx} className="mb-8">
            {/* Multi-Ramadan header */}
            {result.results.length > 1 && (
              <h2 className="text-lg font-bold text-indigo-300 mb-2">
                {(t.ramadanNth ?? 'Ramadan {n}').replace('{n}', String(idx + 1))}
              </h2>
            )}

            {/* Warnings */}
            {r.warnings.length > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4 mb-4">
                <h3 className="font-bold text-yellow-300 text-sm mb-1">{t.warningsTitle ?? 'Warnings'}</h3>
                {r.warnings.map((w, i) => (
                  <p key={i} className="text-yellow-200/80 text-xs">{w}</p>
                ))}
              </div>
            )}

            {/* Main result card \u2014 Ramadan */}
            <div className="glass-card p-6 mb-6">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent mb-4">
                {(t.resultsTitle ?? 'Prediction Results') + label}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ResultRow label={t.khgtDate ?? '1 Ramadan (KHGT)'} value={r.khgtStartCivilDate} highlight />
                <ResultRow label={t.khgtTarawih ?? 'Tarawih Pertama'} value={tarawihDate(r.khgtStartCivilDate)} highlight />
                <ResultRow label={t.conjunctionUTC ?? 'Conjunction (UTC)'} value={r.conjunctionUTC} />
                <ResultRow label={t.khgtPkgVariant ?? 'PKG Variant'} value={r.pkgVariant === 'NONE' ? (t.istikmalLabel ?? 'Istikmal') : r.pkgVariant} />
              </div>
              {r.pkgVariant === 'NONE' && (
                <p className="mt-3 text-sm text-amber-300">Istikmal: tidak ada saksi yang lolos kriteria KHGT.</p>
              )}
            </div>

            {/* PKG2 Detail */}
            {r.pkg2Detail && (
              <div className="glass-card p-6 mb-6">
                <h2 className="text-xl font-bold text-amber-300 mb-4">{t.khgtPkg2Title ?? 'PKG2 Detail'}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ResultRow label={t.khgtNzFajrUTC ?? 'NZ Fajar (nightEnd) UTC'} value={r.pkg2Detail.nzFajrUTC} />
                  <ResultRow
                    label={t.khgtConjBeforeNzFajr ?? 'Conjunction before NZ Fajar'}
                    value={r.pkg2Detail.conjBeforeNzFajr ? (t.fulfilled ?? 'Yes') : (t.notFulfilled ?? 'No')}
                  />
                  <ResultRow label={t.khgtMarginHours ?? 'Margin (hours)'} value={r.pkg2Detail.marginHours.toFixed(2)} />
                </div>
              </div>
            )}

            {/* Witness card */}
            {rWitnessBest ? (
              <div className="glass-card p-6 mb-6">
                <h2 className="text-xl font-bold text-emerald-300 mb-4">{t.khgtWitnessTitle ?? 'Witness Location'}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ResultRow label={t.khgtWitnessName ?? 'Saksi engine terbaik'} value={rWitnessBest.name} highlight />
                  <ResultRow label={t.khgtWitnessCoords ?? 'Coordinates'} value={`${rWitnessBest.lat.toFixed(2)}\u00b0, ${rWitnessBest.lon.toFixed(2)}\u00b0`} />
                  <ResultRow label={t.khgtWitnessTz ?? 'Timezone'} value={rWitnessBest.tz} />
                  <ResultRow label={t.khgtWitnessSunsetLocal ?? 'Sunset (Local)'} value={rWitnessBest.sunsetLocal} />
                  <ResultRow label={t.khgtWitnessSunsetUTC ?? 'Sunset (UTC)'} value={rWitnessBest.sunsetUTC} />
                  <ResultRow label={t.khgtWitnessGeoAlt ?? 'Geo Moon Alt (\u00b0)'} value={`${rWitnessBest.geoMoonAltDeg.toFixed(4)}\u00b0`} />
                  <ResultRow label={t.khgtWitnessGeoElong ?? 'Geo Moon Elong (\u00b0)'} value={`${rWitnessBest.geoMoonElongDeg.toFixed(4)}\u00b0`} />
                  {typeof rWitnessBest.geoMoonIlluminationPct === 'number' && (
                    <ResultRow label={'Geo Moon Illumination (%)'} value={`${rWitnessBest.geoMoonIlluminationPct.toFixed(4)}%`} />
                  )}
                  {typeof rWitnessBest.topoMoonAltDeg === 'number' && (
                    <ResultRow label={'Topo Moon Alt (\u00b0) @ sunsetUTC'} value={`${rWitnessBest.topoMoonAltDeg.toFixed(4)}\u00b0`} />
                  )}
                  {typeof rWitnessBest.topoMoonAzDeg === 'number' && (
                    <ResultRow label={'Topo Moon Az (\u00b0) @ sunsetUTC'} value={`${rWitnessBest.topoMoonAzDeg.toFixed(4)}\u00b0`} />
                  )}
                  {typeof rWitnessBest.topoMoonElongDeg === 'number' && (
                    <ResultRow label={'Topo Moon Elong (\u00b0) @ sunsetUTC'} value={`${rWitnessBest.topoMoonElongDeg.toFixed(4)}\u00b0`} />
                  )}
                  {typeof rWitnessBest.topoMoonIlluminationPct === 'number' && (
                    <ResultRow label={'Topo Moon Illumination (%) @ sunsetUTC'} value={`${rWitnessBest.topoMoonIlluminationPct.toFixed(4)}%`} />
                  )}
                  <ResultRow label={'Frame keputusan KHGT'} value={rWitnessBest.referenceFrame} />
                  <ResultRow label={'Frame observasi/Stellarium'} value={rWitnessBest.observationFrame ?? 'topocentric'} />
                </div>

                {rHasParityDifference && rWitnessFirst && (
                  <div className="mt-4 p-3 rounded-lg border border-cyan-500/30 bg-cyan-900/20">
                    <p className="text-xs text-cyan-200 mb-2">
                      Saksi engine terbaik berbeda dari lokasi pertama yang memenuhi parameter KHGT.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <ResultRow label={'Lokasi pertama memenuhi parameter'} value={rWitnessFirst.name} highlight />
                      <ResultRow label={t.khgtWitnessCoords ?? 'Coordinates'} value={`${rWitnessFirst.lat.toFixed(2)}\u00b0, ${rWitnessFirst.lon.toFixed(2)}\u00b0`} />
                    </div>
                  </div>
                )}

                {/* Read-only map */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t.khgtWitnessMap ?? 'Witness Location (read-only map)'}</label>
                  <ReadOnlyWitnessMap lat={rWitnessBest.lat} lon={rWitnessBest.lon} name={rWitnessBest.name} />
                </div>

                {/* Stellarium button */}
                <button
                  onClick={() => openStellarium(rWitnessBest)}
                  className="mt-4 w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all text-lg shadow-lg shadow-indigo-500/20"
                >
                  {(t.openStellarium ?? 'Open Stellarium') + ' - Saksi engine terbaik'}{' \u2014 '}{rWitnessBest.name}
                </button>

                {rHasParityDifference && rWitnessFirst && (
                  <button
                    onClick={() => openStellarium(rWitnessFirst)}
                    className="mt-2 w-full py-3 bg-gradient-to-r from-cyan-700 to-sky-700 text-white font-bold rounded-xl hover:from-cyan-600 hover:to-sky-600 transition-all text-lg shadow-lg shadow-cyan-500/20"
                  >
                    {(t.openStellarium ?? 'Open Stellarium') + ' - Lokasi pertama memenuhi parameter'}{' \u2014 '}{rWitnessFirst.name}
                  </button>
                )}
              </div>
            ) : (
              <div className="glass-card p-4 mb-6 text-slate-400 text-sm">
                {t.noWitnessPassed ?? 'Tidak ada saksi yang lolos. Awal bulan ditetapkan dengan istikmal.'}
              </div>
            )}

            {/* Syawal / 1 Syawal / Idul Fitri */}
            <div className="glass-card p-6 mb-6">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent mb-4">
                {t.khgtSyawalTitle ?? '1 Syawal / Idul Fitri (KHGT)'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ResultRow label={t.khgtSyawalDate ?? '1 Syawal (KHGT)'} value={s.khgtStartCivilDate} highlight />
                <ResultRow label={t.khgtSyawalPkg ?? 'PKG Variant'} value={s.pkgVariant === 'NONE' ? (t.istikmalLabel ?? 'Istikmal') : s.pkgVariant} highlight />
                <ResultRow label={t.khgtSyawalConj ?? 'Syawal Conjunction (UTC)'} value={s.conjunctionUTC} />
                {sWitnessBest && (
                  <>
                    <ResultRow label={t.khgtSyawalWitnessName ?? 'Saksi engine terbaik'} value={sWitnessBest.name} />
                    <ResultRow label={t.khgtSyawalWitnessCoords ?? 'Coordinates'} value={`${sWitnessBest.lat.toFixed(2)}\u00b0, ${sWitnessBest.lon.toFixed(2)}\u00b0`} />
                    <ResultRow label={t.syawalSunsetLocal ?? 'Sunset (Local)'} value={sWitnessBest.sunsetLocal} />
                    <ResultRow label={t.khgtSyawalWitnessGeoAlt ?? 'Geo Moon Alt (\u00b0)'} value={`${sWitnessBest.geoMoonAltDeg.toFixed(4)}\u00b0`} />
                    <ResultRow label={t.khgtSyawalWitnessGeoElong ?? 'Geo Moon Elong (\u00b0)'} value={`${sWitnessBest.geoMoonElongDeg.toFixed(4)}\u00b0`} />
                    {typeof sWitnessBest.geoMoonIlluminationPct === 'number' && (
                      <ResultRow label={'Geo Moon Illumination (%)'} value={`${sWitnessBest.geoMoonIlluminationPct.toFixed(4)}%`} />
                    )}
                    {typeof sWitnessBest.topoMoonAltDeg === 'number' && (
                      <ResultRow label={'Topo Moon Alt (\u00b0) @ sunsetUTC'} value={`${sWitnessBest.topoMoonAltDeg.toFixed(4)}\u00b0`} />
                    )}
                    {typeof sWitnessBest.topoMoonAzDeg === 'number' && (
                      <ResultRow label={'Topo Moon Az (\u00b0) @ sunsetUTC'} value={`${sWitnessBest.topoMoonAzDeg.toFixed(4)}\u00b0`} />
                    )}
                    {typeof sWitnessBest.topoMoonElongDeg === 'number' && (
                      <ResultRow label={'Topo Moon Elong (\u00b0) @ sunsetUTC'} value={`${sWitnessBest.topoMoonElongDeg.toFixed(4)}\u00b0`} />
                    )}
                    {typeof sWitnessBest.topoMoonIlluminationPct === 'number' && (
                      <ResultRow label={'Topo Moon Illumination (%) @ sunsetUTC'} value={`${sWitnessBest.topoMoonIlluminationPct.toFixed(4)}%`} />
                    )}
                    {sHasParityDifference && sWitnessFirst && (
                      <ResultRow label={'Lokasi pertama memenuhi parameter'} value={`${sWitnessFirst.name} (${sWitnessFirst.lat.toFixed(2)}\u00b0, ${sWitnessFirst.lon.toFixed(2)}\u00b0)`} />
                    )}
                  </>
                )}
              </div>
              {s.pkgVariant === 'NONE' && (
                <p className="mt-3 text-sm text-amber-300">Istikmal: tidak ada saksi yang lolos kriteria KHGT.</p>
              )}
              {sWitnessBest && (
                <button
                  onClick={() => openStellarium(sWitnessBest)}
                  className="mt-4 w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl hover:from-emerald-500 hover:to-teal-500 transition-all text-lg shadow-lg shadow-emerald-500/20"
                >
                  {(t.openStellarium ?? 'Open Stellarium') + ' - Saksi engine terbaik'}{' \u2014 '}{sWitnessBest.name}
                </button>
              )}
              {sHasParityDifference && sWitnessFirst && (
                <button
                  onClick={() => openStellarium(sWitnessFirst)}
                  className="mt-2 w-full py-3 bg-gradient-to-r from-cyan-700 to-sky-700 text-white font-bold rounded-xl hover:from-cyan-600 hover:to-sky-600 transition-all text-lg shadow-lg shadow-cyan-500/20"
                >
                  {(t.openStellarium ?? 'Open Stellarium') + ' - Lokasi pertama memenuhi parameter'}{' \u2014 '}{sWitnessFirst.name}
                </button>
              )}
              {!sWitnessBest && (
                <p className="mt-3 text-sm text-slate-400">{t.noWitnessPassed ?? 'Tidak ada saksi yang lolos. Awal bulan ditetapkan dengan istikmal.'}</p>
              )}
              {s.warnings.length > 0 && (
                <div className="mt-3 text-xs text-yellow-300">
                  {s.warnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Methodology */}
      {result && result.results.length > 0 && (
        <div className="glass-card p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-200 mb-3">{t.explanationTitle ?? 'Methodology'}</h2>
          <p className="text-slate-400 leading-relaxed">
            {t.khgtExplanation ?? 'KHGT Muhammadiyah uses a geocentric reference frame to determine whenever the crescent Moon\'s altitude \u2265 5\u00b0 and elongation from the Sun \u2265 8\u00b0 at sunset at ANY location on Earth. If met at sunset before midnight UTC (PKG1) or, failing that, in the Americas after midnight UTC provided the conjunction occurred before NZ fajar (PKG2), the next day is declared 1 Ramadan.'}
          </p>
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-indigo-900/30 border border-indigo-500/30' : 'bg-white/5'}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`font-semibold ${highlight ? 'text-indigo-200 text-lg' : 'text-slate-200'} font-mono`}>
        {value}
      </div>
    </div>
  );
}
