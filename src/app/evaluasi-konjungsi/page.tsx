'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { ConjunctionRow, DataSource } from '@/app/api/konjungsi-periode/route';
import KonjungsiAuditPanel from '@/components/audit/KonjungsiAuditPanel';
import DownloadMenu from '@/components/audit/DownloadMenu';

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const BEKASI_LAT   = -6.2349;
const BEKASI_LON   = 107.0000;
const BEKASI_TZ    = 'Asia/Jakarta';
const BEKASI_LABEL = 'Kota Bekasi, Jawa Barat';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmt(v: number | null, dec = 4): string {
  if (v === null) return '—';
  return v.toFixed(dec);
}

function fmtLocalTime(iso: string | null): string {
  if (!iso) return '—';
  return iso.replace(/[+-]\d{2}:\d{2}$/, '').replace('T', ' ').slice(0, 19) + ' WIB';
}

function fmtBool(v: boolean | null): string {
  if (v === null) return '—';
  return v ? 'Ya' : 'Tidak';
}

type ValiditySummary = {
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  liveCount: number;
  cacheCount: number;
  mockCount: number;
  failedCount: number;
  usedMock: boolean;
  hasRejectedMockData: boolean;
  dataSource: DataSource | null;
  phase1DataSource: DataSource | null;
};

type AcademicValidityStatus = 'VALID_FOR_THESIS' | 'PARTIAL_VALID' | 'NOT_VALID_MOCK';

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function StatusBadge({ candidate, preview = false }: { candidate: boolean; preview?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      {candidate ? (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-900/50 text-emerald-300 border border-emerald-500/40 whitespace-nowrap">
          Kandidat Awal Ramadan
        </span>
      ) : (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-700/50 text-slate-400 border border-slate-600/40 whitespace-nowrap">
          Bukan Kandidat
        </span>
      )}
      {preview && (
        <span className="text-[9px] text-amber-400/80 font-medium whitespace-nowrap">
          Preview — belum valid akademik
        </span>
      )}
    </div>
  );
}

function KhgtBadge({ pass }: { pass: boolean | null }) {
  if (pass === null) return <span className="text-slate-500 text-xs">—</span>;
  return pass ? (
    <span className="text-emerald-400 text-xs font-semibold">Lolos</span>
  ) : (
    <span className="text-red-400 text-xs">Tidak Lolos</span>
  );
}

function WhBadge({ row }: { row: ConjunctionRow }) {
  if (row.whFulfilled === null) {
    return <span className="text-slate-500 text-xs" title={row.whNote ?? undefined}>—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5" title={row.whNote ?? undefined}>
      <span className={`text-xs font-semibold ${row.whFulfilled ? 'text-emerald-400' : 'text-amber-400'}`}>
        {row.whFulfilled ? 'Memenuhi' : 'Tidak Memenuhi'}
      </span>
      <span className="text-[10px] text-slate-500">
        Rule A: {row.whRuleA ? 'Ya' : 'Tidak'} · Rule B: {row.whRuleB ? 'Ya' : 'Tidak'}
        {row.whIsBorderline && <span className="text-amber-400 ml-1">(borderline)</span>}
      </span>
    </div>
  );
}

