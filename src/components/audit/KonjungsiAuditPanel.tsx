'use client';

import { useState } from 'react';
import type { NRTraceEntry, SignChangeEvent, BracketAuditEntry, DuplicateRemovedEntry, NRIteration } from '@/lib/newMoonNR';
import type { PostConjunctionAuditRow } from '@/app/api/audit/konjungsi-periode/route';
import { FORMULAS, getFormula, type StageMappingEntry } from '@/lib/auditFormulas';
import FormulaBlock from './FormulaBlock';

/* ------------------------------------------------------------------ */
/*  Types (mirrors the /api/audit/konjungsi-periode response shape)    */
/* ------------------------------------------------------------------ */

interface AuditResponse {
  metadata: {
    fromYear: number; toYear: number; lat: number; lon: number; tz: string;
    windowStartUTC: string; windowEndUTC: string; generatedAt: string;
    algorithm: string; epsAngleDeg: number; epsTimeSec: number; maxIterations: number;
    scanStepHours: number; dedupThresholdHours: number;
  };
  crispdm: Record<string, string>;
  dataPreparation: {
    scanEpochCount: number; scanBatchCount: number; batchSizeMaxEpochs: number;
    horizonsCallsPhase1Scan: number; liveCount: number; cacheCount: number;
    mockCount: number; failedCount: number; note: string;
  };
  scanResults: {
    totalSignChanges: number; keptAsBracket: number; filteredAsOpposition: number;
    events: SignChangeEvent[];
  };
  brackets: BracketAuditEntry[];
  newtonRaphsonIterations: NRTraceEntry[];
  fallbackBisection: { count: number; details: NRTraceEntry[] };
  deduplication: { rawCount: number; dedupedCount: number; duplicatesRemoved: DuplicateRemovedEntry[] };
  postConjunctionEvaluation: PostConjunctionAuditRow[];
  stageMapping: StageMappingEntry[];
  summary: {
    totalConjunctions: number; totalCandidates: number; totalNRIterations: number;
    avgIterationsPerConjunction: number; bisectionFallbackCount: number; dedupRemovedCount: number;
    scanEpochCount: number; scanApiCallCount: number; liveCount: number; cacheCount: number;
    mockCount: number; failedCount: number;
    academicValidityStatus: 'VALID_FOR_THESIS' | 'PARTIAL_VALID' | 'NOT_VALID_MOCK';
    academicValidityReason: string;
  };
  disclaimer: string;
}

interface WorkedExample {
  metadata: { year: number; lat: number; lon: number; tz: string; generatedAt: string; windowStartUTC: string; windowEndUTC: string; estimatedCenterUTC: string };
  dataAwal: {
    periode: string; objek: string; lokasi: { lat: number; lon: number; tz: string; label: string };
    sumberData: string; epochCount: number; bracket: { t1: string; t2: string; f1: number; f2: number };
  };
  fungsiSelisih: {
    t1: { epochUTC: string; eclMoonDeg: number; eclSunDeg: number; deltaRawDeg: number };
    t2: { epochUTC: string; eclMoonDeg: number; eclSunDeg: number; deltaRawDeg: number };
  } | null;
  wrapTo180: {
    t1: { deltaRawDeg: number; wrappedDeltaDeg: number };
    t2: { deltaRawDeg: number; wrappedDeltaDeg: number };
  } | null;
  signChange: { f1: number; f2: number; product: number; isSignChange: boolean };
  initialGuess: { t0UTC: string };
  iterations: NRIteration[];
  firstIterationDetail: NRIteration | null;
  lastIterationDetail: NRIteration | null;
  hasil: { conjunctionUTC: string; conjunctionLocal: string | null; totalIterations: number; converged: boolean; usedBisection: boolean; bisectionDetail: unknown };
  pascaKonjungsi: {
    sunsetLocal: string | null; sunsetUTC: string | null; moonAgeHours: number | null;
    topoMoonAltDeg: number | null; topoMoonAzDeg: number | null; geoElongDeg: number | null; geoMoonAltDeg: number | null;
    ruleA: boolean | null; ruleB: boolean | null; fulfilled: boolean | null; isBorderline: boolean | null; khgtPass: boolean | null;
  };
  kesimpulan: string;
}

type AuditTabKey =
  | 'ringkasan' | 'tahapan' | 'dataprep' | 'wrap' | 'scan' | 'bracket'
  | 'iterasi' | 'contoh' | 'fallback' | 'pasca' | 'export';

const TAB_LABELS: Record<AuditTabKey, string> = {
  ringkasan: 'Ringkasan Audit',
  tahapan: 'Jejak 17 Tahapan',
  dataprep: 'Data Preparation',
  wrap: 'wrapTo180',
  scan: 'Scan & Sign Change',
  bracket: 'Bracket',
  iterasi: 'Iterasi Newton-Raphson',
  contoh: 'Contoh Perhitungan Lengkap 2025',
  fallback: 'Fallback & Deduplikasi',
  pasca: 'Evaluasi Pasca-Konjungsi',
  export: 'Export Paket Bab IV',
};

/* ------------------------------------------------------------------ */
/*  CSV / text export helpers                                          */
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
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmt(v: number | null | undefined, dec = 4): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(dec);
}

function bool(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v ? 'Ya' : 'Tidak';
}

/* ------------------------------------------------------------------ */
/*  Markdown builder for "Export Paket Bab IV"                         */
/* ------------------------------------------------------------------ */

