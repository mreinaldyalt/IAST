'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConjunctionRow } from '@/app/api/konjungsi-periode/route';
import type { NRTraceEntry, SignChangeEvent, BracketAuditEntry, DuplicateRemovedEntry } from '@/lib/newMoonNR';
import type { PostConjunctionAuditRow } from '@/app/api/audit/konjungsi-periode/route';
import type { StageMappingEntry } from '@/lib/auditFormulas';

/**
 * Single "Unduh Data" menu covering the ENTIRE tested period (fromYear–toYear),
 * not just the currently visible/filtered table rows. Basic exports (from `rows`,
 * already in memory) download instantly; audit-detail exports (scan, bracket,
 * iterations, ...) are fetched from /api/audit/konjungsi-periode on first click
 * and cached for the session so repeat downloads for the same period are instant.
 */

interface AuditResponse {
  metadata: { fromYear: number; toYear: number; lat: number; lon: number; tz: string };
  scanResults: { events: SignChangeEvent[] };
  brackets: BracketAuditEntry[];
  newtonRaphsonIterations: NRTraceEntry[];
  deduplication: { duplicatesRemoved: DuplicateRemovedEntry[] };
  postConjunctionEvaluation: PostConjunctionAuditRow[];
  stageMapping: StageMappingEntry[];
}

type CsvCell = string | number | boolean | null | undefined;
type CsvColumn<T> = { header: string; get: (r: T) => CsvCell };

function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function buildCSV<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => csvEscape(c.header)).join(',');
  const lines = rows.map((r) => columns.map((c) => csvEscape(c.get(r))).join(','));
  return [header, ...lines].join('\r\n');
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const FULL_COLUMNS: CsvColumn<ConjunctionRow>[] = [
  { header: 'year', get: r => r.year },
  { header: 'conjDate', get: r => r.conjDate },
  { header: 'conjTimeUTC', get: r => r.conjTimeUTC },
  { header: 'conjISO', get: r => r.conjISO },
  { header: 'sunsetLocal', get: r => r.sunsetLocal },
  { header: 'sunsetUTC', get: r => r.sunsetUTC },
  { header: 'moonAgeHours', get: r => r.moonAgeHours },
  { header: 'eclMoonDeg', get: r => r.eclMoonDeg },
  { header: 'eclSunDeg', get: r => r.eclSunDeg },
  { header: 'eclDiffDeg', get: r => r.eclDiffDeg },
  { header: 'eclDataValid', get: r => r.eclDataValid },
  { header: 'geoElongDeg', get: r => r.geoElongDeg },
  { header: 'geoMoonAltDeg', get: r => r.geoMoonAltDeg },
  { header: 'raMoonDeg', get: r => r.raMoonDeg },
  { header: 'decMoonDeg', get: r => r.decMoonDeg },
  { header: 'raSunDeg', get: r => r.raSunDeg },
  { header: 'decSunDeg', get: r => r.decSunDeg },
  { header: 'topoMoonAltDeg', get: r => r.topoMoonAltDeg },
  { header: 'topoMoonAzDeg', get: r => r.topoMoonAzDeg },
  { header: 'khgtPass', get: r => r.khgtPass },
  { header: 'khgtAltMargin', get: r => r.khgtAltMargin },
  { header: 'khgtElongMargin', get: r => r.khgtElongMargin },
  { header: 'whRuleA', get: r => r.whRuleA },
  { header: 'whRuleB', get: r => r.whRuleB },
  { header: 'whFulfilled', get: r => r.whFulfilled },
  { header: 'whIsBorderline', get: r => r.whIsBorderline },
  { header: 'whMoonAltAtSunsetDeg', get: r => r.whMoonAltAtSunsetDeg },
  { header: 'isRamadanCandidate', get: r => r.isRamadanCandidate },
  { header: 'candidateDistDays', get: r => r.candidateDistDays },
  { header: 'candidateNote', get: r => r.candidateNote },
  { header: 'whNote', get: r => r.whNote },
];

const CANDIDATE_COLUMNS: CsvColumn<ConjunctionRow>[] = [
  { header: 'year', get: r => r.year },
  { header: 'conjDate', get: r => r.conjDate },
  { header: 'conjTimeUTC', get: r => r.conjTimeUTC },
  { header: 'sunsetLocal', get: r => r.sunsetLocal },
  { header: 'moonAgeHours', get: r => r.moonAgeHours },
  { header: 'isRamadanCandidate', get: r => r.isRamadanCandidate },
  { header: 'candidateDistDays', get: r => r.candidateDistDays },
  { header: 'candidateNote', get: r => r.candidateNote },
];

