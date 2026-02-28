'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { useRouter } from 'next/navigation';

interface PredictionData {
  ramadan1LocalDate: string;
  ramadanStartLocalDateTime: string;
  conjunctionUTC: string;
  conjunctionLocal: string;
  sunsetLocal: string;
  sunsetUTC: string;
  moonAltitudeAtSunsetDeg: number;
  moonAzimuthAtSunsetDeg: number;
  sunAltitudeAtSunsetDeg: number;
  sunAzimuthAtSunsetDeg: number;
  ruleA: boolean;
  ruleB: boolean;
  isBorderline: boolean;
  nrIterations: Array<{
    iteration: number;
    epochUTC: string;
    fDeg: number;
    fPrimeDegPerSec: number;
    stepSec: number;
  }>;
  converged: boolean;
  totalIterations: number;
  bisectionDeltaSec: number | null;
  bisectionWarning: boolean;
  requestParams: Record<string, string>;
  topoParams: Record<string, string>;
  timezone: string;
  dataSource: string;
  candidatesChecked: Array<{
    date: string;
    result: {
      ruleA: boolean;
      ruleB: boolean;
      fulfilled: boolean;
      candidateDate: string;
      moonAltAtSunsetDeg: number;
      isBorderline: boolean;
    };
  }>;
}