function buildBab4Markdown(data: AuditResponse, example: WorkedExample | null): string {
  const lines: string[] = [];
  lines.push(`# Paket Audit Komputasi Bab IV — Konjungsi ${data.metadata.fromYear}-${data.metadata.toYear}`);
  lines.push(`Dibuat: ${data.metadata.generatedAt}`);
  lines.push('');
  lines.push('## 1. Ringkasan 17 Tahapan (Bab III)');
  lines.push('');
  lines.push('| # | Tahap | Proses Sistem | Bentuk Bukti | Output | Status |');
  lines.push('|---|---|---|---|---|---|');
  for (const s of data.stageMapping) {
    lines.push(`| ${s.stage} | ${s.name} | ${s.systemProcess.replace(/\|/g, '\\|')} | ${s.evidenceForm} | ${s.output.replace(/\|/g, '\\|')} | ${s.status} |`);
  }
  lines.push('');
  lines.push('## 2. Rumus dan Interpretasi');
  lines.push('');
  for (const f of FORMULAS) {
    lines.push(`### ${f.title}`);
    lines.push('```');
    lines.push(f.formula);
    lines.push('```');
    lines.push(`Variabel: ${f.variables}`);
    lines.push('');
    lines.push(`Interpretasi: ${f.interpretation}`);
    lines.push('');
  }
  lines.push('## 3. Data Preparation');
  lines.push(`- Jendela waktu: ${data.metadata.windowStartUTC} s.d. ${data.metadata.windowEndUTC}`);
  lines.push(`- Jumlah titik scan (interval 6 jam): ${data.dataPreparation.scanEpochCount}`);
  lines.push(`- Jumlah batch HORIZONS: ${data.dataPreparation.scanBatchCount} (maks ${data.dataPreparation.batchSizeMaxEpochs} epoch/batch)`);
  lines.push(`- Total permintaan HORIZONS tahap scan: ${data.dataPreparation.horizonsCallsPhase1Scan}`);
  lines.push(`- Live/Cache/Mock/Failed: ${data.dataPreparation.liveCount}/${data.dataPreparation.cacheCount}/${data.dataPreparation.mockCount}/${data.dataPreparation.failedCount}`);
  lines.push('');
  lines.push('## 4. Scan & Sign Change');
  lines.push(`- Total transisi tanda: ${data.scanResults.totalSignChanges}`);
  lines.push(`- Lolos sebagai bracket konjungsi: ${data.scanResults.keptAsBracket}`);
  lines.push(`- Tersaring sebagai oposisi/purnama: ${data.scanResults.filteredAsOpposition}`);
  lines.push('');
  lines.push('## 5. Bracket Konjungsi');
  lines.push(`- Total bracket diproses Newton-Raphson: ${data.brackets.length}`);
  lines.push('');

  if (example) {
    lines.push(`## 6. Contoh Perhitungan Lengkap — Tahun ${example.metadata.year}`);
    lines.push('');
    lines.push(`**Data awal**: periode ${example.dataAwal.periode}; objek ${example.dataAwal.objek}; lokasi ${example.dataAwal.lokasi.label}; sumber data ${example.dataAwal.sumberData}; jumlah epoch scan ${example.dataAwal.epochCount}.`);
    lines.push('');
    lines.push(`Bracket konjungsi: t1=${example.dataAwal.bracket.t1}, t2=${example.dataAwal.bracket.t2}, f(t1)=${fmt(example.dataAwal.bracket.f1, 6)}°, f(t2)=${fmt(example.dataAwal.bracket.f2, 6)}°.`);
    lines.push('');
    if (example.fungsiSelisih) {
      lines.push('**Pembentukan fungsi selisih Δλ = λ_Bulan − λ_Matahari:**');
      lines.push(`- Δλ(t1) = ${fmt(example.fungsiSelisih.t1.eclMoonDeg,6)}° − ${fmt(example.fungsiSelisih.t1.eclSunDeg,6)}° = ${fmt(example.fungsiSelisih.t1.deltaRawDeg,6)}°`);
      lines.push(`- Δλ(t2) = ${fmt(example.fungsiSelisih.t2.eclMoonDeg,6)}° − ${fmt(example.fungsiSelisih.t2.eclSunDeg,6)}° = ${fmt(example.fungsiSelisih.t2.deltaRawDeg,6)}°`);
      lines.push('');
    }
    if (example.wrapTo180) {
      lines.push('**Normalisasi wrapTo180, f(t) = wrapTo180(Δλ):**');
      lines.push(`- f(t1) = wrapTo180(${fmt(example.wrapTo180.t1.deltaRawDeg,6)}°) = ${fmt(example.wrapTo180.t1.wrappedDeltaDeg,6)}°`);
      lines.push(`- f(t2) = wrapTo180(${fmt(example.wrapTo180.t2.deltaRawDeg,6)}°) = ${fmt(example.wrapTo180.t2.wrappedDeltaDeg,6)}°`);
      lines.push('');
    }
    lines.push(`**Deteksi sign change**: f(t1) × f(t2) = ${fmt(example.signChange.f1,4)} × ${fmt(example.signChange.f2,4)} = ${fmt(example.signChange.product,4)} ${example.signChange.isSignChange ? '< 0 → terdapat akar (konjungsi) di antara t1 dan t2.' : '≥ 0.'}`);
    lines.push('');
    lines.push(`**Initial guess**: t0 = (t1+t2)/2 = ${example.initialGuess.t0UTC}`);
    lines.push('');
    if (example.firstIterationDetail) {
      const it = example.firstIterationDetail;
      lines.push('**Iterasi pertama (central difference & koreksi Newton-Raphson):**');
      lines.push(`- f'(t0) = (f(t0+60s) − f(t0−60s)) / 120 = (${fmt(it.fAtTPlus,6)} − (${fmt(it.fAtTMinus,6)})) / 120 = ${it.fPrimeDegPerSec?.toExponential(6)} °/detik`);
      lines.push(`- stepSec = −f(t0)/f'(t0) = −(${fmt(it.fDeg,6)}) / ${it.fPrimeDegPerSec?.toExponential(6)} = ${fmt(it.stepSec,2)} detik`);
      lines.push(`- |f(t0)| = ${Math.abs(it.fDeg).toExponential(3)}° dibanding epsAngle=${it.epsAngleUsed} → ${it.convergedThisStep ? 'konvergen' : 'belum konvergen, lanjut ke iterasi berikutnya'}`);
      lines.push('');
    }
    lines.push('**Tabel iterasi:**');
    lines.push('');
    lines.push('| Iterasi | t_n (UTC) | f(t_n)° | f\'(t_n) | stepSec | Konvergen |');
    lines.push('|---|---|---|---|---|---|');
    for (const it of example.iterations) {
      lines.push(`| ${it.iteration} | ${it.epochUTC} | ${fmt(it.fDeg,6)} | ${it.fPrimeDegPerSec?.toExponential(4)} | ${fmt(it.stepSec,3)} | ${it.convergedThisStep ? 'Ya' : 'Tidak'} |`);
    }
    lines.push('');
    lines.push(`**Hasil akhir**: waktu konjungsi UTC ${example.hasil.conjunctionUTC} (lokal ${example.hasil.conjunctionLocal}), total iterasi ${example.hasil.totalIterations}, konvergen: ${example.hasil.converged ? 'Ya' : 'Tidak'}, fallback bisection: ${example.hasil.usedBisection ? 'Ya' : 'Tidak'}.`);
    lines.push('');
    lines.push(`**Evaluasi pasca-konjungsi Kota Bekasi**: sunset lokal ${example.pascaKonjungsi.sunsetLocal}, umur bulan ${fmt(example.pascaKonjungsi.moonAgeHours,2)} jam, altitude topocentric ${fmt(example.pascaKonjungsi.topoMoonAltDeg)}°, azimut ${fmt(example.pascaKonjungsi.topoMoonAzDeg)}°, elongasi geosentris ${fmt(example.pascaKonjungsi.geoElongDeg)}°, Rule A: ${bool(example.pascaKonjungsi.ruleA)}, Rule B: ${bool(example.pascaKonjungsi.ruleB)}, status Wujudul Hilal: ${example.pascaKonjungsi.fulfilled ? 'terpenuhi' : 'tidak terpenuhi'}${example.pascaKonjungsi.isBorderline ? ' (borderline)' : ''}.`);
    lines.push('');
    lines.push(`**Kesimpulan**: ${example.kesimpulan}`);
    lines.push('');
  }

  lines.push('## 7. Ringkasan Konvergensi & Fallback (seluruh periode)');
  lines.push(`- Total iterasi Newton-Raphson: ${data.summary.totalNRIterations} (rata-rata ${data.summary.avgIterationsPerConjunction}/konjungsi)`);
  lines.push(`- Fallback bisection dipakai: ${data.summary.bisectionFallbackCount} kali`);
  lines.push('');
  lines.push('## 8. Deduplikasi');
  lines.push(`- ${data.deduplication.rawCount} hasil mentah → ${data.deduplication.dedupedCount} setelah deduplikasi 12 jam (${data.deduplication.duplicatesRemoved.length} dibuang)`);
  lines.push('');
  lines.push('## 9. Evaluasi Pasca-Konjungsi (kandidat awal Ramadan)');
  lines.push('');
  lines.push('| Tahun | Konjungsi (UTC) | Sunset Lokal | Alt Topo° | Elong° | Rule A | Rule B | WH Terpenuhi |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of data.postConjunctionEvaluation) {
    lines.push(`| ${r.year} | ${r.conjISO} | ${r.sunsetLocal ?? '—'} | ${fmt(r.topoMoonAltDeg)} | ${fmt(r.geoElongDeg)} | ${bool(r.whRuleA)} | ${bool(r.whRuleB)} | ${bool(r.whFulfilled)} |`);
  }
  lines.push('');
  lines.push('## 10. Status Validitas Akademik');
  lines.push(`${data.summary.academicValidityStatus}: ${data.summary.academicValidityReason}`);
  lines.push('');
  lines.push('---');
  lines.push(data.disclaimer);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Main panel                                                          */
/* ------------------------------------------------------------------ */

export default function KonjungsiAuditPanel({
  fromYear, toYear, lat, lon, tz,
}: {
  fromYear: number; toYear: number; lat: number; lon: number; tz: string;
}) {
  const [tab, setTab] = useState<AuditTabKey>('ringkasan');
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchedFor, setFetchedFor] = useState('');

  const [exampleYear, setExampleYear] = useState(2025);
  const [example, setExample] = useState<WorkedExample | null>(null);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [exampleError, setExampleError] = useState('');
  const [exampleFetchedFor, setExampleFetchedFor] = useState<number | null>(null);

  const paramsKey = `${fromYear}-${toYear}-${lat}-${lon}-${tz}`;
  const needsReload = fetchedFor !== paramsKey;

  async function loadAudit() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        fromYear: String(fromYear), toYear: String(toYear),
        lat: String(lat), lon: String(lon), tz,
      });
      const resp = await fetch(`/api/audit/konjungsi-periode?${params.toString()}`);
      const json = await resp.json();
      if (json.error) setError(json.error);
      else { setData(json as AuditResponse); setFetchedFor(paramsKey); }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadExample(year: number) {
    setExampleLoading(true);
    setExampleError('');
    try {
      const params = new URLSearchParams({ year: String(year), lat: String(lat), lon: String(lon), tz });
      const resp = await fetch(`/api/audit/contoh-perhitungan?${params.toString()}`);
      const json = await resp.json();
      if (json.error) setExampleError(json.error);
      else { setExample(json as WorkedExample); setExampleFetchedFor(year); }
    } catch (e) {
      setExampleError((e as Error).message);
    } finally {
      setExampleLoading(false);
    }
  }

  const suffix = `${fromYear}-${toYear}`;

  function handleExportSignChanges() {
    if (!data) return;
    const csv = buildCSV(data.scanResults.events, [
      { header: 'index', get: (r) => r.index },
      { header: 't1', get: (r) => r.t1 }, { header: 't2', get: (r) => r.t2 },
      { header: 'eclMoon1_BujurEklipBulan', get: (r) => r.eclMoon1 },
      { header: 'eclSun1_BujurEklipMatahari', get: (r) => r.eclSun1 },
      { header: 'deltaRaw1', get: (r) => r.deltaRaw1 },
      { header: 'f1_wrapTo180', get: (r) => r.f1 },
      { header: 'eclMoon2_BujurEklipBulan', get: (r) => r.eclMoon2 },
      { header: 'eclSun2_BujurEklipMatahari', get: (r) => r.eclSun2 },
      { header: 'deltaRaw2', get: (r) => r.deltaRaw2 },
      { header: 'f2_wrapTo180', get: (r) => r.f2 },
      { header: 'isOpposition_TersaringOposisi', get: (r) => r.isOpposition },
      { header: 'keptAsBracket_LolosBracket', get: (r) => r.keptAsBracket },
    ]);
    downloadTextFile(csv, `scan-sign-change-${suffix}.csv`, 'text/csv;charset=utf-8');
  }

  function handleExportBrackets() {
    if (!data) return;
    const csv = buildCSV(data.brackets, [
      { header: 'index', get: (r) => r.index },
      { header: 't1', get: (r) => r.t1 }, { header: 't2', get: (r) => r.t2 },
      { header: 'f1', get: (r) => r.f1 }, { header: 'f2', get: (r) => r.f2 },
      { header: 'midpointInitialGuessUTC_t0', get: (r) => r.midpointInitialGuessUTC },
    ]);
    downloadTextFile(csv, `bracket-konjungsi-${suffix}.csv`, 'text/csv;charset=utf-8');
  }

  function handleExportIterations() {
    if (!data) return;
    type FlatIter = { bracketIndex: number; conjunctionISO: string | null; converged: boolean; usedBisection: boolean } & NRTraceEntry['iterations'][number];
    const flat: FlatIter[] = [];
    for (const trace of data.newtonRaphsonIterations) {
      for (const it of trace.iterations) {
        flat.push({ bracketIndex: trace.bracketIndex, conjunctionISO: trace.finalConjunctionISO, converged: trace.converged, usedBisection: trace.usedBisection, ...it });
      }
    }
    const csv = buildCSV(flat, [
      { header: 'bracketIndex', get: (r) => r.bracketIndex },
      { header: 'conjunctionISO', get: (r) => r.conjunctionISO },
      { header: 'iteration', get: (r) => r.iteration },
      { header: 'epochUTC_tn', get: (r) => r.epochUTC },
      { header: 'jd', get: (r) => r.jd },
      { header: 'eclMoonDeg', get: (r) => r.eclMoonDeg },
      { header: 'eclSunDeg', get: (r) => r.eclSunDeg },
      { header: 'deltaRawDeg', get: (r) => r.deltaRawDeg },
      { header: 'fDeg_ft', get: (r) => r.fDeg },
      { header: 'tMinusUTC', get: (r) => r.tMinusUTC },
      { header: 'fAtTMinus', get: (r) => r.fAtTMinus },
      { header: 'tPlusUTC', get: (r) => r.tPlusUTC },
      { header: 'fAtTPlus', get: (r) => r.fAtTPlus },
      { header: 'fPrimeDegPerSec', get: (r) => r.fPrimeDegPerSec },
      { header: 'stepSec', get: (r) => r.stepSec },
      { header: 'epsAngleUsed', get: (r) => r.epsAngleUsed },
      { header: 'epsTimeUsed', get: (r) => r.epsTimeUsed },
      { header: 'convergedThisStep', get: (r) => r.convergedThisStep },
      { header: 'convergenceReason', get: (r) => r.convergenceReason },
      { header: 'converged', get: (r) => r.converged },
      { header: 'usedBisection', get: (r) => r.usedBisection },
    ]);
    downloadTextFile(csv, `newton-raphson-iterasi-${suffix}.csv`, 'text/csv;charset=utf-8');
  }

  function handleExportDedup() {
    if (!data) return;
    const csv = buildCSV(data.deduplication.duplicatesRemoved, [
      { header: 'keptISO', get: (r) => r.keptISO },
      { header: 'removedISO', get: (r) => r.removedISO },
      { header: 'diffHours', get: (r) => r.diffHours },
    ]);
    downloadTextFile(csv, `deduplikasi-${suffix}.csv`, 'text/csv;charset=utf-8');
  }

  function handleExportPostConjunction() {
    if (!data) return;
    const csv = buildCSV(data.postConjunctionEvaluation, [
      { header: 'year', get: (r) => r.year },
      { header: 'conjISO', get: (r) => r.conjISO },
      { header: 'candidateNote', get: (r) => r.candidateNote },
      { header: 'candidateDistDays', get: (r) => r.candidateDistDays },
      { header: 'sunsetLocal', get: (r) => r.sunsetLocal },
      { header: 'sunsetUTC', get: (r) => r.sunsetUTC },
      { header: 'geoElongDeg', get: (r) => r.geoElongDeg },
      { header: 'geoMoonAltDeg', get: (r) => r.geoMoonAltDeg },
      { header: 'topoMoonAltDeg', get: (r) => r.topoMoonAltDeg },
      { header: 'topoMoonAzDeg', get: (r) => r.topoMoonAzDeg },
      { header: 'khgtPass', get: (r) => r.khgtPass },
      { header: 'khgtAltMargin', get: (r) => r.khgtAltMargin },
      { header: 'khgtElongMargin', get: (r) => r.khgtElongMargin },
      { header: 'whRuleA', get: (r) => r.whRuleA },
      { header: 'whRuleB', get: (r) => r.whRuleB },
      { header: 'whFulfilled', get: (r) => r.whFulfilled },
      { header: 'whIsBorderline', get: (r) => r.whIsBorderline },
      { header: 'dataRejectedAsMock', get: (r) => r.dataRejectedAsMock },
    ]);
    downloadTextFile(csv, `evaluasi-pasca-konjungsi-${suffix}.csv`, 'text/csv;charset=utf-8');
  }

  function handleExportStageMapping() {
    if (!data) return;
    const csv = buildCSV(data.stageMapping, [
      { header: 'stage', get: (r) => r.stage },
      { header: 'name', get: (r) => r.name },
      { header: 'systemProcess', get: (r) => r.systemProcess },
      { header: 'evidence', get: (r) => r.evidence },
      { header: 'evidenceForm', get: (r) => r.evidenceForm },
      { header: 'output', get: (r) => r.output },
      { header: 'codeRef', get: (r) => r.codeRef },
      { header: 'status', get: (r) => r.status },
      { header: 'note', get: (r) => r.note },
    ]);
    downloadTextFile(csv, `jejak-17-tahapan-${suffix}.csv`, 'text/csv;charset=utf-8');
  }

  function handleExportAllJSON() {
    if (!data) return;
    downloadTextFile(JSON.stringify(data, null, 2), `audit-lengkap-konjungsi-${suffix}.json`, 'application/json;charset=utf-8');
  }

  function handleExportExampleJSON() {
    if (!example) return;
    downloadTextFile(JSON.stringify(example, null, 2), `contoh-perhitungan-${exampleYear}.json`, 'application/json;charset=utf-8');
  }

  function handleExportBab4Package() {
    if (!data) return;
    downloadTextFile(JSON.stringify({ audit: data, contohPerhitungan: example, formulas: FORMULAS }, null, 2), `paket-bab4-${suffix}.json`, 'application/json;charset=utf-8');
    downloadTextFile(buildBab4Markdown(data, example), `paket-bab4-${suffix}.md`, 'text/markdown;charset=utf-8');
  }

  const validityMeta = {
    VALID_FOR_THESIS: { label: 'VALID UNTUK SKRIPSI', cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/40' },
    PARTIAL_VALID: { label: 'VALID SEBAGIAN', cls: 'bg-amber-900/40 text-amber-300 border-amber-500/40' },
    NOT_VALID_MOCK: { label: 'TIDAK VALID (MOCK)', cls: 'bg-red-900/40 text-red-300 border-red-500/40' },
  } as const;

  return (
    <div className="mt-2">
      {/* Sub-tab bar */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-white/10 pb-2">
        {(Object.keys(TAB_LABELS) as AuditTabKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-t text-xs font-medium transition ${
              tab === k ? 'bg-indigo-700/60 text-white border-b-2 border-indigo-400' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>

      {tab !== 'contoh' && (!data || needsReload) && (
        <div className="glass-card p-4 mb-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={loadAudit}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {loading ? 'Memuat jejak audit...' : needsReload && data ? 'Muat Ulang Audit (parameter berubah)' : 'Muat Data Audit Lengkap'}
          </button>
          <span className="text-xs text-slate-500">
            Menjalankan ulang seluruh scan 6 jam + Newton-Raphson untuk {fromYear}–{toYear} dengan jejak lengkap. Data ter-cache setelah run pertama.
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-4 text-red-300 text-sm">{error}</div>
      )}

      {/* ================= RINGKASAN ================= */}
      {tab === 'ringkasan' && data && !needsReload && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
            Tab ini merangkum seluruh proses komputasi Newton-Raphson untuk rentang {fromYear}–{toYear}: dari persiapan data
            NASA/JPL Horizons, pemindaian 6 jam, deteksi sign change, pembentukan bracket, iterasi Newton-Raphson, fallback
            bisection, deduplikasi, hingga evaluasi pasca-konjungsi Kota Bekasi. Rincian tiap tahap ada di tab masing-masing.
          </p>
          <div className={`glass-card p-4 border-2 ${validityMeta[data.summary.academicValidityStatus].cls.split(' ').find(c => c.startsWith('border'))}`}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">Ringkasan Audit Data</h3>
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${validityMeta[data.summary.academicValidityStatus].cls}`}>
                {validityMeta[data.summary.academicValidityStatus].label}
              </span>
            </div>
            <p className="text-xs text-slate-300 mb-3">{data.summary.academicValidityReason}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px] text-slate-300">
              <div><span className="text-slate-500">Total Konjungsi:</span> <span className="font-mono">{data.summary.totalConjunctions}</span></div>
              <div><span className="text-slate-500">Total Kandidat Ramadan:</span> <span className="font-mono">{data.summary.totalCandidates}</span></div>
              <div><span className="text-slate-500">Total Iterasi NR:</span> <span className="font-mono">{data.summary.totalNRIterations}</span></div>
              <div><span className="text-slate-500">Rata-rata Iterasi/Konjungsi:</span> <span className="font-mono">{data.summary.avgIterationsPerConjunction}</span></div>
              <div><span className="text-slate-500">Fallback Bisection:</span> <span className="font-mono">{data.summary.bisectionFallbackCount}</span></div>
              <div><span className="text-slate-500">Duplikat Dihapus:</span> <span className="font-mono">{data.summary.dedupRemovedCount}</span></div>
              <div><span className="text-slate-500">Titik Scan (6 jam):</span> <span className="font-mono">{data.summary.scanEpochCount}</span></div>
              <div><span className="text-slate-500">Query HORIZONS (Scan):</span> <span className="font-mono">{data.summary.scanApiCallCount}</span></div>
              <div><span className="text-slate-500">Live Count:</span> <span className="font-mono">{data.summary.liveCount}</span></div>
              <div><span className="text-slate-500">Cache Count:</span> <span className="font-mono">{data.summary.cacheCount}</span></div>
              <div><span className="text-slate-500">Mock Count:</span> <span className="font-mono">{data.summary.mockCount}</span></div>
              <div><span className="text-slate-500">Failed Count:</span> <span className="font-mono">{data.summary.failedCount}</span></div>
            </div>
          </div>

          <div className="glass-card p-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">Pemetaan CRISP-DM</h3>
            <div className="space-y-2 text-[11px] text-slate-300 leading-relaxed">
              {Object.entries(data.crispdm).map(([k, v]) => (
                <p key={k}><span className="font-semibold text-indigo-300 capitalize">{k}:</span> {v}</p>
              ))}
            </div>
          </div>

          <div className="glass-card p-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">Alur Proses (ringkas)</h3>
            <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono">
              {['Data HORIZONS', 'λ Bulan & Matahari', 'Δλ', 'wrapTo180 f(t)', 'Sign Change', 'Bracket', 'Initial Guess t0', 'Newton-Raphson', 'Cek Konvergensi', 'Waktu Konjungsi', 'Dedup', 'Evaluasi Pasca-Konjungsi'].map((step, i, arr) => (
                <span key={step} className="flex items-center gap-1">
                  <span className="px-2 py-1 rounded bg-indigo-900/40 border border-indigo-500/30 text-indigo-200 whitespace-nowrap">{step}</span>
                  {i < arr.length - 1 && <span className="text-slate-600">→</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= JEJAK 17 TAHAPAN ================= */}
      {tab === 'tahapan' && data && !needsReload && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-slate-400 max-w-2xl">
              Mapping antara 17 tahapan algoritma Newton-Raphson di Bab III dan bukti nyata yang dihasilkan sistem untuk
              rentang {fromYear}–{toYear}.
            </p>
            <button onClick={handleExportStageMapping} className="px-2 py-1 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
              Export CSV
            </button>
          </div>
          {data.stageMapping.map((s) => (
            <div key={s.stage} className="glass-card p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h4 className="text-sm font-bold text-indigo-300">Tahap {s.stage} — {s.name}</h4>
                <span className={`text-[10px] px-2 py-0.5 rounded border ${s.status === 'lengkap' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30' : 'bg-amber-900/40 text-amber-300 border-amber-500/30'}`}>
                  {s.status === 'lengkap' ? 'Lengkap' : 'Perlu Data Tambahan'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mb-1"><span className="text-slate-500">Proses:</span> {s.systemProcess}</p>
              <p className="text-[11px] text-slate-300 mb-1"><span className="text-slate-500">Bukti:</span> {s.evidence}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-[10px] text-slate-500">
                <div>Bentuk bukti: <span className="text-slate-300">{s.evidenceForm}</span></div>
                <div>Output: <span className="text-slate-300">{s.output}</span></div>
                <div>Kode: <span className="text-slate-400 font-mono">{s.codeRef}</span></div>
              </div>
              {s.note && <p className="text-[10px] text-amber-400/80 italic mt-1">{s.note}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ================= DATA PREPARATION ================= */}
      {tab === 'dataprep' && data && !needsReload && (
        <div className="space-y-4">
          <div className="glass-card p-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">Data Preparation</h3>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              Tahap 1–4 Bab III: menentukan periode, objek (Bulan &apos;301&apos;, Matahari &apos;10&apos;) dan lokasi,
              menyusun daftar epoch pemindaian 6 jam, lalu mengambil bujur ekliptika dari NASA/JPL Horizons untuk setiap epoch.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px] text-slate-300 mb-2">
              <div><span className="text-slate-500">Jendela Waktu:</span> <span className="font-mono">{data.metadata.windowStartUTC.slice(0,10)} – {data.metadata.windowEndUTC.slice(0,10)}</span></div>
              <div><span className="text-slate-500">Interval Scan:</span> <span className="font-mono">{data.metadata.scanStepHours} jam</span></div>
              <div><span className="text-slate-500">Jumlah Titik Scan:</span> <span className="font-mono">{data.dataPreparation.scanEpochCount}</span></div>
              <div><span className="text-slate-500">Jumlah Batch:</span> <span className="font-mono">{data.dataPreparation.scanBatchCount}</span> (maks {data.dataPreparation.batchSizeMaxEpochs} epoch/batch)</div>
              <div><span className="text-slate-500">Query HORIZONS (Scan):</span> <span className="font-mono">{data.dataPreparation.horizonsCallsPhase1Scan}</span></div>
              <div><span className="text-slate-500">Live/Cache/Mock/Failed:</span> <span className="font-mono">{data.dataPreparation.liveCount}/{data.dataPreparation.cacheCount}/{data.dataPreparation.mockCount}/{data.dataPreparation.failedCount}</span></div>
            </div>
            <p className="text-[11px] text-slate-500 italic">{data.dataPreparation.note}</p>
          </div>
          <div className="glass-card p-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Contoh baris data ekliptika mentah (dari 3 sign-change event pertama)</h4>
            <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
              <table className="min-w-full text-[11px] text-left">
                <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider">
                  <tr><th className="px-2 py-1.5">Epoch (UTC)</th><th className="px-2 py-1.5">Bujur Ekliptika Bulan (°)</th><th className="px-2 py-1.5">Bujur Ekliptika Matahari (°)</th></tr>
                </thead>
                <tbody>
                  {data.scanResults.events.slice(0, 3).flatMap((e) => ([
                    <tr key={e.t1} className="border-t border-white/[0.05]"><td className="px-2 py-1 font-mono text-slate-300 whitespace-nowrap">{e.t1}</td><td className="px-2 py-1 font-mono text-slate-300">{fmt(e.eclMoon1,6)}</td><td className="px-2 py-1 font-mono text-slate-300">{fmt(e.eclSun1,6)}</td></tr>,
                    <tr key={e.t2} className="border-t border-white/[0.05]"><td className="px-2 py-1 font-mono text-slate-300 whitespace-nowrap">{e.t2}</td><td className="px-2 py-1 font-mono text-slate-300">{fmt(e.eclMoon2,6)}</td><td className="px-2 py-1 font-mono text-slate-300">{fmt(e.eclSun2,6)}</td></tr>,
                  ]))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= wrapTo180 ================= */}
      {tab === 'wrap' && data && !needsReload && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400 max-w-2xl">Tahap 5–6 Bab III: membentuk fungsi selisih bujur ekliptika Δλ, lalu menormalisasinya dengan wrapTo180 menjadi f(t).</p>
          {(() => { const fd = getFormula('delta-lambda')!; const fw = getFormula('wrap-to-180')!;
            const ex = data.scanResults.events[0];
            return (
              <>
                <FormulaBlock title={fd.title} formula={fd.formula} variables={fd.variables} interpretation={fd.interpretation}
                  substitution={ex ? `Δλ(t1) = ${fmt(ex.eclMoon1,6)}° − ${fmt(ex.eclSun1,6)}° = ${fmt(ex.deltaRaw1,6)}°` : undefined}
                  result={ex ? `Δλ(t2) = ${fmt(ex.eclMoon2,6)}° − ${fmt(ex.eclSun2,6)}° = ${fmt(ex.deltaRaw2,6)}°` : undefined}
                />
                <FormulaBlock title={fw.title} formula={fw.formula} variables={fw.variables} interpretation={fw.interpretation}
                  substitution={ex ? `f(t1) = wrapTo180(${fmt(ex.deltaRaw1,6)}°) = ${fmt(ex.f1,6)}°` : undefined}
                  result={ex ? `f(t2) = wrapTo180(${fmt(ex.deltaRaw2,6)}°) = ${fmt(ex.f2,6)}°` : undefined}
                />
              </>
            );
          })()}
          <div className="glass-card p-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Contoh transformasi deltaRawDeg → wrappedDeltaDeg (10 baris pertama)</h4>
            <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
              <table className="min-w-full text-[11px] text-left">
                <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider">
                  <tr><th className="px-2 py-1.5">Epoch</th><th className="px-2 py-1.5">Selisih Mentah Δλ (°)</th><th className="px-2 py-1.5">Hasil wrapTo180 f(t) (°)</th></tr>
                </thead>
                <tbody>
                  {data.scanResults.events.slice(0, 10).map((e) => (
                    <tr key={e.index} className="border-t border-white/[0.05]">
                      <td className="px-2 py-1 font-mono text-slate-300 whitespace-nowrap">{e.t1}</td>
                      <td className="px-2 py-1 font-mono text-slate-300">{fmt(e.deltaRaw1,6)}</td>
                      <td className="px-2 py-1 font-mono text-slate-300">{fmt(e.f1,6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= SCAN & SIGN CHANGE ================= */}
      {tab === 'scan' && data && !needsReload && (
        <div className="space-y-4">
          {(() => { const fs = getFormula('sign-change')!; const fo = getFormula('opposition-filter')!;
            const ex = data.scanResults.events.find(e => !e.isOpposition) ?? data.scanResults.events[0];
            return (
              <>
                <FormulaBlock title={fs.title} formula={fs.formula} variables={fs.variables} interpretation={fs.interpretation}
                  substitution={ex ? `f(t1) × f(t2) = ${fmt(ex.f1,4)} × ${fmt(ex.f2,4)} = ${fmt(ex.f1*ex.f2,4)} ${ex.f1*ex.f2 < 0 ? '< 0 → sign change terdeteksi' : '≥ 0'}` : undefined}
                />
                <FormulaBlock title={fo.title} formula={fo.formula} variables={fo.variables} interpretation={fo.interpretation} />
              </>
            );
          })()}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Scan 6 Jam &amp; Sign Change ({data.scanResults.totalSignChanges} transisi tanda — {data.scanResults.keptAsBracket} jadi bracket, {data.scanResults.filteredAsOpposition} difilter oposisi)
              </h3>
              <button onClick={handleExportSignChanges} className="px-2 py-1 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/[0.08] max-h-96 overflow-y-auto">
              <table className="min-w-full text-[11px] text-left">
                <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">t1 (UTC)</th>
                    <th className="px-2 py-1.5">t2 (UTC)</th>
                    <th className="px-2 py-1.5">f(t1)° (wrapTo180)</th>
                    <th className="px-2 py-1.5">f(t2)° (wrapTo180)</th>
                    <th className="px-2 py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scanResults.events.map((e) => (
                    <tr key={e.index} className={`border-t border-white/[0.05] ${e.isOpposition ? 'bg-red-950/20' : 'bg-emerald-950/10'}`}>
                      <td className="px-2 py-1 text-slate-400 font-mono">{e.index}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono whitespace-nowrap">{e.t1}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono whitespace-nowrap">{e.t2}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono">{fmt(e.f1, 3)}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono">{fmt(e.f2, 3)}</td>
                      <td className="px-2 py-1">
                        {e.isOpposition
                          ? <span className="text-red-400 text-[10px]">Tersaring sebagai oposisi/purnama</span>
                          : <span className="text-emerald-400 text-[10px]">Lolos sebagai bracket konjungsi</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= BRACKET ================= */}
      {tab === 'bracket' && data && !needsReload && (
        <div className="space-y-4">
          {(() => { const fi = getFormula('initial-guess')!; const ex = data.brackets[0];
            return (
              <FormulaBlock title={fi.title} formula={fi.formula} variables={fi.variables} interpretation={fi.interpretation}
                substitution={ex ? `t0 = (${ex.t1} + ${ex.t2}) / 2` : undefined}
                result={ex ? `t0 = ${ex.midpointInitialGuessUTC}` : undefined}
              />
            );
          })()}
          <div className="glass-card p-4">
            <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
              Tahap 7–9 Bab III: setiap bracket konjungsi (rentang t1–t2 tempat sign change terdeteksi dan lolos filter oposisi)
              diberi tebakan awal berupa titik tengahnya, sebelum diproses Newton-Raphson.
            </p>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">Bracket Konjungsi ({data.brackets.length})</h3>
              <button onClick={handleExportBrackets} className="px-2 py-1 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/[0.08] max-h-96 overflow-y-auto">
              <table className="min-w-full text-[11px] text-left">
                <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">t1</th><th className="px-2 py-1.5">t2</th>
                    <th className="px-2 py-1.5">f(t1)°</th><th className="px-2 py-1.5">f(t2)°</th><th className="px-2 py-1.5">Tebakan Awal t0</th>
                  </tr>
                </thead>
                <tbody>
                  {data.brackets.map((b) => (
                    <tr key={b.index} className="border-t border-white/[0.05]">
                      <td className="px-2 py-1 text-slate-400 font-mono">{b.index}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono whitespace-nowrap">{b.t1}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono whitespace-nowrap">{b.t2}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono">{fmt(b.f1,3)}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono">{fmt(b.f2,3)}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono whitespace-nowrap">{b.midpointInitialGuessUTC}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= ITERASI NEWTON-RAPHSON ================= */}
      {tab === 'iterasi' && data && !needsReload && (
        <div className="space-y-4">
          {(() => {
            const fc = getFormula('central-difference')!; const fn = getFormula('newton-raphson')!;
            const fst = getFormula('step-sec')!; const fco = getFormula('convergence')!;
            const firstTrace = data.newtonRaphsonIterations.find(t => t.iterations.length > 0);
            const it0 = firstTrace?.iterations[0];
            return (
              <>
                <FormulaBlock title={fc.title} formula={fc.formula} variables={fc.variables} interpretation={fc.interpretation}
                  substitution={it0 ? `f'(t) = (${fmt(it0.fAtTPlus,6)} − (${fmt(it0.fAtTMinus,6)})) / 120` : undefined}
                  result={it0 ? `f'(t) = ${it0.fPrimeDegPerSec?.toExponential(6)} °/detik` : undefined}
                />
                <FormulaBlock title={fst.title} formula={fst.formula} variables={fst.variables} interpretation={fst.interpretation}
                  substitution={it0 ? `stepSec = −(${fmt(it0.fDeg,6)}) / ${it0.fPrimeDegPerSec?.toExponential(6)}` : undefined}
                  result={it0 ? `stepSec = ${fmt(it0.stepSec,3)} detik` : undefined}
                />
                <FormulaBlock title={fn.title} formula={fn.formula} variables={fn.variables} interpretation={fn.interpretation} />
                <FormulaBlock title={fco.title} formula={fco.formula} variables={fco.variables} interpretation={fco.interpretation}
                  substitution={it0 ? `|f(t)| = ${Math.abs(it0.fDeg).toExponential(3)}° vs epsAngle=${it0.epsAngleUsed}°; |stepSec| = ${fmt(Math.abs(it0.stepSec),3)}s vs epsTime=${it0.epsTimeUsed}s` : undefined}
                  result={it0 ? `Status iterasi 1: ${it0.convergedThisStep ? 'konvergen' : 'belum konvergen'}` : undefined}
                />
              </>
            );
          })()}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Iterasi Newton-Raphson — seluruh {data.summary.totalNRIterations} iterasi dari {data.newtonRaphsonIterations.length} bracket
              </h3>
              <button onClick={handleExportIterations} className="px-2 py-1 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
                Export CSV (semua iterasi)
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              Tabel berikut ringkas per-bracket. Lihat tab &quot;Contoh Perhitungan Lengkap 2025&quot; untuk jejak substitusi
              angka iterasi-demi-iterasi, atau export CSV untuk detail penuh setiap iterasi seluruh periode.
            </p>
            <div className="overflow-x-auto rounded-lg border border-white/[0.08] max-h-96 overflow-y-auto">
              <table className="min-w-full text-[11px] text-left">
                <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5">Bracket #</th>
                    <th className="px-2 py-1.5">Konjungsi Final</th>
                    <th className="px-2 py-1.5">Jml Iterasi</th>
                    <th className="px-2 py-1.5">Status Konvergensi</th>
                    <th className="px-2 py-1.5">Fallback Bisection</th>
                    <th className="px-2 py-1.5">f terakhir (°)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.newtonRaphsonIterations.map((tr) => (
                    <tr key={tr.bracketIndex} className="border-t border-white/[0.05]">
                      <td className="px-2 py-1 text-slate-400 font-mono">{tr.bracketIndex}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono whitespace-nowrap">{tr.finalConjunctionISO ?? '—'}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono">{tr.totalIterations}</td>
                      <td className="px-2 py-1">{tr.converged ? <span className="text-emerald-400">Konvergen</span> : <span className="text-red-400">Tidak Konvergen</span>}</td>
                      <td className="px-2 py-1">{tr.usedBisection ? <span className="text-amber-400">Ya</span> : <span className="text-slate-500">Tidak</span>}</td>
                      <td className="px-2 py-1 text-slate-300 font-mono">{fmt(tr.iterations[tr.iterations.length-1]?.fDeg, 6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= CONTOH PERHITUNGAN LENGKAP ================= */}
      {tab === 'contoh' && (
        <div className="space-y-4">
          <div className="glass-card p-4 flex items-center gap-3 flex-wrap">
            <label className="text-xs text-slate-400">Tahun contoh:</label>
            <input type="number" value={exampleYear} onChange={(e) => setExampleYear(parseInt(e.target.value, 10) || 2025)}
              className="w-24 px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-sm [color-scheme:dark]" />
            <button onClick={() => loadExample(exampleYear)} disabled={exampleLoading}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {exampleLoading ? 'Menghitung...' : exampleFetchedFor === exampleYear ? 'Hitung Ulang' : 'Hitung Contoh Perhitungan'}
            </button>
            <span className="text-xs text-slate-500">Default tahun 2025. Perhitungan dijalankan langsung dari mesin Newton-Raphson yang sama — bukan data tersimpan.</span>
          </div>

          {exampleError && <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">{exampleError}</div>}

          {example && exampleFetchedFor === exampleYear && (
            <div className="space-y-4">
              <div className="glass-card p-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">1. Data Awal</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-300">
                  <div><span className="text-slate-500">Periode:</span> {example.dataAwal.periode}</div>
                  <div><span className="text-slate-500">Objek:</span> {example.dataAwal.objek}</div>
                  <div><span className="text-slate-500">Lokasi:</span> {example.dataAwal.lokasi.label}</div>
                  <div><span className="text-slate-500">Sumber Data:</span> {example.dataAwal.sumberData}</div>
                  <div><span className="text-slate-500">Jumlah Epoch Scan:</span> <span className="font-mono">{example.dataAwal.epochCount}</span></div>
                  <div><span className="text-slate-500">Bracket t1–t2:</span> <span className="font-mono">{example.dataAwal.bracket.t1} – {example.dataAwal.bracket.t2}</span></div>
                </div>
              </div>

              {example.fungsiSelisih && (() => { const f = getFormula('delta-lambda')!; return (
                <div className="glass-card p-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">2. Pembentukan Fungsi Selisih Bujur Ekliptika</h3>
                  <FormulaBlock title={f.title} formula={f.formula} variables={f.variables} interpretation={f.interpretation}
                    substitution={`Δλ(t1) = ${fmt(example.fungsiSelisih.t1.eclMoonDeg,6)}° − ${fmt(example.fungsiSelisih.t1.eclSunDeg,6)}° = ${fmt(example.fungsiSelisih.t1.deltaRawDeg,6)}°`}
                    result={`Δλ(t2) = ${fmt(example.fungsiSelisih.t2.eclMoonDeg,6)}° − ${fmt(example.fungsiSelisih.t2.eclSunDeg,6)}° = ${fmt(example.fungsiSelisih.t2.deltaRawDeg,6)}°`}
                  />
                </div>
              ); })()}

              {example.wrapTo180 && (() => { const f = getFormula('wrap-to-180')!; return (
                <div className="glass-card p-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">3. Normalisasi Sudut wrapTo180</h3>
                  <FormulaBlock title={f.title} formula={f.formula} variables={f.variables}
                    substitution={`f(t1) = wrapTo180(${fmt(example.wrapTo180.t1.deltaRawDeg,6)}°) = ${fmt(example.wrapTo180.t1.wrappedDeltaDeg,6)}°`}
                    result={`f(t2) = wrapTo180(${fmt(example.wrapTo180.t2.deltaRawDeg,6)}°) = ${fmt(example.wrapTo180.t2.wrappedDeltaDeg,6)}°`}
                    interpretation="Nilai ini digunakan agar selisih sudut berada pada rentang -180° sampai 180°, sehingga deteksi sign change tidak keliru akibat efek wrap-around 360°."
                  />
                </div>
              ); })()}

              <div className="glass-card p-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">4. Deteksi Sign Change</h3>
                <p className="text-[11px] text-slate-300 mb-1 font-mono">f(t1) = {fmt(example.signChange.f1,6)}°, f(t2) = {fmt(example.signChange.f2,6)}°</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  f(t1) × f(t2) = {fmt(example.signChange.product,4)} {example.signChange.isSignChange ? '< 0.' : '≥ 0.'} Karena tanda f(t1)
                  dan f(t2) {example.signChange.isSignChange ? 'berbeda' : 'sama'}, maka {example.signChange.isSignChange ? 'terdapat akar fungsi di antara t1 dan t2 — rentang ini menjadi bracket konjungsi.' : 'rentang ini tidak menjadi bracket.'}
                </p>
              </div>

              <div className="glass-card p-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">5. Initial Guess</h3>
                {(() => { const f = getFormula('initial-guess')!; return (
                  <FormulaBlock title={f.title} formula={f.formula} variables={f.variables}
                    result={`t0 = ${example.initialGuess.t0UTC}`}
                  />
                );})()}
              </div>

              {example.firstIterationDetail && (() => { const it = example.firstIterationDetail; const fc = getFormula('central-difference')!; return (
                <div className="glass-card p-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">6. Turunan Numerik Central Difference (iterasi pertama)</h3>
                  <FormulaBlock title={fc.title} formula={fc.formula} variables={fc.variables}
                    substitution={`f'(t0) = (${fmt(it.fAtTPlus,6)} − (${fmt(it.fAtTMinus,6)})) / 120`}
                    result={`f'(t0) = ${it.fPrimeDegPerSec?.toExponential(6)} °/detik`}
                    interpretation={`f(t0+60s)=${fmt(it.fAtTPlus,6)}°, f(t0−60s)=${fmt(it.fAtTMinus,6)}°, JD=${it.jd}.`}
                  />
                </div>
              ); })()}

              {example.firstIterationDetail && (() => { const it = example.firstIterationDetail; const f = getFormula('step-sec')!; return (
                <div className="glass-card p-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">7. Koreksi Newton-Raphson</h3>
                  <FormulaBlock title={f.title} formula={f.formula} variables={f.variables}
                    substitution={`step = −(${fmt(it.fDeg,6)}) / ${it.fPrimeDegPerSec?.toExponential(6)}`}
                    result={`step = ${fmt(it.stepSec,3)} detik`}
                  />
                </div>
              ); })()}

              {example.firstIterationDetail && (() => { const it = example.firstIterationDetail; return (
                <div className="glass-card p-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">8. Pemeriksaan Konvergensi (iterasi pertama)</h3>
                  <p className="text-[11px] text-slate-300 font-mono mb-1">
                    |f(t)| = {Math.abs(it.fDeg).toExponential(3)}° dibandingkan epsAngle = {it.epsAngleUsed?.toExponential(0)}°
                  </p>
                  <p className="text-[11px] text-slate-300 font-mono mb-1">
                    |stepSec| = {fmt(Math.abs(it.stepSec),3)} detik dibandingkan epsTime = {it.epsTimeUsed} detik
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Status: {it.convergedThisStep ? 'Konvergen pada iterasi ini.' : 'Belum konvergen — waktu diperbarui dan iterasi dilanjutkan.'}
                  </p>
                </div>
              ); })()}

              {example.firstIterationDetail && !example.firstIterationDetail.convergedThisStep && (
                <div className="glass-card p-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">9. Update Waktu</h3>
                  <p className="text-[11px] text-slate-300 font-mono">
                    t berikutnya = {example.firstIterationDetail.epochUTC} + ({fmt(example.firstIterationDetail.stepSec,3)} detik) = {example.iterations[1]?.epochUTC ?? '—'}
                  </p>
                </div>
              )}

              <div className="glass-card p-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">10. Iterasi Lengkap</h3>
                <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
                  <table className="min-w-full text-[11px] text-left">
                    <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider">
                      <tr><th className="px-2 py-1.5">Iterasi</th><th className="px-2 py-1.5">t_n (UTC)</th><th className="px-2 py-1.5">f(t_n)°</th><th className="px-2 py-1.5">f&apos;(t_n)</th><th className="px-2 py-1.5">stepSec</th><th className="px-2 py-1.5">Status</th></tr>
                    </thead>
                    <tbody>
                      {example.iterations.map((it) => (
                        <tr key={it.iteration} className="border-t border-white/[0.05]">
                          <td className="px-2 py-1 font-mono text-slate-300">{it.iteration}</td>
                          <td className="px-2 py-1 font-mono text-slate-300 whitespace-nowrap">{it.epochUTC}</td>
                          <td className="px-2 py-1 font-mono text-slate-300">{fmt(it.fDeg,6)}</td>
                          <td className="px-2 py-1 font-mono text-slate-300">{it.fPrimeDegPerSec?.toExponential(4)}</td>
                          <td className="px-2 py-1 font-mono text-slate-300">{fmt(it.stepSec,3)}</td>
                          <td className="px-2 py-1">{it.convergedThisStep ? <span className="text-emerald-400">Konvergen ({it.convergenceReason})</span> : <span className="text-slate-500">Lanjut</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-card p-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">11. Hasil Akhir</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-300">
                  <div><span className="text-slate-500">Waktu Konjungsi UTC:</span> <span className="font-mono">{example.hasil.conjunctionUTC}</span></div>
                  <div><span className="text-slate-500">Waktu Konjungsi Lokal:</span> <span className="font-mono">{example.hasil.conjunctionLocal}</span></div>
                  <div><span className="text-slate-500">Total Iterasi:</span> <span className="font-mono">{example.hasil.totalIterations}</span></div>
                  <div><span className="text-slate-500">Konvergen:</span> {bool(example.hasil.converged)}</div>
                  <div><span className="text-slate-500">Fallback Bisection:</span> {bool(example.hasil.usedBisection)}</div>
                </div>
              </div>

              <div className="glass-card p-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">12. Evaluasi Pasca-Konjungsi Kota Bekasi</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-slate-300 mb-2">
                  <div><span className="text-slate-500">Sunset Lokal:</span> <span className="font-mono">{example.pascaKonjungsi.sunsetLocal ?? '—'}</span></div>
                  <div><span className="text-slate-500">Umur Bulan:</span> <span className="font-mono">{fmt(example.pascaKonjungsi.moonAgeHours,2)} jam</span></div>
                  <div><span className="text-slate-500">Altitude Topocentric:</span> <span className="font-mono">{fmt(example.pascaKonjungsi.topoMoonAltDeg)}°</span></div>
                  <div><span className="text-slate-500">Azimut:</span> <span className="font-mono">{fmt(example.pascaKonjungsi.topoMoonAzDeg)}°</span></div>
                  <div><span className="text-slate-500">Elongasi Geosentris:</span> <span className="font-mono">{fmt(example.pascaKonjungsi.geoElongDeg)}°</span></div>
                  <div><span className="text-slate-500">Status KHGT:</span> {example.pascaKonjungsi.khgtPass === null ? '—' : example.pascaKonjungsi.khgtPass ? 'Lolos' : 'Tidak Lolos'}</div>
                </div>
                {(() => { const ra = getFormula('rule-a')!; const rb = getFormula('rule-b')!; return (
                  <>
                    <FormulaBlock title={ra.title} formula={ra.formula} variables={ra.variables}
                      result={`Rule A: ${bool(example.pascaKonjungsi.ruleA)}`} />
                    <FormulaBlock title={rb.title} formula={rb.formula} variables={rb.variables}
                      substitution={`altitude_topocentric = ${fmt(example.pascaKonjungsi.topoMoonAltDeg)}°`}
                      result={`Rule B: ${bool(example.pascaKonjungsi.ruleB)}`} />
                  </>
                ); })()}
                <p className="text-[11px] text-slate-300 mt-1">
                  Status Wujudul Hilal: <span className={example.pascaKonjungsi.fulfilled ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                    {example.pascaKonjungsi.fulfilled ? 'Terpenuhi' : 'Tidak Terpenuhi'}
                  </span>
                  {example.pascaKonjungsi.isBorderline && <span className="text-amber-400 ml-1">(borderline)</span>}
                </p>
              </div>

              <div className="glass-card p-4 border-2 border-indigo-500/30">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">13. Kesimpulan Komputasi</h3>
                <p className="text-[12px] text-slate-200 leading-relaxed">{example.kesimpulan}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={handleExportExampleJSON} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
                  Export Contoh Perhitungan (JSON)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= FALLBACK & DEDUPLIKASI ================= */}
      {tab === 'fallback' && data && !needsReload && (
        <div className="space-y-4">
          {(() => { const fb = getFormula('bisection-fallback')!; const fd = getFormula('dedup')!; return (
            <>
              <FormulaBlock title={fb.title} formula={fb.formula} variables={fb.variables} interpretation={fb.interpretation} />
              <FormulaBlock title={fd.title} formula={fd.formula} variables={fd.variables} interpretation={fd.interpretation} />
            </>
          ); })()}
          <div className="glass-card p-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">
              Fallback Bisection ({data.fallbackBisection.count} kali dipakai dari {data.brackets.length} bracket)
            </h3>
            {data.fallbackBisection.count === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Tidak ada bracket yang memerlukan fallback bisection pada rentang ini — seluruh konjungsi konvergen murni via Newton-Raphson.
                Struktur data dan export tetap tersedia untuk rentang lain yang mungkin memerlukannya.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
                <table className="min-w-full text-[11px] text-left">
                  <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider">
                    <tr><th className="px-2 py-1.5">Bracket #</th><th className="px-2 py-1.5">Hasil Bisection</th><th className="px-2 py-1.5">f di hasil</th><th className="px-2 py-1.5">Delta (s)</th></tr>
                  </thead>
                  <tbody>
                    {data.fallbackBisection.details.map((tr) => (
                      <tr key={tr.bracketIndex} className="border-t border-white/[0.05]">
                        <td className="px-2 py-1 font-mono text-slate-300">{tr.bracketIndex}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{tr.bisectionDetail?.resultEpochUTC ?? '—'}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{fmt(tr.bisectionDetail?.fAtResult, 6)}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{fmt(tr.bisectionDetail?.deltaSec, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Deduplikasi 12 Jam ({data.deduplication.rawCount} mentah → {data.deduplication.dedupedCount} akhir, {data.deduplication.duplicatesRemoved.length} dihapus)
              </h3>
              <button onClick={handleExportDedup} className="px-2 py-1 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
                Export CSV
              </button>
            </div>
            {data.deduplication.duplicatesRemoved.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Tidak ada konjungsi duplikat (berjarak ≤12 jam) yang ditemukan pada rentang ini.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
                <table className="min-w-full text-[11px] text-left">
                  <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider">
                    <tr><th className="px-2 py-1.5">Dipertahankan</th><th className="px-2 py-1.5">Dihapus</th><th className="px-2 py-1.5">Selisih (jam)</th></tr>
                  </thead>
                  <tbody>
                    {data.deduplication.duplicatesRemoved.map((d, i) => (
                      <tr key={i} className="border-t border-white/[0.05]">
                        <td className="px-2 py-1 font-mono text-slate-300">{d.keptISO}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{d.removedISO}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{fmt(d.diffHours, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= EVALUASI PASCA-KONJUNGSI ================= */}
      {tab === 'pasca' && data && !needsReload && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Tahap 17 Bab III: waktu konjungsi dipakai untuk memilih kandidat awal Ramadan (satu per tahun target, jarak terdekat
            ke estimasi siklus Hijriah), lalu dievaluasi sunset, altitude/azimut topocentric, elongasi, Rule A/B Wujudul Hilal,
            dan status KHGT di Kota Bekasi (atau lokasi pengamatan yang dipilih).
          </p>
          {(() => { const ra = getFormula('rule-a')!; const rb = getFormula('rule-b')!; return (
            <>
              <FormulaBlock title={ra.title} formula={ra.formula} variables={ra.variables} interpretation={ra.interpretation} />
              <FormulaBlock title={rb.title} formula={rb.formula} variables={rb.variables} interpretation={rb.interpretation} />
            </>
          ); })()}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Evaluasi Pasca-Konjungsi ({data.postConjunctionEvaluation.length} kandidat)
              </h3>
              <button onClick={handleExportPostConjunction} className="px-2 py-1 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
              <table className="min-w-full text-[11px] text-left">
                <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-2 py-1.5">Tahun</th><th className="px-2 py-1.5">Konjungsi</th>
                    <th className="px-2 py-1.5">Sunset Lokal</th><th className="px-2 py-1.5">Elongasi Geo°</th>
                    <th className="px-2 py-1.5">Altitude Geo°</th><th className="px-2 py-1.5">Altitude Topo°</th>
                    <th className="px-2 py-1.5">KHGT</th><th className="px-2 py-1.5">Rule A/B</th>
                  </tr>
                </thead>
                <tbody>
                  {data.postConjunctionEvaluation.map((r) => (
                    <tr key={r.conjISO} className="border-t border-white/[0.05]">
                      <td className="px-2 py-1 font-mono text-slate-300">{r.year}</td>
                      <td className="px-2 py-1 font-mono text-slate-300 whitespace-nowrap">{r.conjISO}</td>
                      <td className="px-2 py-1 font-mono text-slate-300 whitespace-nowrap">{r.sunsetLocal ?? '—'}</td>
                      <td className="px-2 py-1 font-mono text-slate-300">{fmt(r.geoElongDeg)}</td>
                      <td className="px-2 py-1 font-mono text-slate-300">{fmt(r.geoMoonAltDeg)}</td>
                      <td className="px-2 py-1 font-mono text-slate-300">{fmt(r.topoMoonAltDeg)}</td>
                      <td className="px-2 py-1">{r.khgtPass === null ? '—' : r.khgtPass ? <span className="text-emerald-400">Lolos</span> : <span className="text-red-400">Tidak</span>}</td>
                      <td className="px-2 py-1 text-slate-400">{r.whRuleA===null ? '—' : `A:${r.whRuleA?'Y':'T'} B:${r.whRuleB?'Y':'T'}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= EXPORT PAKET BAB IV ================= */}
      {tab === 'export' && data && !needsReload && (
        <div className="space-y-4">
          <div className="glass-card p-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-2">Export Paket Bab IV</h3>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              Menggabungkan ringkasan 17 tahapan, data preparation, wrapTo180, scan &amp; sign change, bracket, iterasi
              Newton-Raphson seluruh periode, fallback &amp; deduplikasi, evaluasi pasca-konjungsi, rumus + interpretasi, dan
              (jika sudah dihitung di tab &quot;Contoh Perhitungan Lengkap&quot;) jejak substitusi angka tahun {exampleYear}.
              Diekspor sebagai satu file JSON (data lengkap) dan satu file Markdown (narasi + rumus siap salin ke Bab IV).
            </p>
            {!example && (
              <p className="text-[11px] text-amber-400 mb-2">
                Contoh perhitungan tahun {exampleYear} belum dihitung — buka tab &quot;Contoh Perhitungan Lengkap&quot; dan klik
                &quot;Hitung Contoh Perhitungan&quot; agar paket ini menyertakan jejak substitusi angka lengkap. Paket tetap bisa
                diekspor tanpanya.
              </p>
            )}
            <button onClick={handleExportBab4Package} className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-lg">
              Export Paket Bab IV (JSON + Markdown)
            </button>
          </div>

          <div className="glass-card p-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Export per kategori (alternatif)</h4>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleExportStageMapping} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">17 Tahapan (CSV)</button>
              <button onClick={handleExportSignChanges} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Scan &amp; Sign Change (CSV)</button>
              <button onClick={handleExportBrackets} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Bracket (CSV)</button>
              <button onClick={handleExportIterations} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Iterasi NR Seluruh Periode (CSV)</button>
              <button onClick={handleExportDedup} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Deduplikasi (CSV)</button>
              <button onClick={handleExportPostConjunction} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Evaluasi Pasca-Konjungsi (CSV)</button>
              <button onClick={handleExportExampleJSON} disabled={!example} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-40">Contoh Perhitungan {exampleYear} (JSON)</button>
              <button onClick={handleExportAllJSON} className="px-3 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">Audit Lengkap (JSON)</button>
            </div>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">{data.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
