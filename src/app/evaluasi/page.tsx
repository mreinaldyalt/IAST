'use client';

import { useState, useEffect, useRef } from 'react';
import { useI18n } from '@/components/I18nProvider';
import HistoryAuditPanel from '@/components/audit/HistoryAuditPanel';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
type OfficialStatus = 'verified' | 'candidate' | 'pending' | 'rejected' | 'unsupported_country';

interface EvalItem {
  year: number;
  khgtDate: string | null;
  witness: string | null;
  localDate: string | null;
  officialDate: string | null;
  officialCountryCode: string | null;
  officialAuthority: string | null;
  officialInstitution: string | null;
  officialStatus: OfficialStatus;
  officialSourceUrl: string | null;
  khgtVsLocalDays: number | null;
  khgtVsOfficialDays: number | null;
  localVsOfficialDays: number | null;
  khgtDataSource: string | null;
  localDataSource: string | null;
}

interface OfficialMeta {
  countryCode: string | null;
  countryName: string | null;
  authority: string | null;
  institution: string | null;
  supported: boolean;
}

/* ------------------------------------------------------------------ */
/*  Timezone helper                                                     */
/* ------------------------------------------------------------------ */
async function fetchTimezone(lat: number, lon: number): Promise<string> {
  const resp = await fetch(`/api/timezone?lat=${lat}&lon=${lon}`);
  const data = await resp.json();
  return data.tz || '';
}

/**
 * Reverse-geocodes to a country. Called only when the user's location
 * changes (map click/drag/city select) — never once per evaluation year, per
 * the design requirement that country detection isn't repeated on every
 * request.
 */
async function fetchCountry(lat: number, lon: number): Promise<{ country: string | null; countryCode: string | null }> {
  try {
    const resp = await fetch(`/api/geocode/reverse?lat=${lat}&lon=${lon}`);
    const data = await resp.json();
    return { country: data.country ?? null, countryCode: data.countryCode ?? null };
  } catch {
    return { country: null, countryCode: null };
  }
}