function DataSourceBadge({ source }: { source: DataSource | null }) {
  if (!source) return null;
  const config: Record<DataSource, { cls: string; label: string }> = {
    live:  { cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/40', label: 'NASA/JPL HORIZONS (Live)' },
    cache: { cls: 'bg-blue-900/40 text-blue-300 border-blue-500/40',          label: 'NASA/JPL HORIZONS (Cache Valid)' },
    mock:  { cls: 'bg-red-900/40 text-red-300 border-red-500/40',             label: 'Fallback Simulasi' },
    mixed: { cls: 'bg-orange-900/40 text-orange-300 border-orange-500/40',    label: 'Data Campuran' },
  };
  const { cls, label } = config[source];
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function EvaluasiKonjungsiPage() {
  const { t } = useI18n();

  // ── Year inputs — empty by default, no auto-fill ──
  const [fromYear, setFromYear] = useState<number | ''>('');
  const [toYear,   setToYear]   = useState<number | ''>('');
  const [yearError, setYearError] = useState('');

  // Location — Bekasi primary; override available for comparative study
  const [lat, setLat] = useState(BEKASI_LAT);
  const [lon, setLon] = useState(BEKASI_LON);
  const [tz,  setTz]  = useState(BEKASI_TZ);
  const [showLocationOverride, setShowLocationOverride] = useState(false);

  // Data state
  const [loading,        setLoading]        = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error,          setError]          = useState('');
  const [rows,           setRows]           = useState<ConjunctionRow[] | null>(null);
  const [phase,          setPhase]          = useState<1 | 2 | null>(null);
  const [detailScope,    setDetailScope]    = useState<'candidates' | 'all' | null>(null);

  // Phase 2 enrichment source
  const [dataSource,     setDataSource]     = useState<DataSource | null>(null);
  const [dataSourceNote, setDataSourceNote] = useState<string | null>(null);
  const [hasRejectedMock,         setHasRejectedMock]         = useState(false);
  const [rejectedMockNote,        setRejectedMockNote]        = useState<string | null>(null);
  const [hasSuspiciousConstant,   setHasSuspiciousConstant]   = useState(false);

  // Phase 1 scan quality
  const [phase1UsedMock,         setPhase1UsedMock]         = useState(false);
  const [phase1DataSource,       setPhase1DataSource]       = useState<DataSource | null>(null);
  const [phase1AcademicWarning,  setPhase1AcademicWarning]  = useState<string | null>(null);
  const [phase1MockCount,        setPhase1MockCount]        = useState(0);
  const [phase1FailedCount,      setPhase1FailedCount]      = useState(0);

  // Academic validity summary (Fitur 1)
  const [academicValidityStatus, setAcademicValidityStatus] = useState<AcademicValidityStatus | null>(null);
  const [academicValidityReason, setAcademicValidityReason] = useState<string | null>(null);
  const [validitySummary,        setValiditySummary]        = useState<ValiditySummary | null>(null);
  const [copyFeedback,           setCopyFeedback]           = useState('');

  // Top-level page view — "tabel" (existing results table) vs "audit" (Bab IV transparency tabs)
  const [pageView, setPageView] = useState<'tabel' | 'audit'>('tabel');

  // Display
  const [filter,    setFilter]    = useState<'all' | 'candidates'>('all');
  const [showRaDec, setShowRaDec] = useState(false);
  const [showTopo,  setShowTopo]  = useState(false);
  const [showKhgt,  setShowKhgt]  = useState(true);
  const [showWH,    setShowWH]    = useState(true);

  // ── Validation ──
  const fromYearNum = typeof fromYear === 'number' ? fromYear : NaN;
  const toYearNum   = typeof toYear   === 'number' ? toYear   : NaN;
  const bothFilled  = !isNaN(fromYearNum) && !isNaN(toYearNum);
  const rangeValid  = bothFilled && fromYearNum <= toYearNum;
  const rangeLong   = bothFilled && rangeValid && (toYearNum - fromYearNum) > 5;
  const canCompute  = rangeValid && !loading && !loadingDetails;

  function validateYears(): boolean {
    if (!bothFilled) { setYearError('Tahun awal dan tahun akhir wajib diisi.'); return false; }
    if (fromYearNum > toYearNum) { setYearError('Tahun akhir tidak boleh lebih kecil dari tahun awal.'); return false; }
    setYearError('');
    return true;
  }

  function buildParams(): URLSearchParams {
    return new URLSearchParams({
      fromYear: String(fromYearNum),
      toYear:   String(toYearNum),
      lat:      String(lat),
      lon:      String(lon),
      tz,
    });
  }

  function resetDetailState() {
    setPhase(null);
    setDetailScope(null);
    setDataSource(null);
    setDataSourceNote(null);
    setHasRejectedMock(false);
    setRejectedMockNote(null);
    setHasSuspiciousConstant(false);
    setPhase1UsedMock(false);
    setPhase1DataSource(null);
    setPhase1AcademicWarning(null);
    setPhase1MockCount(0);
    setPhase1FailedCount(0);
    setAcademicValidityStatus(null);
    setAcademicValidityReason(null);
    setValiditySummary(null);
    setCopyFeedback('');
  }

  function applyPhase1ScanFields(data: Record<string, unknown>) {
    setPhase1UsedMock(!!data.usedMock);
    setPhase1DataSource((data.phase1DataSource as DataSource | null) ?? null);
    setPhase1AcademicWarning((data.phase1AcademicWarning as string | null) ?? null);
    setPhase1MockCount((data.mockRequestCount as number) ?? 0);
    setPhase1FailedCount((data.failedRequestCount as number) ?? 0);
    setAcademicValidityStatus((data.academicValidityStatus as AcademicValidityStatus | null) ?? null);
    setAcademicValidityReason((data.academicValidityReason as string | null) ?? null);
    setValiditySummary((data.validitySummary as ValiditySummary | null) ?? null);
  }

  async function runComputation() {
    if (!validateYears()) return;
    setLoading(true);
    setError('');
    setRows(null);
    resetDetailState();
    try {
      const params = buildParams();
      params.set('phase', '1');
      const resp = await fetch(`/api/konjungsi-periode?${params.toString()}`);
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setRows(data.rows as ConjunctionRow[]);
        setPhase(1);
        applyPhase1ScanFields(data);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(scope: 'candidates' | 'all') {
    if (!rows || !validateYears()) return;
    setLoadingDetails(true);
    setError('');
    try {
      const params = buildParams();
      params.set('phase', '2');
      params.set('scope', scope);
      const resp = await fetch(`/api/konjungsi-periode?${params.toString()}`);
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setRows(data.rows as ConjunctionRow[]);
        setPhase(2);
        setDetailScope(scope);
        setDataSource(data.dataSource ?? null);
        setDataSourceNote(data.dataSourceNote ?? null);
        setHasRejectedMock(!!data.hasRejectedMockData);
        setRejectedMockNote(data.rejectedMockNote ?? null);
        setHasSuspiciousConstant(!!data.hasSuspiciousConstantValues);
        // Phase 2 also re-runs the scan — update scan quality fields
        applyPhase1ScanFields(data);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingDetails(false);
    }
  }

  const displayRows    = rows ? (filter === 'candidates' ? rows.filter(r => r.isRamadanCandidate) : rows) : [];
  const candidateCount = rows ? rows.filter(r => r.isRamadanCandidate).length : 0;
  const isMockData     = dataSource === 'mock' || dataSource === 'mixed';

  // Phase 1 scan warning levels
  const phase1AllMock  = phase1DataSource === 'mock';   // entire scan from mock → red
  const phase1SomeMock = phase1UsedMock && !phase1AllMock; // mixed → orange

  // Active observation location label — never hardcode "Bekasi" for WH results,
  // this reflects whatever lat/lon/tz is actually in effect for the current computation.
  const isDefaultLocation = lat === BEKASI_LAT && lon === BEKASI_LON && tz === BEKASI_TZ;
  const activeLocationLabel = isDefaultLocation
    ? BEKASI_LABEL
    : `Lokasi kustom (${lat.toFixed(4)}°, ${lon.toFixed(4)}°, ${tz})`;

  const validityStatusMeta: Record<AcademicValidityStatus, { label: string; cls: string; border: string }> = {
    VALID_FOR_THESIS: { label: 'VALID UNTUK SKRIPSI', cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/40', border: 'border-emerald-500/40' },
    PARTIAL_VALID:    { label: 'VALID SEBAGIAN',       cls: 'bg-amber-900/40 text-amber-300 border-amber-500/40',     border: 'border-amber-500/40' },
    NOT_VALID_MOCK:   { label: 'TIDAK VALID (MOCK)',   cls: 'bg-red-900/40 text-red-300 border-red-500/40',           border: 'border-red-500/40' },
  };

  function handleCopyValidityMetadata() {
    const text = [
      `Status Validitas Akademik: ${academicValidityStatus ?? '—'}`,
      `Alasan: ${academicValidityReason ?? '—'}`,
      `Sumber Data (Fase 2 / Detail): ${dataSource ?? '—'}`,
      `Sumber Data (Fase 1 / Scan): ${phase1DataSource ?? '—'}`,
      `Mengandung Data Mock (Fase 1): ${fmtBool(phase1UsedMock)}`,
      `Ada Data Ditolak (Fase 2 Mock): ${fmtBool(hasRejectedMock)}`,
      `Live Count: ${validitySummary?.liveCount ?? '—'}`,
      `Cache Count: ${validitySummary?.cacheCount ?? '—'}`,
      `Mock Count: ${validitySummary?.mockCount ?? '—'}`,
      `Failed Count: ${validitySummary?.failedCount ?? '—'}`,
      `Total Baris: ${validitySummary?.totalRows ?? '—'}`,
      `Baris Valid: ${validitySummary?.validRows ?? '—'}`,
      `Baris Ditolak: ${validitySummary?.rejectedRows ?? '—'}`,
      `Lokasi Pengamatan Aktif: ${activeLocationLabel} (lat ${lat}, lon ${lon}, tz ${tz})`,
      `Rentang Tahun: ${fromYearNum}–${toYearNum}`,
    ].join('\n');

    navigator.clipboard.writeText(text)
      .then(() => setCopyFeedback('Metadata validitas disalin ke clipboard.'))
      .catch(() => setCopyFeedback('Gagal menyalin ke clipboard.'));
    setTimeout(() => setCopyFeedback(''), 3000);
  }

  return (
    <div className="max-w-full px-4 py-8">

      {/* Title */}
      <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-blue-300 bg-clip-text text-transparent mb-2">
        {t.conjEvalTitle}
      </h1>
      <p className="text-slate-400 text-sm mb-6 max-w-3xl leading-relaxed">
        {t.conjEvalDesc}
      </p>

      {/* Academic note */}
      <div className="mb-6 p-3 rounded-lg bg-amber-900/20 border border-amber-500/30 max-w-3xl">
        <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">{t.conjEvalNote}: </span>
        <span className="text-xs text-amber-200/80">{t.conjEvalNoteText}</span>
      </div>

      {/* Form */}
      <div className="glass-card p-6 mb-6 max-w-2xl">
        <div className="grid grid-cols-2 gap-4 mb-1">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">{t.conjEvalFromYear}</label>
            <input
              type="number"
              value={fromYear}
              placeholder="2017"
              onChange={e => {
                const v = e.target.value;
                setFromYear(v === '' ? '' : parseInt(v, 10));
                setYearError('');
              }}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white text-sm placeholder-slate-600 focus:ring-indigo-500 focus:border-indigo-500 [color-scheme:dark]"
              min={1900} max={2200}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">{t.conjEvalToYear}</label>
            <input
              type="number"
              value={toYear}
              placeholder="2026"
              onChange={e => {
                const v = e.target.value;
                setToYear(v === '' ? '' : parseInt(v, 10));
                setYearError('');
              }}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white text-sm placeholder-slate-600 focus:ring-indigo-500 focus:border-indigo-500 [color-scheme:dark]"
              min={1900} max={2200}
            />
          </div>
        </div>

        {/* Helper text */}
        <p className="text-[11px] text-slate-500 mb-3">
          {t.conjEvalYearHelper}
        </p>

        {/* Inline year validation error */}
        {yearError && (
          <p className="text-xs text-red-400 mb-3">{yearError}</p>
        )}

        {/* Long range performance warning — informational, not blocking */}
        {rangeLong && (
          <div className="mb-3 p-2 rounded bg-amber-900/20 border border-amber-500/20">
            <p className="text-[11px] text-amber-300">{t.conjEvalLongRangeWarning}</p>
          </div>
        )}

        {/* Location */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-300">{t.conjEvalLocation}</label>
            <button
              onClick={() => setShowLocationOverride(p => !p)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition"
            >
              {showLocationOverride ? 'Gunakan Bekasi' : 'Override lokasi'}
            </button>
          </div>
          {!showLocationOverride ? (
            <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-md text-slate-300 text-sm">
              {BEKASI_LABEL} — lat {BEKASI_LAT}°, lon {BEKASI_LON}°, {BEKASI_TZ}
            </div>
          ) : (
            <div className="p-3 rounded-md bg-amber-900/10 border border-amber-500/20">
              <p className="text-xs text-amber-300 mb-2">{t.conjEvalLocationNote}</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t.latitude ?? 'Lintang'}</label>
                  <input type="number" step="0.0001" value={lat}
                    onChange={e => setLat(parseFloat(e.target.value))}
                    className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-xs [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t.longitude ?? 'Bujur'}</label>
                  <input type="number" step="0.0001" value={lon}
                    onChange={e => setLon(parseFloat(e.target.value))}
                    className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-xs [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t.timezone ?? 'Timezone'}</label>
                  <input type="text" value={tz}
                    onChange={e => setTz(e.target.value)}
                    className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-xs" />
                </div>
              </div>
              <button
                onClick={() => { setLat(BEKASI_LAT); setLon(BEKASI_LON); setTz(BEKASI_TZ); setShowLocationOverride(false); }}
                className="mt-2 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Reset ke Bekasi
              </button>
            </div>
          )}
        </div>

        <button
          onClick={runComputation}
          disabled={!canCompute || fromYear === '' || toYear === ''}
          className="w-full py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20"
        >
          {loading ? t.conjEvalLoading : t.conjEvalRun}
        </button>
        {(fromYear === '' || toYear === '') && (
          <p className="text-[11px] text-slate-600 text-center mt-1">
            Isi Tahun Awal dan Tahun Akhir untuk mengaktifkan tombol.
          </p>
        )}
      </div>

      {/* API / fetch error */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-6 max-w-2xl">
          <h3 className="font-bold text-red-400">{t.errorTitle}</h3>
          <p className="text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Phase 1 loading */}
      {loading && (
        <div className="glass-card p-6 mb-6 max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-slate-300 text-sm font-medium">{t.conjEvalLoading}</p>
              <p className="text-slate-500 text-xs mt-1">
                Fase 1: memindai konjungsi dan mengklasifikasikan kandidat Ramadan.
                Proses ini memanggil NASA/JPL HORIZONS. Data di-cache setelah run pertama.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2 loading */}
      {loadingDetails && (
        <div className="glass-card p-4 mb-4 max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-slate-300 text-sm">{t.conjEvalLoadingDetails}</p>
          </div>
        </div>
      )}

      {/* Top-level page tabs */}
      {rangeValid && (
        <div className="flex gap-1 mb-4 border-b border-white/10">
          <button
            onClick={() => setPageView('tabel')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
              pageView === 'tabel' ? 'bg-indigo-700/50 text-white border-b-2 border-indigo-400' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            Tabel Konjungsi
          </button>
          <button
            onClick={() => setPageView('audit')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
              pageView === 'audit' ? 'bg-indigo-700/50 text-white border-b-2 border-indigo-400' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            Audit &amp; Transparansi Data (Bab IV)
          </button>
        </div>
      )}

      {pageView === 'audit' && rangeValid && (
        <KonjungsiAuditPanel
          fromYear={fromYearNum}
          toYear={toYearNum}
          lat={lat}
          lon={lon}
          tz={tz}
        />
      )}

      {/* Results */}
      {pageView === 'tabel' && rows && !loading && (
        <>
          {/* ── Phase 1 scan quality warnings ── */}

          {/* RED: entire Phase 1 scan from mock (HORIZONS completely unavailable) */}
          {phase1AllMock && (
            <div className="mb-4 p-4 rounded-xl bg-red-950/70 border-2 border-red-500/70">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-xl flex-shrink-0">&#9888;</span>
                <div>
                  <h3 className="text-red-300 font-bold text-sm uppercase tracking-wide mb-1">
                    SELURUH Data Fase 1 Berasal dari Simulasi
                  </h3>
                  <p className="text-red-200/80 text-xs leading-relaxed">
                    NASA/JPL HORIZONS tidak tersedia selama pemindaian konjungsi
                    ({phase1FailedCount} request gagal, {phase1MockCount} respons dari fallback simulasi).
                    Tanggal konjungsi yang ditampilkan adalah <strong>estimasi kasar</strong> dari
                    formula sinodik — bukan data ephemeris akurat.
                    Hasil ini <strong>TIDAK VALID untuk keperluan akademik</strong>.
                    Jalankan ulang saat NASA/JPL HORIZONS dapat diakses.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ORANGE: mixed — some HORIZONS calls fell to mock */}
          {phase1SomeMock && (
            <div className="mb-4 p-4 rounded-xl bg-orange-950/60 border-2 border-orange-500/50">
              <div className="flex items-start gap-3">
                <span className="text-orange-400 text-xl flex-shrink-0">&#9888;</span>
                <div>
                  <h3 className="text-orange-300 font-bold text-sm uppercase tracking-wide mb-1">
                    Data Fase 1 Mengandung Fallback/Simulasi
                  </h3>
                  <p className="text-orange-200/80 text-xs leading-relaxed">
                    {phase1MockCount} dari total query HORIZONS di Fase 1 fallback ke simulasi
                    ({phase1FailedCount} request gagal live).
                    Beberapa tanggal konjungsi mungkin tidak akurat.
                    Hasil ditampilkan sebagai <strong>preview estimasi</strong> —
                    tidak valid untuk keperluan akademik.
                    Jalankan ulang saat NASA/JPL HORIZONS stabil.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Phase 2: rejected mock data warning */}
          {hasRejectedMock && (
            <div className="mb-4 p-4 rounded-xl bg-red-950/60 border-2 border-red-500/60">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-xl flex-shrink-0">&#9888;</span>
                <div>
                  <h3 className="text-red-300 font-bold text-sm uppercase tracking-wide mb-1">
                    {t.conjEvalMockWarning}
                  </h3>
                  <p className="text-red-200/80 text-xs leading-relaxed">
                    {t.conjEvalMockWarningText}
                  </p>
                  {rejectedMockNote && (
                    <p className="text-red-300/70 text-[11px] mt-1 italic">{rejectedMockNote}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Phase 2: mock/mixed source without rejection (rare) */}
          {phase === 2 && isMockData && !hasRejectedMock && (
            <div className="mb-4 p-4 rounded-xl bg-red-950/60 border-2 border-red-500/60">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-xl flex-shrink-0">&#9888;</span>
                <div>
                  <h3 className="text-red-300 font-bold text-sm uppercase tracking-wide mb-1">
                    {t.conjEvalMockWarning}
                  </h3>
                  <p className="text-red-200/80 text-xs leading-relaxed">{t.conjEvalMockWarningText}</p>
                  {dataSourceNote && <p className="text-red-300/70 text-[11px] mt-1 italic">{dataSourceNote}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Suspicious constant values warning */}
          {hasSuspiciousConstant && (
            <div className="mb-4 p-3 rounded-xl bg-orange-950/50 border border-orange-500/40">
              <p className="text-orange-300 text-xs font-semibold">
                &#9888; Nilai bujur ekliptika terdeteksi konstan pada beberapa baris awal.
                Ini dapat mengindikasikan data fallback/simulasi yang lolos filter.
                Gunakan kolom "Valid?" sebagai panduan.
              </p>
            </div>
          )}

          {/* ── Ringkasan Validitas Akademik Data ── */}
          {academicValidityStatus && (
            <div className={`glass-card p-4 mb-4 border-2 ${validityStatusMeta[academicValidityStatus].border}`}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Ringkasan Validitas Akademik Data
                </h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${validityStatusMeta[academicValidityStatus].cls}`}>
                  {validityStatusMeta[academicValidityStatus].label}
                </span>
              </div>
              <p className="text-xs text-slate-300 mb-3 leading-relaxed">{academicValidityReason}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px] text-slate-300 mb-3">
                <div><span className="text-slate-500">Sumber Data (Detail):</span> <span className="font-mono">{dataSource ?? '—'}</span></div>
                <div><span className="text-slate-500">Sumber Data (Scan):</span> <span className="font-mono">{phase1DataSource ?? '—'}</span></div>
                <div><span className="text-slate-500">Mengandung Mock:</span> <span className="font-mono">{fmtBool(phase1UsedMock)}</span></div>
                <div><span className="text-slate-500">Ada Data Ditolak:</span> <span className="font-mono">{fmtBool(hasRejectedMock)}</span></div>
                <div><span className="text-slate-500">Live Count:</span> <span className="font-mono">{validitySummary?.liveCount ?? '—'}</span></div>
                <div><span className="text-slate-500">Cache Count:</span> <span className="font-mono">{validitySummary?.cacheCount ?? '—'}</span></div>
                <div><span className="text-slate-500">Mock Count:</span> <span className="font-mono">{validitySummary?.mockCount ?? '—'}</span></div>
                <div><span className="text-slate-500">Failed Count:</span> <span className="font-mono">{validitySummary?.failedCount ?? '—'}</span></div>
                <div><span className="text-slate-500">Total Baris:</span> <span className="font-mono">{validitySummary?.totalRows ?? '—'}</span></div>
                <div><span className="text-slate-500">Baris Valid:</span> <span className="font-mono">{validitySummary?.validRows ?? '—'}</span></div>
                <div><span className="text-slate-500">Baris Ditolak:</span> <span className="font-mono">{validitySummary?.rejectedRows ?? '—'}</span></div>
                <div><span className="text-slate-500">Lokasi Pengamatan Aktif:</span> <span className="font-mono">{activeLocationLabel}</span></div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleCopyValidityMetadata}
                  className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 text-xs font-medium rounded-lg transition"
                >
                  Salin Metadata Validitas
                </button>
                {copyFeedback && <span className="text-[11px] text-emerald-400">{copyFeedback}</span>}
              </div>
            </div>
          )}

          {/* Summary bar */}
          <div className="glass-card p-4 mb-4 flex flex-wrap items-center gap-4">
            <div className="text-sm text-slate-300">
              <span className="font-bold text-white">{rows.length}</span> konjungsi
              dalam periode <span className="font-mono text-indigo-300">{fromYearNum}–{toYearNum}</span>
            </div>
            <div className="text-sm text-slate-300">
              <span className="font-bold text-emerald-300">{candidateCount}</span> kandidat awal Ramadan
            </div>
            {phase === 1 && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-900/40 border border-indigo-500/30 text-indigo-300">
                Fase 1 — data dasar
              </span>
            )}
            {phase === 2 && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-900/40 border border-purple-500/30 text-purple-300">
                Fase 2 — {detailScope === 'candidates' ? 'detail kandidat' : 'detail semua'}
              </span>
            )}
            {phase1DataSource && (
              <DataSourceBadge source={phase1DataSource} />
            )}
            {phase === 2 && dataSource && dataSource !== phase1DataSource && (
              <span className="text-[10px] text-slate-500">Detail: <DataSourceBadge source={dataSource} /></span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-400">Tampilkan:</span>
              <button onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded text-xs font-medium transition ${filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                {t.conjEvalFilterAll}
              </button>
              <button onClick={() => setFilter('candidates')}
                className={`px-3 py-1 rounded text-xs font-medium transition ${filter === 'candidates' ? 'bg-emerald-700 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                {t.conjEvalFilterCandidates}
              </button>
            </div>
          </div>

          {/* Phase 2 load buttons */}
          {phase === 1 && !loadingDetails && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => loadDetails('candidates')}
                className="px-4 py-2 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white text-sm font-semibold rounded-lg transition shadow-lg shadow-purple-500/20"
              >
                {t.conjEvalLoadDetailsCandidates}
              </button>
              <button
                onClick={() => loadDetails('all')}
                className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 text-sm font-medium rounded-lg transition"
              >
                {t.conjEvalLoadDetailsAll}
              </button>
              <span className="text-xs text-slate-500">
                Detail Kandidat lebih ringan. Detail Semua memuat seluruh {rows.length} konjungsi.
              </span>
            </div>
          )}
          {phase === 2 && !loadingDetails && (
            <div className="mb-4 flex items-center gap-3">
              <p className="text-xs text-slate-500 italic">
                Parameter detail sudah dimuat ({detailScope === 'candidates' ? 'kandidat saja' : 'semua konjungsi'}).
              </p>
              <button
                onClick={() => loadDetails(detailScope === 'candidates' ? 'all' : 'candidates')}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline transition"
              >
                {detailScope === 'candidates' ? 'Muat Detail Semua Konjungsi' : 'Muat Detail Kandidat Saja'}
              </button>
            </div>
          )}

          {/* Preview mode notice — shown below buttons when scan used mock */}
          {phase1UsedMock && (
            <div className="mb-3 px-3 py-2 bg-amber-900/20 border border-amber-500/20 rounded-lg">
              <p className="text-[11px] text-amber-300 font-medium">
                Mode Preview: tabel ini mengandung data fallback/simulasi.
                Status kandidat ditampilkan sebagai estimasi — tidak valid untuk keperluan akademik.
              </p>
            </div>
          )}

          {/* Column toggles */}
          <div className="mb-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-slate-500">Kolom tambahan:</span>
            <button onClick={() => setShowRaDec(p => !p)}
              className={`px-2 py-0.5 rounded text-xs transition border ${showRaDec ? 'bg-indigo-700/50 border-indigo-500/50 text-indigo-200' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}>
              RA / Dec
            </button>
            <button onClick={() => setShowTopo(p => !p)}
              className={`px-2 py-0.5 rounded text-xs transition border ${showTopo ? 'bg-indigo-700/50 border-indigo-500/50 text-indigo-200' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}>
              Alt/Az Topo
            </button>
            <button onClick={() => setShowKhgt(p => !p)}
              className={`px-2 py-0.5 rounded text-xs transition border ${showKhgt ? 'bg-amber-700/50 border-amber-500/50 text-amber-200' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}>
              Info KHGT
            </button>
            <button onClick={() => setShowWH(p => !p)}
              className={`px-2 py-0.5 rounded text-xs transition border ${showWH ? 'bg-emerald-700/50 border-emerald-500/50 text-emerald-200' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}>
              Wujudul Hilal Lokasi Pengamatan
            </button>
            {phase === 1 && (
              <span className="text-[10px] text-slate-600 italic ml-1">
                (kolom detail tersedia setelah klik Muat Parameter Detail)
              </span>
            )}
          </div>

          {showWH && (
            <p className="mb-3 text-[11px] text-slate-500 italic max-w-3xl leading-relaxed">
              Kolom &quot;Wujudul Hilal Lokasi Pengamatan&quot; merupakan evaluasi komputasi Rule A/Rule B
              berdasarkan lokasi pengamatan yang ditentukan pengguna ({activeLocationLabel}), bukan
              penetapan hukum awal Ramadan.
            </p>
          )}

          {/* Ekspor data */}
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-slate-500">Ekspor:</span>
            <DownloadMenu fromYear={fromYearNum} toYear={toYearNum} lat={lat} lon={lon} tz={tz} rows={rows} />
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="min-w-full text-xs text-left">
              <thead className="bg-[#0b1026]/80 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColYear}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColDate}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColTime}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColEclMoon}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColEclSun}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColEclDiff}</th>
                  {phase === 2 && <th className="px-3 py-2 whitespace-nowrap text-[9px]">Valid?</th>}
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColSunset}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColMoonAge}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColElong}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColAlt}</th>
                  {showRaDec && <>
                    <th className="px-3 py-2 whitespace-nowrap">RA Bulan (°)</th>
                    <th className="px-3 py-2 whitespace-nowrap">Dec Bulan (°)</th>
                    <th className="px-3 py-2 whitespace-nowrap">RA Matahari (°)</th>
                    <th className="px-3 py-2 whitespace-nowrap">Dec Matahari (°)</th>
                  </>}
                  {showTopo && <>
                    <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColTopoAlt}</th>
                    <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColTopoAz}</th>
                  </>}
                  {showKhgt && <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColKhgt}</th>}
                  {showWH && <th className="px-3 py-2 whitespace-nowrap">Wujudul Hilal Lokasi Pengamatan</th>}
                  <th className="px-3 py-2 whitespace-nowrap">{t.conjEvalColStatus}</th>
                  <th className="px-3 py-2 whitespace-nowrap min-w-[260px]">{t.conjEvalColNote}</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, idx) => {
                  const eclInvalid = row.eclDataValid === false;
                  return (
                    <tr
                      key={row.conjISO}
                      className={`border-t border-white/[0.05] transition-colors ${
                        row.isRamadanCandidate
                          ? 'bg-emerald-950/20 hover:bg-emerald-900/20'
                          : idx % 2 === 0
                            ? 'bg-white/[0.01] hover:bg-white/[0.03]'
                            : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-300 font-mono">{row.year}</td>
                      <td className="px-3 py-2 text-slate-200 font-mono whitespace-nowrap">{row.conjDate}</td>
                      <td className="px-3 py-2 text-slate-300 font-mono whitespace-nowrap">{row.conjTimeUTC}</td>

                      {/* Ecliptic lon — red + ⚠ if eclDataValid === false */}
                      <td className={`px-3 py-2 font-mono ${eclInvalid ? 'text-red-400' : 'text-slate-300'}`}>
                        {fmt(row.eclMoonDeg, 4)}
                      </td>
                      <td className={`px-3 py-2 font-mono ${eclInvalid ? 'text-red-400' : 'text-slate-300'}`}>
                        {fmt(row.eclSunDeg, 4)}
                      </td>
                      <td className={`px-3 py-2 font-mono ${eclInvalid ? 'text-red-400 font-semibold' : 'text-slate-300'}`}>
                        {fmt(row.eclDiffDeg, 4)}
                        {eclInvalid && <span className="ml-1 text-red-400" title="Selisih bujur ekliptika tidak mendekati 0° — data tidak valid">&#9888;</span>}
                      </td>

                      {/* Valid column — only shown in Phase 2 */}
                      {phase === 2 && (
                        <td className="px-3 py-2 text-[10px]">
                          {row.eclDataValid === null  && <span className="text-slate-600">—</span>}
                          {row.eclDataValid === true  && <span className="text-emerald-400 font-semibold">&#10003;</span>}
                          {row.eclDataValid === false && <span className="text-red-400 font-semibold">&#10007;</span>}
                        </td>
                      )}

                      <td className="px-3 py-2 text-slate-300 font-mono whitespace-nowrap">{fmtLocalTime(row.sunsetLocal)}</td>
                      <td className="px-3 py-2 text-slate-300 font-mono">{fmt(row.moonAgeHours, 2)}</td>
                      <td className="px-3 py-2 text-slate-300 font-mono">{fmt(row.geoElongDeg)}</td>
                      <td className={`px-3 py-2 font-mono font-semibold ${
                        row.geoMoonAltDeg !== null && row.geoMoonAltDeg >= 5
                          ? 'text-emerald-300'
                          : row.geoMoonAltDeg !== null && row.geoMoonAltDeg >= 0
                            ? 'text-amber-300'
                            : 'text-slate-300'
                      }`}>
                        {fmt(row.geoMoonAltDeg)}
                      </td>

                      {showRaDec && <>
                        <td className="px-3 py-2 text-slate-400 font-mono">{fmt(row.raMoonDeg)}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono">{fmt(row.decMoonDeg)}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono">{fmt(row.raSunDeg)}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono">{fmt(row.decSunDeg)}</td>
                      </>}
                      {showTopo && <>
                        <td className="px-3 py-2 text-slate-400 font-mono">{fmt(row.topoMoonAltDeg)}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono">{fmt(row.topoMoonAzDeg)}</td>
                      </>}
                      {showKhgt && (
                        <td className="px-3 py-2">
                          <KhgtBadge pass={row.khgtPass} />
                          {row.khgtPass !== null && (
                            <span className="block text-[10px] text-slate-500 mt-0.5">
                              Δalt={fmt(row.khgtAltMargin, 2)}° Δelong={fmt(row.khgtElongMargin, 2)}°
                            </span>
                          )}
                        </td>
                      )}
                      {showWH && (
                        <td className="px-3 py-2">
                          <WhBadge row={row} />
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <StatusBadge candidate={row.isRamadanCandidate} preview={phase1UsedMock} />
                      </td>
                      <td className="px-3 py-2 text-slate-400 text-[11px] leading-relaxed max-w-xs">
                        {row.candidateNote}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <p className="mt-4 text-[11px] text-slate-600 max-w-3xl leading-relaxed">
            Lokasi pengamatan aktif: {activeLocationLabel} ({lat.toFixed(4)}°, {lon.toFixed(4)}°, {tz}).
            Status kandidat ditentukan berdasarkan estimasi siklus kalender Hijriah
            (referensi konjungsi Ramadan 2024 ≈ 10 Maret, selisih ~10,88 hari/tahun),
            bukan berdasarkan kriteria KHGT.
            Kolom Valid? menunjukkan apakah selisih bujur ekliptika mendekati 0° (valid secara astronomi).
            Kolom Wujudul Hilal Lokasi Pengamatan merupakan evaluasi komputasi Rule A/Rule B untuk
            lokasi pengamatan aktif, bukan penetapan hukum awal Ramadan.
            Sumber data ephemeris: NASA/JPL HORIZONS.
            {phase1UsedMock && (
              <span className="ml-1 text-amber-400 font-semibold">
                Data Fase 1 mengandung fallback/simulasi — tampilkan sebagai preview, bukan hasil akademik.
              </span>
            )}
            {hasRejectedMock && (
              <span className="ml-1 text-red-400 font-semibold">
                Data detail fallback/simulasi ditolak dan tidak ditampilkan sebagai hasil akademik.
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
