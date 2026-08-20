'use client';

import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { useSimulationClock } from '@/hooks/useSimulationClock';
import { useEphemeris } from '@/hooks/useEphemeris';
import SolarSystemScene from './SolarSystemScene';
import SimulationControls from './SimulationControls';
import { type PlanetId, type ScaleMode } from '@/lib/solar-system/types';
import { distanceFromSunAU } from '@/lib/solar-system/ephemeris';
import type { Locale } from '@/lib/i18n';

const PLANET_LABELS: Record<Locale, Record<PlanetId, string>> = {
  en: { mercury: 'Mercury', venus: 'Venus', earth: 'Earth', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune' },
  id: { mercury: 'Merkurius', venus: 'Venus', earth: 'Bumi', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturnus', uranus: 'Uranus', neptune: 'Neptunus' },
};
const SUN_LABEL: Record<Locale, string> = { en: 'Sun', id: 'Matahari' };

export default function SolarSystemView() {
  const { t, locale } = useI18n();
  const clock = useSimulationClock();
  const { getBodiesAt } = useEphemeris();

  const [mode, setMode] = useState<ScaleMode>('overview');
  const [selectedId, setSelectedId] = useState<PlanetId | 'sun' | null>(null);
  const [, setHoverId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [focusId, setFocusId] = useState<PlanetId | null>(null);

  const localizeName = (id: PlanetId) => PLANET_LABELS[locale][id];

  // Deep-link: /solar-system?t=<ms UTC | ISO> → mulai simulasi pada waktu itu
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('t');
    if (!raw) return;
    const ms = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
    if (!Number.isNaN(ms)) clock.setTime(ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBody = useMemo(() => {
    if (!selectedId || selectedId === 'sun') return null;
    return getBodiesAt(clock.displayMs).find((b) => b.id === selectedId) ?? null;
  }, [selectedId, clock.displayMs, getBodiesAt]);

  const num = (n: number) => n.toFixed(4);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070f]">
      {/* near sangat kecil + logarithmicDepthBuffer: wajib karena mode Ilmiah
          punya rentang skala ekstrem (radius planet terkecil ~2e-5 unit vs
          orbit Neptunus 30 unit) — tanpa ini, near-plane default (mis. 0.1)
          memotong/menghilangkan planet & Matahari begitu kamera zoom dekat. */}
      <Canvas camera={{ fov: 45, position: [0, 60, 30], near: 0.00001, far: 4000 }} dpr={[1, 2]} gl={{ antialias: true, logarithmicDepthBuffer: true }}>
        <SolarSystemScene
          clockRef={clock.clockRef}
          tick={clock.tick}
          getBodiesAt={getBodiesAt}
          mode={mode}
          selectedId={selectedId}
          onHover={setHoverId}
          onSelect={setSelectedId}
          resetSignal={resetSignal}
          focusId={focusId}
          localizeName={localizeName}
          sunLabel={SUN_LABEL[locale]}
        />
      </Canvas>

      {/* Top-left: info sistem */}
      <div className="absolute top-3 left-3 z-20 glass-card px-4 py-3 max-w-[280px] pointer-events-none">
        <h1 className="text-lg font-bold bg-gradient-to-r from-amber-200 via-white to-indigo-200 bg-clip-text text-transparent">
          {t.ssTitle}
        </h1>
        <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{t.ssSubtitle}</p>
        <div className="mt-2 flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 w-fit">
            ⚠ {t.ssDataMock}
          </span>
          <span className="text-[10px] text-slate-500 uppercase tracking-wide leading-snug">
            {mode === 'scientific' ? `${t.ssDistanceToScale} · ${t.ssSizeToScale}` : t.ssDistanceVisual}
          </span>
          {mode === 'scientific' && (
            <span className="text-[10px] text-amber-300/80 leading-snug">{t.ssSciHint}</span>
          )}
        </div>
      </div>

      {/* Top-right: panel planet terpilih */}
      {selectedBody && (
        <div className="absolute top-3 right-3 z-20 glass-card px-4 py-3 w-64">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{t.ssPlanet ?? 'Planet'}</p>
              <p className="text-base font-bold text-white">{localizeName(selectedBody.id as PlanetId)}</p>
            </div>
            <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-white transition" title="Close">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="text-slate-400">{t.ssTimestamp}</div>
            <div className="text-slate-200 tabular-nums text-[11px] break-all">{selectedBody.timestamp}</div>
            <div className="grid grid-cols-3 gap-1 mt-2 text-center">
              {(['x', 'y', 'z'] as const).map((k) => (
                <div key={k} className="bg-white/[0.04] rounded-lg py-1">
                  <div className="text-[9px] uppercase text-slate-500">{k}</div>
                  <div className="text-[11px] text-slate-200 tabular-nums">{num(selectedBody.position[k])}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.06]">
              <span className="text-slate-400">{t.ssDistanceFromSun}</span>
              <span className="text-white font-semibold tabular-nums">{num(distanceFromSunAU(selectedBody))} {t.ssAU}</span>
            </div>
          </div>
          <button
            onClick={() => setFocusId(selectedBody.id as PlanetId)}
            className="mt-3 w-full py-1.5 rounded-lg bg-indigo-500/30 border border-indigo-400/50 text-indigo-100 text-sm font-medium hover:bg-indigo-500/50 transition"
          >
            {t.ssFocus}
          </button>
        </div>
      )}

      {/* Top-right: panel Matahari */}
      {selectedId === 'sun' && (
        <div className="absolute top-3 right-3 z-20 glass-card px-4 py-3 w-64">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{t.ssPlanet ?? 'Body'}</p>
              <p className="text-base font-bold text-amber-200">{SUN_LABEL[locale]}</p>
            </div>
            <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-white transition" title="Close">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between"><span className="text-slate-400">{locale === 'id' ? 'Jenis' : 'Type'}</span><span className="text-slate-200">{locale === 'id' ? 'Bintang (pusat)' : 'Star (center)'}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-400">{locale === 'id' ? 'Radius' : 'Radius'}</span><span className="text-slate-200 tabular-nums">696.340 km</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-400">{t.ssDistanceFromSun}</span><span className="text-slate-200 tabular-nums">0 {t.ssAU}</span></div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 leading-snug">
            {locale === 'id'
              ? 'Di mode Ilmiah, ukuran diberi batas-minimum layar agar terlihat; zoom untuk melihat skala asli.'
              : 'In Scientific mode a minimum on-screen size is applied for visibility; zoom in to see true scale.'}
          </p>
        </div>
      )}

      <SimulationControls
        displayMs={clock.displayMs}
        playing={clock.playing}
        speed={clock.speed}
        live={clock.live}
        onTogglePlay={clock.togglePlay}
        onNow={clock.goNow}
        onLive={clock.goLive}
        onStep={clock.stepMs}
        onSpeed={clock.setSpeed}
        onSetTime={clock.setTime}
        mode={mode}
        onMode={setMode}
        onReset={() => setResetSignal((s) => s + 1)}
        t={t}
        locale={locale}
      />
    </div>
  );
}
