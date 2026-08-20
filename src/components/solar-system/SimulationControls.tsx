'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScaleMode } from '@/lib/solar-system/types';
import { SPEED_OPTIONS } from '@/hooks/useSimulationClock';
import type { Dictionary, Locale } from '@/lib/i18n';

const HOUR = 3600_000;
const DAY = 86400_000;

function fmtSpeed(s: number): string {
  if (s >= 1_000_000) return `${s / 1_000_000}M×`;
  if (s >= 1000) return `${s / 1000}K×`;
  return `${s < 1 ? s.toFixed(1) : s}×`;
}

/**
 * Rentang setengah-lebar scrubber (dalam HARI) untuk tiap pilihan kecepatan.
 * Makin besar kecepatan → makin lebar rentang geser, agar "rasa" gesernya
 * sepadan dengan kecepatan yang dipilih user.
 */
const SCRUB_SPAN_DAYS: Record<number, number> = {
  0.1: 0.25, 1: 0.5, 10: 2, 100: 10, 1000: 60,
  10000: 180, 100000: 730, 1000000: 3650, 10000000: 18262, 100000000: 36525,
};
function spanDaysForSpeed(s: number): number {
  return SCRUB_SPAN_DAYS[s] ?? 30;
}
function fmtSpan(days: number, locale: Locale): string {
  if (days < 1) return `±${Math.round(days * 24)} ${locale === 'id' ? 'jam' : 'h'}`;
  if (days < 365) return `±${Math.round(days)} ${locale === 'id' ? 'hari' : 'd'}`;
  const yr = days / 365.25;
  return `±${yr < 100 ? yr.toFixed(1) : Math.round(yr)} ${locale === 'id' ? 'thn' : 'yr'}`;
}

function fmt(ms: number, tz: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ms));
}
function toLocalInput(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Btn({ active, onClick, children, title, wide }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`shrink-0 h-6 sm:h-7 ${wide ? 'min-w-[40px] sm:min-w-[52px] px-1.5 sm:px-2' : 'min-w-[32px] sm:min-w-[44px] px-1.5 sm:px-2'} rounded-lg text-[10px] sm:text-xs font-medium border transition flex items-center justify-center gap-1 ${
        active
          ? 'bg-indigo-500/30 border-indigo-400/50 text-indigo-100'
          : 'bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.1] hover:text-white'
      }`}
    >{children}</button>
  );
}

/**
 * Tombol tekan-tahan: sekali klik = 1 langkah; ditahan = langkah berulang yang
 * makin cepat (dari ~350ms turun sampai ~50ms) hingga tombol dilepas.
 */
function HoldButton({ delta, onStep, title, children }: {
  delta: number; onStep: (ms: number) => void; title?: string; children: React.ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
  };
  const start = () => {
    stop();
    onStep(delta); // langkah pertama langsung
    let interval = 350;
    const loop = () => {
      onStep(delta);
      interval = Math.max(50, interval * 0.8);
      timer.current = window.setTimeout(loop, interval);
    };
    timer.current = window.setTimeout(loop, 350);
  };
  useEffect(() => stop, []);
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); start(); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      title={title}
      className="shrink-0 h-6 sm:h-7 min-w-[32px] sm:min-w-[44px] px-1.5 sm:px-2 rounded-lg text-[10px] sm:text-xs font-medium border bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.1] hover:text-white transition select-none touch-none flex items-center justify-center"
    >{children}</button>
  );
}