export default function HomePage() {
  const { t } = useI18n();
  const router = useRouter();

  const [year, setYear] = useState(2029);
  const [cityQuery, setCityQuery] = useState('');
  const [lat, setLat] = useState(-6.2383);
  const [lon, setLon] = useState(106.9756);
  const [tz, setTz] = useState('Asia/Jakarta');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PredictionData | null>(null);
  const [cityResults, setCityResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);

  async function searchCity() {
    if (!cityQuery.trim()) return;
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityQuery)}&limit=5`,
        { headers: { 'User-Agent': 'IslamicAstronomicalStudies/1.0' } }
      );
      const data = await resp.json();
      setCityResults(data);
    } catch {
      setCityResults([]);
    }
  }

  function selectCity(c: { display_name: string; lat: string; lon: string }) {
    setLat(parseFloat(c.lat));
    setLon(parseFloat(c.lon));
    setCityQuery(c.display_name.split(',')[0]);
    setCityResults([]);
    // Auto detect timezone
    fetch(`/api/sky?lat=${c.lat}&lon=${c.lon}&tz=UTC&datetimeLocal=${new Date().toISOString()}`)
      .catch(() => {});
  }

  async function computePrediction() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const resp = await fetch(
        `/api/predict?year=${year}&lat=${lat}&lon=${lon}&tz=${encodeURIComponent(tz)}`
      );
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function openStellarium() {
    if (!result) return;
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      tz,
      datetime: result.ramadanStartLocalDateTime,
      mode: 'sunset',
    });
    router.push(`/stellarium?${params.toString()}`);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-emerald-800 mb-6">🌙 {t.menu1}</h1>

      {/* Form */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Year */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.targetYear}</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
              min={2000}
              max={2100}
            />
          </div>

          {/* City search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.citySearch}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCity()}
                placeholder="Bekasi, Jakarta..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
              />
              <button
                onClick={searchCity}
                className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm"
              >
                🔍
              </button>
            </div>
            {cityResults.length > 0 && (
              <div className="mt-1 bg-white border rounded-md shadow-sm max-h-40 overflow-y-auto">
                {cityResults.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => selectCity(c)}
                    className="block w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm border-b last:border-b-0"
                  >
                    {c.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lat */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.latitude}</label>
            <input
              type="number"
              step="0.0001"
              value={lat}
              onChange={(e) => setLat(parseFloat(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Lon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.longitude}</label>
            <input
              type="number"
              step="0.0001"
              value={lon}
              onChange={(e) => setLon(parseFloat(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Timezone */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.timezone}</label>
            <input
              type="text"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        <button
          onClick={computePrediction}
          disabled={loading}
          className="mt-6 w-full py-3 bg-emerald-700 text-white font-bold rounded-md hover:bg-emerald-800 disabled:opacity-50 transition-colors text-lg"
        >
          {loading ? t.computing : t.computeBtn}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <h3 className="font-bold text-red-700">{t.errorTitle}</h3>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Main results card */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-2xl font-bold text-emerald-800 mb-4">{t.resultsTitle}</h2>

            <div className="bg-emerald-50 rounded-lg p-4 mb-4">
              <div className="text-sm text-gray-500">{t.dataSource}</div>
              <div className="font-semibold text-emerald-700">
                {result.dataSource === 'live' ? t.liveMode : t.mockMode}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ResultRow label={t.ramadan1Date} value={result.ramadan1LocalDate} highlight />
              <ResultRow label={t.ramadanStart} value={result.ramadanStartLocalDateTime} highlight />
              <ResultRow label={t.conjunctionUTC} value={result.conjunctionUTC} />
              <ResultRow label={t.conjunctionLocal} value={result.conjunctionLocal} />
              <ResultRow label={t.sunsetLocal} value={result.sunsetLocal} />
              <ResultRow label={t.moonAltAtSunset} value={`${result.moonAltitudeAtSunsetDeg.toFixed(6)}°`} />
              <ResultRow label={t.moonAzAtSunset} value={`${result.moonAzimuthAtSunsetDeg.toFixed(6)}°`} />
              <ResultRow label={t.sunAltAtSunset} value={`${result.sunAltitudeAtSunsetDeg.toFixed(6)}°`} />
              <ResultRow label={t.sunAzAtSunset} value={`${result.sunAzimuthAtSunsetDeg.toFixed(6)}°`} />
            </div>

            {/* Rule flags */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg ${result.ruleA ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <span className="font-medium">{t.ruleA}:</span>{' '}
                <span className={result.ruleA ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                  {result.ruleA ? '✅ ' + t.fulfilled : '❌ ' + t.notFulfilled}
                </span>
              </div>
              <div className={`p-3 rounded-lg ${result.ruleB ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <span className="font-medium">{t.ruleB}:</span>{' '}
                <span className={result.ruleB ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                  {result.ruleB ? '✅ ' + t.fulfilled : '❌ ' + t.notFulfilled}
                </span>
              </div>
            </div>

            {result.isBorderline && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800 font-medium">
                ⚠️ {t.borderlineWarning}
              </div>
            )}
          </div>

          {/* NASA Panel */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold text-blue-800 mb-4">🛰️ {t.nasaPanelTitle}</h2>
            <div className="mb-4">
              <h3 className="font-semibold text-gray-700 mb-2">{t.requestParams}</h3>
              <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                {Object.entries(result.requestParams).map(([k, v]) => (
                  <div key={k}><span className="text-blue-600">{k}</span>: {v}</div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">{t.rawValues}</h3>
              <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs">
                <div>Moon Alt: {result.moonAltitudeAtSunsetDeg.toFixed(8)}°</div>
                <div>Moon Az: {result.moonAzimuthAtSunsetDeg.toFixed(8)}°</div>
                <div>Sun Alt: {result.sunAltitudeAtSunsetDeg.toFixed(8)}°</div>
                <div>Sun Az: {result.sunAzimuthAtSunsetDeg.toFixed(8)}°</div>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-3">📖 {t.explanationTitle}</h2>
            <p className="text-gray-600 leading-relaxed">{t.explanation}</p>
          </div>

          {/* Newton-Raphson Audit */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold text-purple-800 mb-4">🔬 {t.nrAuditTitle}</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">{t.converged}</div>
                <div className="font-bold text-lg">{result.converged ? '✅' : '❌'}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">{t.totalIterations}</div>
                <div className="font-bold text-lg">{result.totalIterations}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">{t.bisectionDelta}</div>
                <div className="font-bold text-lg">
                  {result.bisectionDeltaSec !== null ? result.bisectionDeltaSec.toFixed(3) : 'N/A'}
                </div>
              </div>
              {result.bisectionWarning && (
                <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-300">
                  <div className="text-xs text-yellow-800 font-medium">⚠️ {t.bisectionWarning}</div>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-purple-100">
                  <tr>
                    <th className="px-3 py-2 text-left">{t.iteration}</th>
                    <th className="px-3 py-2 text-left">{t.epoch}</th>
                    <th className="px-3 py-2 text-right">{t.fValue}</th>
                    <th className="px-3 py-2 text-right">{t.derivative}</th>
                    <th className="px-3 py-2 text-right">{t.stepSec}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.nrIterations.map((iter) => (
                    <tr key={iter.iteration} className="border-b hover:bg-purple-50">
                      <td className="px-3 py-2">{iter.iteration}</td>
                      <td className="px-3 py-2 font-mono text-xs">{iter.epochUTC}</td>
                      <td className="px-3 py-2 text-right font-mono">{iter.fDeg.toExponential(6)}</td>
                      <td className="px-3 py-2 text-right font-mono">{iter.fPrimeDegPerSec.toExponential(4)}</td>
                      <td className="px-3 py-2 text-right font-mono">{iter.stepSec.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Open Stellarium button */}
          <button
            onClick={openStellarium}
            className="w-full py-4 bg-indigo-700 text-white font-bold rounded-xl hover:bg-indigo-800 transition-colors text-lg shadow-md"
          >
            🔭 {t.openStellarium}
          </button>
        </>
      )}
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`font-semibold ${highlight ? 'text-emerald-800 text-lg' : 'text-gray-800'} font-mono`}>
        {value}
      </div>
    </div>
  );
}