export default function EvaluasiPage() {
  const { t } = useI18n();

  const [fromYear, setFromYear] = useState(2024);
  const [toYear, setToYear] = useState(2028);
  const [lat, setLat] = useState(-6.2088);
  const [lon, setLon] = useState(106.8456);
  const [tz, setTz] = useState('Asia/Jakarta');
  const [countryName, setCountryName] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [countryDetecting, setCountryDetecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<EvalItem[]>([]);
  const [officialMeta, setOfficialMeta] = useState<OfficialMeta | null>(null);
  const [pageView, setPageView] = useState<'tabel' | 'audit'>('tabel');

  async function updateLocationDerived(la: number, lo: number) {
    setCountryDetecting(true);
    try {
      const [tzResult, countryResult] = await Promise.all([
        fetchTimezone(la, lo).catch(() => ''),
        fetchCountry(la, lo),
      ]);
      if (tzResult) setTz(tzResult);
      setCountryName(countryResult.country);
      setCountryCode(countryResult.countryCode);
    } finally {
      setCountryDetecting(false);
    }
  }

  // Detect country for the default location on first load too — not just on
  // subsequent user interaction.
  useEffect(() => {
    updateLocationDerived(lat, lon);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // City search (Nominatim)
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [citySearching, setCitySearching] = useState(false);

  // Interactive map for location selection
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;
    (async () => {
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const L = (await import('leaflet')).default;
      if (cancelled || !mapRef.current) return;
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      const map = L.map(mapRef.current).setView([lat, lon], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OSM', maxZoom: 18,
      }).addTo(map);
      const marker = L.marker([lat, lon], { draggable: true }).addTo(map);
      mapInstanceRef.current = map;
      markerRef.current = marker;

      map.on('click', async (e: L.LeafletMouseEvent) => {
        const { lat: la, lng } = e.latlng;
        marker.setLatLng([la, lng]);
        setLat(parseFloat(la.toFixed(4)));
        setLon(parseFloat(lng.toFixed(4)));
        updateLocationDerived(la, lng);
      });
      marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        setLat(parseFloat(pos.lat.toFixed(4)));
        setLon(parseFloat(pos.lng.toFixed(4)));
        updateLocationDerived(pos.lat, pos.lng);
      });
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function searchCity() {
    if (!cityQuery.trim()) return;
    setCitySearching(true);
    setCityResults([]);
    try {
      const encoded = encodeURIComponent(cityQuery.trim());
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await resp.json();
      setCityResults(data || []);
    } catch {
      setCityResults([]);
    } finally {
      setCitySearching(false);
    }
  }

  function selectCity(item: { lat: string; lon: string }) {
    const la = parseFloat(item.lat);
    const lo = parseFloat(item.lon);
    setLat(parseFloat(la.toFixed(4)));
    setLon(parseFloat(lo.toFixed(4)));
    setCityResults([]);
    setCityQuery('');

    if (mapInstanceRef.current && markerRef.current) {
      (markerRef.current as { setLatLng: (ll: [number, number]) => void }).setLatLng([la, lo]);
      (mapInstanceRef.current as { setView: (ll: [number, number], z: number) => void }).setView([la, lo], 8);
    }

    updateLocationDerived(la, lo);
  }

  async function runComparison() {
    setLoading(true);
    setError('');
    setItems([]);
    setOfficialMeta(null);
    try {
      const params = new URLSearchParams({
        fromYear: String(fromYear),
        toYear: String(toYear),
        lat: String(lat),
        lon: String(lon),
        tz,
      });
      if (countryCode) params.set('countryCode', countryCode);
      const resp = await fetch(`/api/evaluate?${params}`);
      const data = await resp.json();
      if (data.error) setError(data.error);
      else {
        setItems(data.items || []);
        setOfficialMeta(data.official ?? null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <section>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-blue-300 bg-clip-text text-transparent mb-4">
          {t.cmpTitle ?? 'Perbandingan Rule A dan Rule B vs Lokal'}
        </h1>
        <p className="text-slate-400 mb-4 text-sm">
          {t.cmpDesc ?? 'Bandingkan prediksi Rule A dan Rule B dengan data History Lokal. Klik peta untuk mengatur lokasi pengamat lokal.'}
        </p>

        <div className="glass-card p-6 mb-6">
          {/* City search */}
          <div className="mb-4">
            <label className="text-xs text-slate-500 block mb-1">{t.citySearch ?? 'Search city (Nominatim OSM)'}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cityQuery}
                onChange={e => setCityQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchCity()}
                placeholder="e.g. Jakarta, Mecca, Istanbul..."
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <button onClick={searchCity} disabled={citySearching}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-500 disabled:opacity-50">
                {citySearching ? '...' : (t.searchBtn ?? 'Search')}
              </button>
            </div>
            {cityResults.length > 0 && (
              <ul className="mt-1 bg-slate-800 border border-white/10 rounded max-h-40 overflow-y-auto">
                {cityResults.map((c, i) => (
                  <li key={i}
                    className="px-3 py-2 text-sm text-slate-300 hover:bg-indigo-900/30 cursor-pointer border-b border-white/5 last:border-0"
                    onClick={() => selectCity(c)}>
                    {c.display_name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Year range + coords */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">From Year</label>
              <input type="number" value={fromYear} onChange={e => setFromYear(parseInt(e.target.value) || 2024)}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white w-24 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">To Year</label>
              <input type="number" value={toYear} onChange={e => setToYear(parseInt(e.target.value) || 2028)}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white w-24 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">{t.latitude ?? 'Lat'}</label>
              <input type="number" step="0.0001" value={lat}
                onChange={e => setLat(parseFloat(e.target.value) || 0)}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white w-28 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">{t.longitude ?? 'Lon'}</label>
              <input type="number" step="0.0001" value={lon}
                onChange={e => setLon(parseFloat(e.target.value) || 0)}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white w-28 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">{t.timezone ?? 'TZ'}</label>
              <input type="text" value={tz}
                onChange={e => setTz(e.target.value)}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white w-40 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">{t.cmpCountry ?? 'Negara'}</label>
              <div className="px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-slate-200 w-48 h-[38px] flex items-center">
                {countryDetecting ? '...' : (countryName ?? (t.cmpCountryUnknown ?? 'Tidak terdeteksi'))}
              </div>
            </div>
          </div>

          {/* Map */}
          <div ref={mapRef} className="h-[240px] w-full rounded-lg border border-white/10 mb-4" />

          <button onClick={runComparison} disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20">
            {loading ? '...' : (t.cmpRun ?? 'Bandingkan Rule A dan Rule B vs Lokal')}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded p-3 text-red-300 text-sm mb-4">{error}</div>
        )}

        {pageView === 'tabel' && items.some(i => (i.khgtDataSource && i.khgtDataSource !== 'live') || (i.localDataSource && i.localDataSource !== 'live')) && (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-4 text-sm">
            <h3 className="font-bold text-amber-300 mb-1">Peringatan Kualitas Data</h3>
            <p className="text-amber-200/80 text-xs">
              Baris bertanda (‡) memakai estimasi/mock karena NASA HORIZONS API tidak dapat diakses saat
              perhitungan dijalankan — bukan data live/cache. Jangan jadikan dasar kesimpulan akademik sampai
              dimuat ulang saat API NASA pulih.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className="flex gap-1 mb-4 border-b border-white/10">
            <button
              onClick={() => setPageView('tabel')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${pageView === 'tabel' ? 'bg-indigo-700/50 text-white border-b-2 border-indigo-400' : 'text-slate-400 hover:bg-white/5'}`}
            >
              Ringkasan Historis
            </button>
            <button
              onClick={() => setPageView('audit')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${pageView === 'audit' ? 'bg-indigo-700/50 text-white border-b-2 border-indigo-400' : 'text-slate-400 hover:bg-white/5'}`}
            >
              Audit &amp; Jejak Perhitungan (Bab IV)
            </button>
          </div>
        )}

        {pageView === 'audit' && items.length > 0 && (
          <HistoryAuditPanel fromYear={fromYear} toYear={toYear} lat={lat} lon={lon} tz={tz} countryCode={countryCode} />
        )}

        {pageView === 'tabel' && officialMeta && (
          <div className="glass-card p-4 mb-4 text-sm">
            {officialMeta.supported ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><span className="text-slate-500">{t.cmpCountry ?? 'Negara'}:</span> <span className="text-slate-200">{officialMeta.countryName}</span></div>
                <div><span className="text-slate-500">{t.cmpAuthority ?? 'Otoritas'}:</span> <span className="text-slate-200">{officialMeta.authority}</span></div>
                <div><span className="text-slate-500">{t.cmpInstitution ?? 'Institusi'}:</span> <span className="text-slate-200">{officialMeta.institution}</span></div>
              </div>
            ) : (
              <div className="text-amber-300/80">
                {t.cmpCountryUnsupported ?? 'Data histori resmi belum tersedia untuk negara ini — kolom Rule A dan Rule B Global dan WH Lokal tetap dapat dihitung.'}
              </div>
            )}
          </div>
        )}

        {pageView === 'tabel' && items.length > 0 && (
          <div className="glass-card overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-indigo-950/30">
                <tr>
                  <th className="px-4 py-3 text-left text-slate-400">{t.year ?? 'Tahun'}</th>
                  <th className="px-4 py-3 text-left text-slate-400">{t.cmpKhgtDate ?? 'Rule A dan Rule B Global'}</th>
                  <th className="px-4 py-3 text-left text-slate-400">{t.cmpWitness ?? 'Saksi'}</th>
                  <th className="px-4 py-3 text-left text-slate-400">{t.cmpLocalDate ?? 'WH Lokal'}</th>
                  <th className="px-4 py-3 text-left text-slate-400">{t.cmpOfficialDate ?? 'Aktual Resmi'}</th>
                  <th className="px-4 py-3 text-right text-slate-400">{t.cmpKhgtVsLocal ?? 'Rule A dan Rule B vs Lokal'}</th>
                  <th className="px-4 py-3 text-right text-slate-400">{t.cmpKhgtVsOfficial ?? 'Rule A dan Rule B vs Aktual'}</th>
                  <th className="px-4 py-3 text-right text-slate-400">{t.cmpLocalVsOfficial ?? 'Lokal vs Aktual'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-indigo-900/10">
                    <td className="px-4 py-2 text-slate-300">{item.year}</td>
                    <td className="px-4 py-2 font-mono text-sm text-indigo-300">
                      {item.khgtDate || '-'}
                      {item.khgtDataSource && item.khgtDataSource !== 'live' && (
                        <span className="ml-1 text-amber-400" title={`Sumber data: ${item.khgtDataSource} (NASA HORIZONS tidak tersedia)`}>&#8225;</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400">{item.witness || (item.khgtDate ? (t.istikmalLabel ?? 'Istikmal') : '-')}</td>
                    <td className="px-4 py-2 font-mono text-sm text-slate-300">
                      {item.localDate || '-'}
                      {item.localDataSource && item.localDataSource !== 'live' && (
                        <span className="ml-1 text-amber-400" title={`Sumber data: ${item.localDataSource} (NASA HORIZONS tidak tersedia)`}>&#8225;</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-sm text-slate-300">
                      {item.officialStatus === 'verified' && item.officialDate ? (
                        <span className="text-emerald-300">
                          {item.officialDate}
                          {item.officialSourceUrl && (
                            <a href={item.officialSourceUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-slate-500 hover:text-indigo-300" title={t.cmpOfficialSource ?? 'Buka sumber resmi'}>
                              &#128279;
                            </a>
                          )}
                        </span>
                      ) : item.officialStatus === 'unsupported_country' ? (
                        <span className="text-slate-600 text-xs">{t.cmpCountryUnsupportedShort ?? 'Negara belum didukung'}</span>
                      ) : (
                        <span className="text-slate-600 text-xs">{t.cmpOfficialPending ?? 'Menunggu penetapan resmi'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm">
                      <DiffCell value={item.khgtVsLocalDays} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm">
                      <DiffCell value={item.khgtVsOfficialDays} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm">
                      <DiffCell value={item.localVsOfficialDays} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function DiffCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-600">-</span>;
  return (
    <span className={value === 0 ? 'text-green-400' : Math.abs(value) <= 1 ? 'text-amber-400' : 'text-red-400'}>
      {value > 0 ? '+' : ''}{value}
    </span>
  );
}
