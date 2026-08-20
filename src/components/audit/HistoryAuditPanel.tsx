'use client';

import { useState } from 'react';
import type { PredictionResult } from '@/lib/ramadanFromSyaban';
import type { KHGTResult } from '@/lib/khgtPipeline';

/* ------------------------------------------------------------------ */
/*  Types (mirrors /api/audit/history-comparison response)             */
/* ------------------------------------------------------------------ */

interface HistoryAuditItem {
  year: number;
  khgt: KHGTResult | null;
  khgtSyawal: KHGTResult | null;
  local: PredictionResult | null;
  official: { date: string | null; status: string; authority: string | null; institution: string | null; sourceUrl: string | null };
  khgtVsLocalDays: number | null;
  khgtVsOfficialDays: number | null;
  localVsOfficialDays: number | null;
  reasonIfDifferent: string | null;
}

interface HistoryAuditResponse {
  metadata: { fromYear: number; toYear: number; lat: number; lon: number; tz: string; countryCode: string | null; generatedAt: string };
  items: HistoryAuditItem[];
  summary: {
    totalYears: number; totalRows: number; khgtVsLocalMatches: number;
    khgtVsOfficialMatches: number; localVsOfficialMatches: number; officialVerifiedCount: number;
  };
  disclaimer: string;
}

type TabKey = 'lokal' | 'khgt' | 'export';
const TAB_LABELS: Record<TabKey, string> = {
  lokal: 'Jejak Perhitungan Lokal',
  khgt: 'Jejak KHGT / Saksi Global',
  export: 'Export Laporan Historis',
};

/* ------------------------------------------------------------------ */
/*  CSV helpers                                                        */
/* ------------------------------------------------------------------ */
type CsvCell = string | number | boolean | null | undefined;
function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}
function buildCSV<T>(rows: T[], columns: Array<{ header: string; get: (r: T) => CsvCell }>): string {
  const header = columns.map((c) => csvEscape(c.header)).join(',');
  const lines = rows.map((r) => columns.map((c) => csvEscape(c.get(r))).join(','));
  return [header, ...lines].join('\r\n');
}
function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function fmt(v: number | null | undefined, dec = 4): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(dec);
}