export default function SimulationControls({
  displayMs, playing, speed, live,
  onTogglePlay, onNow, onLive, onStep, onSpeed, onSetTime,
  mode, onMode, onReset, t, locale,
}: {
  displayMs: number;
  playing: boolean;
  speed: number;
  live: boolean;
  onTogglePlay: () => void;
  onNow: () => void;
  onLive: () => void;
  onStep: (ms: number) => void;
  onSpeed: (s: number) => void;
  onSetTime: (ms: number) => void;
  mode: ScaleMode;
  onMode: (m: ScaleMode) => void;
  onReset: () => void;
  t: Dictionary;
  locale: Locale;
}) {
  // Scrubber relatif & tak-hingga: nilai slider = offset (-1..+1) dari "pusat".
  // Saat idle, pusat mengikuti waktu simulasi (thumb selalu di tengah). Saat
  // digeser, pusat dibekukan; begitu dilepas, pusat pindah ke waktu baru →
  // thumb balik ke tengah → user bisa lanjut geser tanpa batas (mentok teratasi).
  const draggingRef = useRef(false);
  const centerRef = useRef(displayMs);
  if (!draggingRef.current) centerRef.current = displayMs;
  const halfSpanMs = spanDaysForSpeed(speed) * DAY;
  const scrubRel = Math.max(-1, Math.min(1, (displayMs - centerRef.current) / halfSpanMs));
  const spanLabel = fmtSpan(spanDaysForSpeed(speed), locale);

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute inset-x-0 bottom-2 sm:bottom-3 z-20 flex flex-col items-center gap-1.5 pointer-events-none">
      {/* Tombol sembunyikan/tampilkan — selalu terlihat, di desktop maupun mobile,
          agar layar visualisasi bisa dilapangkan saat panel kontrol tak dibutuhkan. */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="pointer-events-auto flex items-center gap-1 px-3 py-1 rounded-full glass-card text-[10px] sm:text-[11px] font-medium text-slate-300 hover:text-white transition"
        title={collapsed ? t.ssShowControls : t.ssHideControls}
      >
        <svg className={`w-3 h-3 transition-transform ${collapsed ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
        {collapsed ? t.ssShowControls : t.ssHideControls}
      </button>

      {!collapsed && (
        <div className="pointer-events-auto w-[min(96vw,880px)] glass-card px-2.5 py-2 sm:px-4 sm:py-3 flex flex-col gap-2 sm:gap-2.5">
          {/* Row: timestamp + transport */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="flex items-center gap-1.5 text-[11px] sm:text-xs shrink-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${live ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} style={live ? { boxShadow: '0 0 8px rgba(52,211,153,.8)' } : undefined} />
                <span className={live ? 'text-emerald-300 font-semibold' : 'text-slate-500'}>{live ? t.ssLive : '—'}</span>
              </span>
              <div className="text-[11px] sm:text-xs text-slate-300 leading-tight">
                <div><b className="text-white tabular-nums">{fmt(displayMs, 'Asia/Jakarta')}</b> <span className="text-slate-500">{t.ssWIB}</span></div>
                <div className="text-slate-400 tabular-nums">{fmt(displayMs, 'UTC')} {t.ssUTC}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar justify-center sm:justify-end">
              <HoldButton delta={-DAY} onStep={onStep} title="-1 day (tahan untuk cepat)">−1d</HoldButton>
              <HoldButton delta={-HOUR} onStep={onStep} title="-1 hour (tahan untuk cepat)">−1h</HoldButton>
              <button
                onClick={onTogglePlay}
                className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-full bg-indigo-500/30 border border-indigo-400/50 text-white flex items-center justify-center hover:bg-indigo-500/50 transition"
                title={playing ? 'Pause' : 'Play'}
              >
                {playing ? (
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
                )}
              </button>
              <HoldButton delta={HOUR} onStep={onStep} title="+1 hour (tahan untuk cepat)">+1h</HoldButton>
              <HoldButton delta={DAY} onStep={onStep} title="+1 day (tahan untuk cepat)">+1d</HoldButton>
              <span className="w-px h-5 bg-white/10 mx-0.5 sm:mx-1 shrink-0" />
              <Btn onClick={onNow}>{t.ssNow}</Btn>
              <Btn active={live} onClick={onLive}>{t.ssLive}</Btn>
            </div>
          </div>

          {/* Row: speed — scroll horizontal di mobile agar tak menumpuk ke bawah */}
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-0.5 sm:mr-1 shrink-0">{t.ssSpeed}</span>
            {SPEED_OPTIONS.map((s) => (
              <Btn key={s} active={!live && speed === s} onClick={() => onSpeed(s)}>
                {fmtSpeed(s)}
              </Btn>
            ))}
          </div>

          {/* Row: scrubber waktu — rentang mengikuti kecepatan, geser tak-hingga */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{t.ssScrub}</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.0005}
              value={scrubRel}
              onPointerDown={() => { draggingRef.current = true; }}
              onPointerUp={() => { draggingRef.current = false; }}
              onPointerCancel={() => { draggingRef.current = false; }}
              onChange={(e) => onSetTime(centerRef.current + Number(e.target.value) * halfSpanMs)}
              className="flex-1 accent-indigo-400 cursor-pointer"
              title={`${t.ssScrub} · ${spanLabel} — ${locale === 'id' ? 'lepas untuk lanjut geser' : 'release to keep sliding'}`}
            />
            <span className="text-[10px] sm:text-[11px] text-slate-300 tabular-nums w-12 sm:w-16 text-right shrink-0" title={locale === 'id' ? 'rentang geser' : 'slide range'}>{spanLabel}</span>
          </div>

          {/* Row: datetime + mode + reset */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 pt-1 border-t border-white/[0.06]">
            <input
              type="datetime-local"
              value={toLocalInput(displayMs)}
              onChange={(e) => { const v = e.target.value; if (v) onSetTime(new Date(v).getTime()); }}
              className="w-full sm:w-auto bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-[11px] sm:text-xs text-slate-200 [color-scheme:dark]"
              title={t.ssManualTime}
            />
            <div className="flex items-center justify-between sm:justify-end sm:flex-1 gap-2">
              <div className="flex items-center gap-1">
                <span className="hidden sm:inline text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">{t.ssMode}</span>
                <Btn active={mode === 'overview'} onClick={() => onMode('overview')}>{t.ssOverview}</Btn>
                <Btn active={mode === 'scientific'} onClick={() => onMode('scientific')}>{t.ssScientific}</Btn>
              </div>
              <Btn onClick={onReset} title={t.ssResetCamera} wide>
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3M20 15a8 8 0 01-14 3" /></svg>
                  <span className="hidden sm:inline">{t.ssResetCamera}</span>
                </span>
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