interface MenuItem {
  key: string;
  label: string;
  hint?: string;
  run: () => Promise<void> | void;
}

export default function DownloadMenu({
  fromYear, toYear, lat, lon, tz, rows,
}: {
  fromYear: number; toYear: number; lat: number; lon: number; tz: string; rows: ConjunctionRow[];
}) {
  const [open, setOpen] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [auditData, setAuditData] = useState<AuditResponse | null>(null);
  const [auditFetchedFor, setAuditFetchedFor] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const paramsKey = `${fromYear}-${toYear}-${lat}-${lon}-${tz}`;
  const suffix = `${fromYear}-${toYear}`;
  const candidateCount = rows.filter(r => r.isRamadanCandidate).length;

  async function ensureAuditData(): Promise<AuditResponse> {
    if (auditData && auditFetchedFor === paramsKey) return auditData;
    const params = new URLSearchParams({
      fromYear: String(fromYear), toYear: String(toYear), lat: String(lat), lon: String(lon), tz,
    });
    const resp = await fetch(`/api/audit/konjungsi-periode?${params.toString()}`);
    const json = await resp.json();
    if (json.error) throw new Error(json.error);
    setAuditData(json);
    setAuditFetchedFor(paramsKey);
    return json;
  }

  async function run(item: MenuItem) {
    setError('');
    setLoadingKey(item.key);
    try {
      await item.run();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingKey(null);
    }
  }

  const basicItems: MenuItem[] = [
    {
      key: 'all', label: 'Semua Konjungsi (CSV)', hint: `${rows.length} baris, seluruh ${fromYear}–${toYear}`,
      run: () => downloadTextFile(buildCSV(rows, FULL_COLUMNS), `konjungsi-periode-${suffix}.csv`, 'text/csv;charset=utf-8'),
    },
    {
      key: 'candidates', label: 'Kandidat Ramadan (CSV)', hint: `${candidateCount} baris`,
      run: () => downloadTextFile(buildCSV(rows.filter(r => r.isRamadanCandidate), CANDIDATE_COLUMNS), `kandidat-ramadan-${suffix}.csv`, 'text/csv;charset=utf-8'),
    },
    {
      key: 'detail', label: 'Detail Kandidat (CSV, semua kolom)', hint: `${candidateCount} baris`,
      run: () => downloadTextFile(buildCSV(rows.filter(r => r.isRamadanCandidate), FULL_COLUMNS), `detail-kandidat-${suffix}.csv`, 'text/csv;charset=utf-8'),
    },
    {
      key: 'json-basic', label: 'Ringkasan Lengkap (JSON)',
      run: () => downloadTextFile(
        JSON.stringify({ rows, yearRange: { fromYear, toYear }, location: { lat, lon, tz } }, null, 2),
        `data-konjungsi-${suffix}.json`, 'application/json;charset=utf-8'
      ),
    },
  ];

  const auditItems: MenuItem[] = [
    {
      key: 'signchange', label: 'Scan & Sign Change (CSV)',
      run: async () => {
        const d = await ensureAuditData();
        const csv = buildCSV(d.scanResults.events, [
          { header: 'index', get: (r: SignChangeEvent) => r.index },
          { header: 't1', get: (r: SignChangeEvent) => r.t1 },
          { header: 't2', get: (r: SignChangeEvent) => r.t2 },
          { header: 'eclMoon1', get: (r: SignChangeEvent) => r.eclMoon1 },
          { header: 'eclSun1', get: (r: SignChangeEvent) => r.eclSun1 },
          { header: 'f1', get: (r: SignChangeEvent) => r.f1 },
          { header: 'eclMoon2', get: (r: SignChangeEvent) => r.eclMoon2 },
          { header: 'eclSun2', get: (r: SignChangeEvent) => r.eclSun2 },
          { header: 'f2', get: (r: SignChangeEvent) => r.f2 },
          { header: 'isOpposition', get: (r: SignChangeEvent) => r.isOpposition },
          { header: 'keptAsBracket', get: (r: SignChangeEvent) => r.keptAsBracket },
        ]);
        downloadTextFile(csv, `scan-sign-change-${suffix}.csv`, 'text/csv;charset=utf-8');
      },
    },
    {
      key: 'bracket', label: 'Bracket Konjungsi (CSV)',
      run: async () => {
        const d = await ensureAuditData();
        const csv = buildCSV(d.brackets, [
          { header: 'index', get: (r: BracketAuditEntry) => r.index },
          { header: 't1', get: (r: BracketAuditEntry) => r.t1 },
          { header: 't2', get: (r: BracketAuditEntry) => r.t2 },
          { header: 'f1', get: (r: BracketAuditEntry) => r.f1 },
          { header: 'f2', get: (r: BracketAuditEntry) => r.f2 },
          { header: 'midpointInitialGuessUTC', get: (r: BracketAuditEntry) => r.midpointInitialGuessUTC },
        ]);
        downloadTextFile(csv, `bracket-konjungsi-${suffix}.csv`, 'text/csv;charset=utf-8');
      },
    },
    {
      key: 'iterations', label: 'Iterasi Newton-Raphson (CSV, seluruh periode)',
      run: async () => {
        const d = await ensureAuditData();
        type FlatIter = { bracketIndex: number; conjunctionISO: string | null; converged: boolean; usedBisection: boolean } & NRTraceEntry['iterations'][number];
        const flat: FlatIter[] = [];
        for (const trace of d.newtonRaphsonIterations) {
          for (const it of trace.iterations) {
            flat.push({ bracketIndex: trace.bracketIndex, conjunctionISO: trace.finalConjunctionISO, converged: trace.converged, usedBisection: trace.usedBisection, ...it });
          }
        }
        const csv = buildCSV(flat, [
          { header: 'bracketIndex', get: r => r.bracketIndex },
          { header: 'conjunctionISO', get: r => r.conjunctionISO },
          { header: 'iteration', get: r => r.iteration },
          { header: 'epochUTC', get: r => r.epochUTC },
          { header: 'jd', get: r => r.jd },
          { header: 'eclMoonDeg', get: r => r.eclMoonDeg },
          { header: 'eclSunDeg', get: r => r.eclSunDeg },
          { header: 'deltaRawDeg', get: r => r.deltaRawDeg },
          { header: 'fDeg', get: r => r.fDeg },
          { header: 'tMinusUTC', get: r => r.tMinusUTC },
          { header: 'fAtTMinus', get: r => r.fAtTMinus },
          { header: 'tPlusUTC', get: r => r.tPlusUTC },
          { header: 'fAtTPlus', get: r => r.fAtTPlus },
          { header: 'fPrimeDegPerSec', get: r => r.fPrimeDegPerSec },
          { header: 'stepSec', get: r => r.stepSec },
          { header: 'epsAngleUsed', get: r => r.epsAngleUsed },
          { header: 'epsTimeUsed', get: r => r.epsTimeUsed },
          { header: 'convergedThisStep', get: r => r.convergedThisStep },
          { header: 'convergenceReason', get: r => r.convergenceReason },
          { header: 'converged', get: r => r.converged },
          { header: 'usedBisection', get: r => r.usedBisection },
        ]);
        downloadTextFile(csv, `newton-raphson-iterasi-${suffix}.csv`, 'text/csv;charset=utf-8');
      },
    },
    {
      key: 'dedup', label: 'Deduplikasi (CSV)',
      run: async () => {
        const d = await ensureAuditData();
        const csv = buildCSV(d.deduplication.duplicatesRemoved, [
          { header: 'keptISO', get: (r: DuplicateRemovedEntry) => r.keptISO },
          { header: 'removedISO', get: (r: DuplicateRemovedEntry) => r.removedISO },
          { header: 'diffHours', get: (r: DuplicateRemovedEntry) => r.diffHours },
        ]);
        downloadTextFile(csv, `deduplikasi-${suffix}.csv`, 'text/csv;charset=utf-8');
      },
    },
    {
      key: 'postconj', label: 'Evaluasi Pasca-Konjungsi (CSV)',
      run: async () => {
        const d = await ensureAuditData();
        const csv = buildCSV(d.postConjunctionEvaluation, [
          { header: 'year', get: (r: PostConjunctionAuditRow) => r.year },
          { header: 'conjISO', get: (r: PostConjunctionAuditRow) => r.conjISO },
          { header: 'candidateNote', get: (r: PostConjunctionAuditRow) => r.candidateNote },
          { header: 'candidateDistDays', get: (r: PostConjunctionAuditRow) => r.candidateDistDays },
          { header: 'sunsetLocal', get: (r: PostConjunctionAuditRow) => r.sunsetLocal },
          { header: 'sunsetUTC', get: (r: PostConjunctionAuditRow) => r.sunsetUTC },
          { header: 'geoElongDeg', get: (r: PostConjunctionAuditRow) => r.geoElongDeg },
          { header: 'geoMoonAltDeg', get: (r: PostConjunctionAuditRow) => r.geoMoonAltDeg },
          { header: 'topoMoonAltDeg', get: (r: PostConjunctionAuditRow) => r.topoMoonAltDeg },
          { header: 'topoMoonAzDeg', get: (r: PostConjunctionAuditRow) => r.topoMoonAzDeg },
          { header: 'khgtPass', get: (r: PostConjunctionAuditRow) => r.khgtPass },
          { header: 'khgtAltMargin', get: (r: PostConjunctionAuditRow) => r.khgtAltMargin },
          { header: 'khgtElongMargin', get: (r: PostConjunctionAuditRow) => r.khgtElongMargin },
          { header: 'whRuleA', get: (r: PostConjunctionAuditRow) => r.whRuleA },
          { header: 'whRuleB', get: (r: PostConjunctionAuditRow) => r.whRuleB },
          { header: 'whFulfilled', get: (r: PostConjunctionAuditRow) => r.whFulfilled },
          { header: 'whIsBorderline', get: (r: PostConjunctionAuditRow) => r.whIsBorderline },
          { header: 'dataRejectedAsMock', get: (r: PostConjunctionAuditRow) => r.dataRejectedAsMock },
        ]);
        downloadTextFile(csv, `evaluasi-pasca-konjungsi-${suffix}.csv`, 'text/csv;charset=utf-8');
      },
    },
    {
      key: 'stages', label: '17 Tahapan Bab III (CSV)',
      run: async () => {
        const d = await ensureAuditData();
        const csv = buildCSV(d.stageMapping, [
          { header: 'stage', get: (r: StageMappingEntry) => r.stage },
          { header: 'name', get: (r: StageMappingEntry) => r.name },
          { header: 'systemProcess', get: (r: StageMappingEntry) => r.systemProcess },
          { header: 'evidence', get: (r: StageMappingEntry) => r.evidence },
          { header: 'evidenceForm', get: (r: StageMappingEntry) => r.evidenceForm },
          { header: 'output', get: (r: StageMappingEntry) => r.output },
          { header: 'codeRef', get: (r: StageMappingEntry) => r.codeRef },
          { header: 'status', get: (r: StageMappingEntry) => r.status },
          { header: 'note', get: (r: StageMappingEntry) => r.note },
        ]);
        downloadTextFile(csv, `jejak-17-tahapan-${suffix}.csv`, 'text/csv;charset=utf-8');
      },
    },
    {
      key: 'json-audit', label: 'Audit Lengkap (JSON, semua tabel di atas)',
      run: async () => {
        const d = await ensureAuditData();
        downloadTextFile(JSON.stringify(d, null, 2), `audit-lengkap-${suffix}.json`, 'application/json;charset=utf-8');
      },
    },
  ];

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => setOpen(p => !p)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 transition flex items-center gap-1.5"
      >
        Unduh Data ({fromYear}–{toYear})
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>&#9662;</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0b1026] shadow-2xl shadow-black/50">
          <div className="px-3 py-2 border-b border-white/10">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Periode diuji</p>
            <p className="text-xs text-slate-300">{fromYear}–{toYear} &middot; {rows.length} konjungsi &middot; {candidateCount} kandidat Ramadan</p>
          </div>

          <div className="px-3 py-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">Data Dasar</p>
            <ul className="space-y-0.5">
              {basicItems.map(item => (
                <li key={item.key}>
                  <button
                    onClick={() => run(item)}
                    disabled={loadingKey !== null}
                    className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-200 hover:bg-white/10 transition disabled:opacity-40 flex items-center justify-between gap-2"
                  >
                    <span>{item.label}{item.hint && <span className="block text-[10px] text-slate-500">{item.hint}</span>}</span>
                    {loadingKey === item.key && <span className="text-[10px] text-indigo-300 animate-pulse">...</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="px-3 py-2 border-t border-white/10">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">
              Data Audit Detail
            </p>
            <p className="text-[10px] text-slate-600 mb-1.5">Dihitung ulang dari scan + Newton-Raphson saat pertama diklik (ter-cache setelahnya).</p>
            <ul className="space-y-0.5">
              {auditItems.map(item => (
                <li key={item.key}>
                  <button
                    onClick={() => run(item)}
                    disabled={loadingKey !== null}
                    className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-200 hover:bg-white/10 transition disabled:opacity-40 flex items-center justify-between gap-2"
                  >
                    <span>{item.label}</span>
                    {loadingKey === item.key && <span className="text-[10px] text-indigo-300 animate-pulse">memuat...</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="px-3 py-2 border-t border-white/10 text-[11px] text-red-400">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