export default function HistoryAuditPanel({
  fromYear, toYear, lat, lon, tz, countryCode,
}: { fromYear: number; toYear: number; lat: number; lon: number; tz: string; countryCode: string | null }) {
  const [tab, setTab] = useState<TabKey>('lokal');
  const [data, setData] = useState<HistoryAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchedFor, setFetchedFor] = useState('');

  const paramsKey = `${fromYear}-${toYear}-${lat}-${lon}-${tz}-${countryCode ?? ''}`;
  const needsReload = fetchedFor !== paramsKey;

  async function loadAudit() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ fromYear: String(fromYear), toYear: String(toYear), lat: String(lat), lon: String(lon), tz });
      if (countryCode) params.set('countryCode', countryCode);
      const resp = await fetch(`/api/audit/history-comparison?${params.toString()}`);
      const json = await resp.json();
      if (json.error) setError(json.error);
      else { setData(json as HistoryAuditResponse); setFetchedFor(paramsKey); }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const suffix = `${fromYear}-${toYear}`;

  // Surface it here too: PredictionResult/KHGTResult.dataSource is only honest if the
  // UI actually reads it — NASA HORIZONS being down (common enough to hit routinely)
  // makes the pipelines fall back to mock/estimated data, and the raw numeric columns
  // below look identical either way unless flagged explicitly.
  const dataQualityIssues = data ? data.items.flatMap((item) => {
    const issues: string[] = [];
    if (item.local && item.local.dataSource !== 'live') {
      issues.push(`${item.year} (Lokal/Wujudul Hilal): sumber data = ${item.local.dataSource}`);
    }
    if (item.khgt && item.khgt.dataSource !== 'live') {
      issues.push(`${item.year} (KHGT Ramadan): sumber data = ${item.khgt.dataSource}`);
    }
    if (item.khgtSyawal && item.khgtSyawal.dataSource !== 'live') {
      issues.push(`${item.year} (KHGT Syawal): sumber data = ${item.khgtSyawal.dataSource}`);
    }
    return issues;
  }) : [];

  function handleExportLocalIterations() {
    if (!data) return;
    type Row = { year: number } & PredictionResult['nrIterations'][number];
    const flat: Row[] = [];
    for (const item of data.items) {
      if (!item.local) continue;
      for (const it of item.local.nrIterations) flat.push({ year: item.year, ...it });
    }
    const csv = buildCSV(flat, [
      { header: 'year', get: r => r.year },
      { header: 'iteration', get: r => r.iteration },
      { header: 'epochUTC', get: r => r.epochUTC },
      { header: 'fDeg', get: r => r.fDeg },
      { header: 'fPrimeDegPerSec', get: r => r.fPrimeDegPerSec },
      { header: 'stepSec', get: r => r.stepSec },
    ]);
    downloadTextFile(csv, `jejak-lokal-iterasi-nr-${suffix}.csv`, 'text/csv;charset=utf-8');
  }

  function handleExportLocalCandidates() {
    if (!data) return;
    type Row = { year: number; date: string; ruleA: boolean; ruleB: boolean; fulfilled: boolean; isBorderline: boolean; moonAltAtSunsetDeg: number };
    const flat: Row[] = [];
    for (const item of data.items) {
      if (!item.local) continue;
      for (const c of item.local.candidatesChecked) {
        flat.push({ year: item.year, date: c.date, ruleA: c.result.ruleA, ruleB: c.result.ruleB, fulfilled: c.result.fulfilled, isBorderline: c.result.isBorderline, moonAltAtSunsetDeg: c.result.moonAltAtSunsetDeg });
      }
    }
    const csv = buildCSV(flat, [
      { header: 'year', get: r => r.year },
      { header: 'candidateDate', get: r => r.date },
      { header: 'ruleA', get: r => r.ruleA },
      { header: 'ruleB', get: r => r.ruleB },
      { header: 'fulfilled', get: r => r.fulfilled },
      { header: 'isBorderline', get: r => r.isBorderline },
      { header: 'moonAltAtSunsetDeg', get: r => r.moonAltAtSunsetDeg },
    ]);
    downloadTextFile(csv, `jejak-lokal-kandidat-tanggal-${suffix}.csv`, 'text/csv;charset=utf-8');
  }

  function handleExportKhgtWitness() {
    if (!data) return;
    type Row = { year: number; pkgVariant: string; khgtStartCivilDate: string; witnessName: string | null; lat: number | null; lon: number | null; geoAlt: number | null; geoElong: number | null; topoAlt: number | null; totalCandidates: number; pkg1Passed: number; pkg2Passed: number };
    const flat: Row[] = [];
    for (const item of data.items) {
      if (!item.khgt) continue;
      const k = item.khgt;
      flat.push({
        year: item.year, pkgVariant: k.pkgVariant, khgtStartCivilDate: k.khgtStartCivilDate,
        witnessName: k.witness?.name ?? null, lat: k.witness?.lat ?? null, lon: k.witness?.lon ?? null,
        geoAlt: k.witness?.geoMoonAltDeg ?? null, geoElong: k.witness?.geoMoonElongDeg ?? null,
        topoAlt: k.witness?.topoMoonAltDeg ?? null,
        totalCandidates: k.scanSummary.totalCandidates, pkg1Passed: k.scanSummary.pkg1Passed, pkg2Passed: k.scanSummary.pkg2Passed,
      });
    }
    const csv = buildCSV(flat, [
      { header: 'year', get: r => r.year },
      { header: 'pkgVariant', get: r => r.pkgVariant },
      { header: 'khgtStartCivilDate', get: r => r.khgtStartCivilDate },
      { header: 'witnessName', get: r => r.witnessName },
      { header: 'witnessLat', get: r => r.lat },
      { header: 'witnessLon', get: r => r.lon },
      { header: 'geoMoonAltDeg', get: r => r.geoAlt },
      { header: 'geoMoonElongDeg', get: r => r.geoElong },
      { header: 'topoMoonAltDeg', get: r => r.topoAlt },
      { header: 'scanTotalCandidates', get: r => r.totalCandidates },
      { header: 'pkg1Passed', get: r => r.pkg1Passed },
      { header: 'pkg2Passed', get: r => r.pkg2Passed },
    ]);
    downloadTextFile(csv, `jejak-khgt-saksi-${suffix}.csv`, 'text/csv;charset=utf-8');
  }

  function handleExportComparisonJSON() {
    if (!data) return;
    downloadTextFile(JSON.stringify(data, null, 2), `audit-lengkap-historis-${suffix}.json`, 'application/json;charset=utf-8');
  }

  function handleExportComparisonCSV() {
    if (!data) return;
    const csv = buildCSV(data.items, [
      { header: 'year', get: r => r.year },
      { header: 'khgtDate', get: r => r.khgt?.khgtStartCivilDate ?? null },
      { header: 'localDate', get: r => r.local?.ramadan1LocalDate ?? null },
      { header: 'officialDate', get: r => r.official.date },
      { header: 'officialStatus', get: r => r.official.status },
      { header: 'khgtVsLocalDays', get: r => r.khgtVsLocalDays },
      { header: 'khgtVsOfficialDays', get: r => r.khgtVsOfficialDays },
      { header: 'localVsOfficialDays', get: r => r.localVsOfficialDays },
      { header: 'reasonIfDifferent', get: r => r.reasonIfDifferent },
    ]);
    downloadTextFile(csv, `perbandingan-historis-${suffix}.csv`, 'text/csv;charset=utf-8');
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1 mb-4 border-b border-white/10 pb-2">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-t text-xs font-medium transition ${tab === k ? 'bg-indigo-700/60 text-white border-b-2 border-indigo-400' : 'text-slate-400 hover:bg-white/5'}`}>
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>

      {(!data || needsReload) && (
        <div className="glass-card p-4 mb-4 flex items-center gap-3">
          <button onClick={loadAudit} disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {loading ? 'Memuat jejak audit...' : needsReload && data ? 'Muat Ulang Audit (parameter berubah)' : 'Muat Jejak Perhitungan Lengkap'}
          </button>
          <span className="text-xs text-slate-500">Menjalankan ulang pipeline KHGT dan Wujudul Hilal Lokal dengan jejak lengkap.</span>
        </div>
      )}

      {error && <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-4 text-red-300 text-sm">{error}</div>}

      {data && !needsReload && dataQualityIssues.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-4">
          <h3 className="font-bold text-amber-300 text-sm mb-1">Peringatan Kualitas Data</h3>
          <p className="text-amber-200/80 text-xs mb-1">
            Baris berikut memakai estimasi/mock karena NASA HORIZONS API tidak dapat diakses saat perhitungan
            ini dijalankan (bukan data live/cache). Jangan jadikan dasar kesimpulan akademik sampai dimuat
            ulang saat API NASA pulih:
          </p>
          <ul className="text-amber-200/70 text-[11px] list-disc list-inside space-y-0.5">
            {dataQualityIssues.map((msg, i) => <li key={i}>{msg}</li>)}
          </ul>
        </div>
      )}

      {data && !needsReload && (
        <>
          {tab === 'lokal' && (
            <div className="space-y-4">
              <div className="glass-card p-4 overflow-x-auto">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">Jejak Perhitungan Lokal (Wujudul Hilal)</h3>
                <table className="min-w-full text-[11px] text-left">
                  <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-1.5">Tahun</th><th className="px-2 py-1.5">Konjungsi (UTC)</th>
                      <th className="px-2 py-1.5">Iterasi NR</th><th className="px-2 py-1.5">Konvergen?</th>
                      <th className="px-2 py-1.5">Bisection Δ(s)</th><th className="px-2 py-1.5">Rule A</th>
                      <th className="px-2 py-1.5">Rule B</th><th className="px-2 py-1.5">Alt Bulan @Sunset°</th>
                      <th className="px-2 py-1.5">Borderline?</th><th className="px-2 py-1.5">Tanggal Ramadan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item, i) => item.local ? (
                      <tr key={i} className="border-t border-white/[0.05]">
                        <td className="px-2 py-1 font-mono text-slate-300">{item.year}</td>
                        <td className="px-2 py-1 font-mono text-slate-300 whitespace-nowrap">{item.local.conjunctionUTC}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{item.local.totalIterations}</td>
                        <td className="px-2 py-1">{item.local.converged ? <span className="text-emerald-400">Ya</span> : <span className="text-red-400">Tidak</span>}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{fmt(item.local.bisectionDeltaSec, 2)}</td>
                        <td className="px-2 py-1">{item.local.ruleA ? 'Ya' : 'Tidak'}</td>
                        <td className="px-2 py-1">{item.local.ruleB ? 'Ya' : 'Tidak'}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{fmt(item.local.moonAltitudeAtSunsetDeg)}</td>
                        <td className="px-2 py-1">{item.local.isBorderline ? <span className="text-amber-400">Ya</span> : 'Tidak'}</td>
                        <td className="px-2 py-1 font-mono text-indigo-300">{item.local.ramadan1LocalDate}</td>
                      </tr>
                    ) : (
                      <tr key={i} className="border-t border-white/[0.05]"><td className="px-2 py-1 font-mono text-slate-500">{item.year}</td><td colSpan={9} className="px-2 py-1 text-slate-600 italic">Tidak ada hasil lokal untuk tahun ini</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="glass-card p-4 overflow-x-auto">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">Kandidat Tanggal yang Diperiksa (D, D+1, D+2, D+3)</h3>
                <table className="min-w-full text-[11px] text-left">
                  <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider">
                    <tr><th className="px-2 py-1.5">Tahun</th><th className="px-2 py-1.5">Tanggal Kandidat</th><th className="px-2 py-1.5">Rule A</th><th className="px-2 py-1.5">Rule B</th><th className="px-2 py-1.5">Alt Bulan°</th><th className="px-2 py-1.5">Terpenuhi?</th></tr>
                  </thead>
                  <tbody>
                    {data.items.flatMap((item) => item.local ? item.local.candidatesChecked.map((c, j) => (
                      <tr key={`${item.year}-${j}`} className="border-t border-white/[0.05]">
                        <td className="px-2 py-1 font-mono text-slate-300">{item.year}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{c.date}</td>
                        <td className="px-2 py-1">{c.result.ruleA ? 'Ya' : 'Tidak'}</td>
                        <td className="px-2 py-1">{c.result.ruleB ? 'Ya' : 'Tidak'}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{fmt(c.result.moonAltAtSunsetDeg)}</td>
                        <td className="px-2 py-1">{c.result.fulfilled ? <span className="text-emerald-400">Ya</span> : <span className="text-slate-500">Tidak</span>}</td>
                      </tr>
                    )) : [])}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'khgt' && (
            <div className="glass-card p-4 overflow-x-auto">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">Jejak KHGT / Saksi Global</h3>
              <table className="min-w-full text-[11px] text-left">
                <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-2 py-1.5">Tahun</th><th className="px-2 py-1.5">Variant PKG</th><th className="px-2 py-1.5">Tgl Mulai KHGT</th>
                    <th className="px-2 py-1.5">Saksi</th><th className="px-2 py-1.5">Lat/Lon Saksi</th>
                    <th className="px-2 py-1.5">Alt Geo°</th><th className="px-2 py-1.5">Elong Geo°</th><th className="px-2 py-1.5">Alt Topo°</th>
                    <th className="px-2 py-1.5">Total Titik / Lolos PKG1 / PKG2</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, i) => item.khgt ? (
                    <tr key={i} className="border-t border-white/[0.05]">
                      <td className="px-2 py-1 font-mono text-slate-300">{item.year}</td>
                      <td className="px-2 py-1 font-mono text-slate-300">{item.khgt.pkgVariant}</td>
                      <td className="px-2 py-1 font-mono text-indigo-300">{item.khgt.khgtStartCivilDate}</td>
                      <td className="px-2 py-1 text-slate-300">{item.khgt.witness?.name ?? '— (istikmal)'}</td>
                      <td className="px-2 py-1 font-mono text-slate-400">{item.khgt.witness ? `${item.khgt.witness.lat.toFixed(2)}, ${item.khgt.witness.lon.toFixed(2)}` : '—'}</td>
                      <td className="px-2 py-1 font-mono text-slate-300">{fmt(item.khgt.witness?.geoMoonAltDeg)}</td>
                      <td className="px-2 py-1 font-mono text-slate-300">{fmt(item.khgt.witness?.geoMoonElongDeg)}</td>
                      <td className="px-2 py-1 font-mono text-slate-300">{fmt(item.khgt.witness?.topoMoonAltDeg ?? null)}</td>
                      <td className="px-2 py-1 font-mono text-slate-400">{item.khgt.scanSummary.totalCandidates} / {item.khgt.scanSummary.pkg1Passed} / {item.khgt.scanSummary.pkg2Passed}</td>
                    </tr>
                  ) : (
                    <tr key={i} className="border-t border-white/[0.05]"><td className="px-2 py-1 font-mono text-slate-500">{item.year}</td><td colSpan={8} className="px-2 py-1 text-slate-600 italic">Tidak ada hasil KHGT untuk tahun ini</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'export' && (
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-1">Export Laporan Historis</h3>
              <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
                <div><span className="text-slate-500">Total Tahun:</span> <span className="font-mono text-slate-300">{data.summary.totalYears}</span></div>
                <div><span className="text-slate-500">Total Baris:</span> <span className="font-mono text-slate-300">{data.summary.totalRows}</span></div>
                <div><span className="text-slate-500">KHGT = Lokal:</span> <span className="font-mono text-slate-300">{data.summary.khgtVsLocalMatches}</span></div>
                <div><span className="text-slate-500">Lokal = Resmi:</span> <span className="font-mono text-slate-300">{data.summary.localVsOfficialMatches}</span></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleExportComparisonCSV} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Export CSV Perbandingan</button>
                <button onClick={handleExportLocalIterations} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Export CSV Iterasi NR Lokal</button>
                <button onClick={handleExportLocalCandidates} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Export CSV Kandidat Tanggal Lokal</button>
                <button onClick={handleExportKhgtWitness} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Export CSV Saksi KHGT</button>
                <button onClick={handleExportComparisonJSON} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Export Semua (JSON)</button>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed pt-2">{data.disclaimer}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
