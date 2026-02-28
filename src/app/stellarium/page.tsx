'use client';

import { useState, useEffect, useRef, useCallback, Suspense, memo, forwardRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SkyData {
  sun: { az: number; el: number; source: string };
  moon: { az: number; el: number; source: string };
  datetimeUTC: string;
  datetimeLocal: string;
}

/* ------------------------------------------------------------------ */
/*  Top-level wrapper with Suspense (needed for useSearchParams)       */
/* ------------------------------------------------------------------ */

export default function StellariumPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center bg-black text-white/60 text-lg">
          Loading Stellarium&hellip;
        </div>
      }
    >
      <StellariumPage />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function wrapAz(az: number): number {
  return ((az % 360) + 360) % 360;
}

function dateToMJD(d: Date): number {
  return d.getTime() / 86400000 + 40587;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

function StellariumPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();

  // ---------- state ------------------------------------------------
  const [lat, setLat] = useState(() => parseFloat(searchParams.get('lat') || '') || -6.2383);
  const [lon, setLon] = useState(() => parseFloat(searchParams.get('lon') || '') || 106.9756);
  const [tz, setTz] = useState(() => searchParams.get('tz') || 'Asia/Jakarta');
  const [datetime, setDatetime] = useState(() => {
    const dt = searchParams.get('datetime');
    if (dt) return dt;
    return new Date().toISOString().slice(0, 19);
  });
  const [skyData, setSkyData] = useState<SkyData | null>(null);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState('');
  const [engineLoaded, setEngineLoaded] = useState(false);
  const [engineError, setEngineError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [playSpeed, setPlaySpeed] = useState(0);
  const [cityQuery, setCityQuery] = useState('');
  const [timeSliderValue, setTimeSliderValue] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stelRef = useRef<unknown>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);

  // ---------- fetch NASA sky data (debounced + AbortController) -----
  const fetchSky = useCallback(async (dt: string) => {
    // Abort previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const myId = ++fetchIdRef.current;

    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => setShowLoading(true), 500);

    try {
      const resp = await fetch(
        `/api/sky?lat=${lat}&lon=${lon}&tz=${encodeURIComponent(tz)}&datetimeLocal=${encodeURIComponent(dt)}`,
        { signal: controller.signal }
      );
      if (myId !== fetchIdRef.current) return; // stale
      const data = await resp.json();
      if (myId !== fetchIdRef.current) return; // stale
      if (data.error) {
        setError(data.error);
      } else {
        data.sun.az = wrapAz(data.sun.az);
        data.moon.az = wrapAz(data.moon.az);
        setSkyData(data);
        setError('');
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setShowLoading(false);
    }
  }, [lat, lon, tz]);

  // Debounced fetch on datetime change — throttle to max ~3 req/sec
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = playSpeed > 0 ? 600 : 300;
    debounceRef.current = setTimeout(() => fetchSky(datetime), delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [datetime, fetchSky, playSpeed]);

  // ---------- play/pause time progression ---------------------------
  useEffect(() => {
    if (playRef.current) clearInterval(playRef.current);
    if (playSpeed > 0) {
      playRef.current = setInterval(() => {
        setDatetime((prev) => {
          const d = new Date(prev);
          d.setSeconds(d.getSeconds() + playSpeed);
          return d.toISOString().slice(0, 19);
        });
      }, 1000);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playSpeed]);

  // ---------- sync engine observer when time/location changes -------
  useEffect(() => {
    if (!stelRef.current) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const core = (stelRef.current as any).core;
      if (!core) return;
      const obs = core.observer;
      if (obs) {
        obs.latitude = lat * Math.PI / 180;
        obs.longitude = lon * Math.PI / 180;
        obs.utc = dateToMJD(new Date(datetime + 'Z'));
      }
    } catch { /* engine API may vary */ }
  }, [lat, lon, datetime]);

  // ---------- load Stellarium engine --------------------------------
  useEffect(() => {
    let cancelled = false;
    const script = document.createElement('script');
    script.src = '/vendor/stellarium/stellarium-web-engine.js';
    script.async = true;
    script.onload = () => {
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const StelWebEngine = (window as any).StelWebEngine;
      if (typeof StelWebEngine !== 'function') {
        setEngineError('StelWebEngine function not found after script load.');
        return;
      }
      try {
        const canvas = canvasRef.current;
        if (!canvas) { setEngineError('Canvas element not available.'); return; }
        StelWebEngine({
          wasmFile: '/vendor/stellarium/stellarium-web-engine.wasm',
          canvas,
          translateFn: (_domain: string, str: string) => str,
          onReady: (stel: unknown) => {
            if (cancelled) return;
            stelRef.current = stel;
            setEngineLoaded(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const core = (stel as any).core;
            const dataBase = '/vendor/stellarium/data/';
            try {
              core.stars?.addDataSource?.({ url: dataBase + 'stars' });
              core.skycultures?.addDataSource?.({ url: dataBase + 'skycultures/western', key: 'western' });
              core.dsos?.addDataSource?.({ url: dataBase + 'dso' });
              core.landscapes?.addDataSource?.({ url: dataBase + 'landscapes/guereins', key: 'guereins' });
              core.milkyway?.addDataSource?.({ url: dataBase + 'surveys/milkyway' });
            } catch { /* Non-critical */ }
            // Set initial observer
            try {
              const obs = core.observer;
              if (obs) {
                obs.latitude = lat * Math.PI / 180;
                obs.longitude = lon * Math.PI / 180;
                obs.utc = dateToMJD(new Date(datetime + 'Z'));
              }
            } catch { /* ignore */ }
          },
        });
      } catch (err) {
        setEngineError(`Engine init error: ${(err as Error).message}`);
      }
    };
    script.onerror = () => { if (!cancelled) setEngineError('Failed to load stellarium-web-engine.js'); };
    document.head.appendChild(script);
    return () => { cancelled = true; try { document.head.removeChild(script); } catch { /* ok */ } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- helpers -----------------------------------------------
  function setNow() { setPlaySpeed(0); setTimeSliderValue(0); setDatetime(new Date().toISOString().slice(0, 19)); }
  function adjustTime(deltaMins: number) {
    setPlaySpeed(0);
    const d = new Date(datetime);
    d.setMinutes(d.getMinutes() + deltaMins);
    setDatetime(d.toISOString().slice(0, 19));
  }

  async function searchCity() {
    if (!cityQuery.trim()) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityQuery)}&limit=1`,
        { headers: { 'User-Agent': 'IslamicAstronomicalStudies/1.0' } }
      );
      const data = await res.json();
      if (data.length > 0) { setLat(parseFloat(data[0].lat)); setLon(parseFloat(data[0].lon)); }
    } catch { /* ignore */ }
  }

  // ---------- render -----------------------------------------------
  return (
    <div className="absolute inset-0 bg-black overflow-hidden">
      {/* Engine canvas — full screen background */}
      <EngineCanvas ref={canvasRef} />

      {/* Fallback sky gradient if engine not loaded */}
      {!engineLoaded && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(to bottom, #0a0a2e 0%, #1a1a4e 40%, #2d1f3d 70%, #3d2a1a 90%, #1a1a0a 100%)',
        }}>
          <FallbackStars />
          <div className="absolute inset-0 flex items-center justify-center">
            {engineError
              ? <p className="text-white/50 text-sm max-w-md text-center px-4">
                  {t.stellariumNotAvailable}<br />
                  <span className="text-[10px] text-red-400 mt-1 block">{engineError}</span>
                </p>
              : <p className="text-white/50 text-sm animate-pulse">{t.loadingStellarium}</p>}
          </div>
        </div>
      )}

      {/* NASA Sun/Moon overlay markers */}
      {skyData && <NasaOverlayMarkers skyData={skyData} t={t} />}

      {/* Top-right compact NASA readout */}
      {skyData && (
        <div className="absolute top-3 right-3 z-20 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-[11px] font-mono text-white/80 space-y-0.5">
          <div className="text-yellow-300">&#9728; {t.sunLabel}: Az {skyData.sun.az.toFixed(2)}&deg; El {skyData.sun.el.toFixed(2)}&deg;</div>
          <div className="text-blue-200">&#9790; {t.moonLabel}: Az {skyData.moon.az.toFixed(2)}&deg; El {skyData.moon.el.toFixed(2)}&deg;</div>
          {showLoading && <div className="text-yellow-400 animate-pulse text-[9px]">&#9203; NASA...</div>}
        </div>
      )}

      {/* Bottom status bar — like stellarium-web.org */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 bg-black/40 backdrop-blur-sm text-[11px] font-mono">
        <div className="text-green-400">{t.stellariumLabel}</div>
        <div className="flex items-center gap-3 text-white/60">
          <span>{engineLoaded ? 'Stellarium Engine \u2713' : engineError ? 'Engine Error' : 'Loading...'}</span>
          <span className="text-white/40">|</span>
          <span>{skyData?.sun.source === 'mock' ? 'MOCK' : 'LIVE'}</span>
          <span className="text-white/40">|</span>
          <span>{datetime.replace('T', ' ')}</span>
        </div>
      </div>

      {/* LEFT SIDEBAR — Stellarium-style controls */}
      {sidebarOpen && (
        <div className="absolute top-0 left-0 h-full z-30 w-72 bg-black/60 backdrop-blur-md border-r border-white/10 overflow-y-auto flex flex-col">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-bold text-white/90">&#128301; {t.menu2}</span>
            <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-white/15 rounded transition text-white/60 hover:text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Engine status */}
          <div className="px-4 py-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${engineLoaded ? 'bg-green-400' : engineError ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'}`} />
              <span className="text-xs text-white/50">
                {engineLoaded ? 'Stellarium Engine \u2713' : engineError ? engineError.slice(0, 50) : t.loadingStellarium}
              </span>
            </div>
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>

          {/* Location */}
          <div className="px-4 py-3 border-b border-white/5 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-white/30 font-bold">{t.locationInput}</div>
            <div className="flex gap-1">
              <input type="text" placeholder={t.citySearch} value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCity()}
                className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50" />
              <button onClick={searchCity} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition">&#128269;</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-white/30">{t.latitude}</label>
                <input type="number" step="0.001" value={lat} onChange={(e) => setLat(parseFloat(e.target.value))}
                  className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-blue-500/50" />
              </div>
              <div>
                <label className="text-[10px] text-white/30">{t.longitude}</label>
                <input type="number" step="0.001" value={lon} onChange={(e) => setLon(parseFloat(e.target.value))}
                  className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-blue-500/50" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-white/30">{t.timezone}</label>
              <input type="text" value={tz} onChange={(e) => setTz(e.target.value)}
                className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-blue-500/50" />
            </div>
          </div>

          {/* Time controls */}
          <div className="px-4 py-3 border-b border-white/5 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-white/30 font-bold">{t.dateTimePicker}</div>
            <input type="datetime-local" value={datetime}
              onChange={(e) => { setPlaySpeed(0); setTimeSliderValue(0); setDatetime(e.target.value); }}
              className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-blue-500/50 [color-scheme:dark]" />
            
            {/* Quick adjust buttons */}
            <div className="flex items-center gap-1 flex-wrap">
              <button onClick={() => adjustTime(-60)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">-1h</button>
              <button onClick={() => adjustTime(-10)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">-10m</button>
              <button onClick={() => adjustTime(-1)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">-1m</button>
              <button onClick={setNow} className="px-2 py-0.5 bg-blue-600/60 hover:bg-blue-500/60 rounded text-[10px] font-bold text-white transition">{t.nowBtn}</button>
              <button onClick={() => adjustTime(1)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">+1m</button>
              <button onClick={() => adjustTime(10)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">+10m</button>
              <button onClick={() => adjustTime(60)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">+1h</button>
            </div>

            {/* Playback */}
            <div className="space-y-1">
              <div className="text-[10px] text-white/30 font-bold uppercase tracking-wider">Playback</div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPlaySpeed(0)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${playSpeed === 0 ? 'bg-red-500/60 text-white' : 'bg-white/5 hover:bg-white/15 text-white/50'}`}>&#9208;</button>
                <button onClick={() => setPlaySpeed(1)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${playSpeed === 1 ? 'bg-green-500/60 text-white' : 'bg-white/5 hover:bg-white/15 text-white/50'}`}>1x</button>
                <button onClick={() => setPlaySpeed(60)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${playSpeed === 60 ? 'bg-green-500/60 text-white' : 'bg-white/5 hover:bg-white/15 text-white/50'}`}>60x</button>
                <button onClick={() => setPlaySpeed(3600)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${playSpeed === 3600 ? 'bg-green-500/60 text-white' : 'bg-white/5 hover:bg-white/15 text-white/50'}`}>3600x</button>
              </div>
              {playSpeed > 0 && <div className="text-[10px] text-green-400/80 animate-pulse">&#9654; Playing at {playSpeed}x</div>}
            </div>

            {/* Time slider — controlled with actual state */}
            <div className="space-y-1">
              <div className="text-[10px] text-white/30">&plusmn;12h slider</div>
              <input type="range" min={-720} max={720} step={1}
                value={timeSliderValue}
                onChange={(e) => {
                  const newVal = parseInt(e.target.value);
                  const delta = newVal - timeSliderValue;
                  setTimeSliderValue(newVal);
                  setPlaySpeed(0);
                  setDatetime((prev) => {
                    const d = new Date(prev);
                    d.setMinutes(d.getMinutes() + delta);
                    return d.toISOString().slice(0, 19);
                  });
                }}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-400" />
              <div className="flex justify-between text-[9px] text-white/20">
                <span>-12h</span><span>0</span><span>+12h</span>
              </div>
            </div>
          </div>

          {/* NASA Data readout */}
          {skyData && (
            <div className="px-4 py-3 border-b border-white/5 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-white/30 font-bold">NASA/JPL HORIZONS</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono">
                <span className="text-yellow-300/80">&#9728; Az</span><span className="text-white/70">{skyData.sun.az.toFixed(4)}&deg;</span>
                <span className="text-yellow-300/80">&#9728; El</span><span className="text-white/70">{skyData.sun.el.toFixed(4)}&deg;</span>
                <span className="text-blue-200/80">&#9790; Az</span><span className="text-white/70">{skyData.moon.az.toFixed(4)}&deg;</span>
                <span className="text-blue-200/80">&#9790; El</span><span className="text-white/70">{skyData.moon.el.toFixed(4)}&deg;</span>
              </div>
              <div className="text-[9px] text-white/20 mt-1">
                {t.dataSource}: {skyData.sun.source === 'mock' ? t.mockMode : t.liveMode}
              </div>
            </div>
          )}

          {/* Mini azimuthal canvas */}
          <div className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-white/30 font-bold mb-1">Sky Map</div>
            <MiniOverlayCanvas skyData={skyData} t={t} />
          </div>
        </div>
      )}

      {/* Sidebar toggle button (when closed) */}
      {!sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)}
          className="absolute top-3 left-3 z-30 p-2 bg-black/50 hover:bg-black/70 rounded-lg text-white/60 hover:text-white transition backdrop-blur-sm"
          title={t.showSidebar}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  EngineCanvas — memoized to prevent re-render                       */
/* ------------------------------------------------------------------ */

const EngineCanvas = memo(forwardRef<HTMLCanvasElement>(
  function EngineCanvasFC(_props, ref) {
    return <canvas ref={ref} id="stel-canvas" className="w-full h-full block absolute inset-0" style={{ background: '#000' }} />;
  }
));
EngineCanvas.displayName = 'EngineCanvas';

/* ------------------------------------------------------------------ */
/*  FallbackStars                                                      */
/* ------------------------------------------------------------------ */

function FallbackStars() {
  const stars = useRef<{ x: number; y: number; r: number; a: number }[]>([]);
  if (stars.current.length === 0) {
    const rng = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
    const rand = rng(42);
    for (let i = 0; i < 300; i++) {
      stars.current.push({ x: rand() * 100, y: rand() * 100, r: rand() * 1.5 + 0.3, a: rand() * 0.6 + 0.2 });
    }
  }
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
      {stars.current.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.15} fill="white" opacity={s.a} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  NASA overlay markers                                               */
/* ------------------------------------------------------------------ */

const NasaOverlayMarkers = memo(function NasaOverlayMarkersInner({ skyData, t }: { skyData: SkyData; t: { sunLabel: string; moonLabel: string } }) {
  const mapToScreen = (az: number, el: number) => {
    const x = (wrapAz(az) / 360) * 100;
    const y = (1 - (el + 90) / 180) * 100;
    return { x: `${x}%`, y: `${y}%` };
  };
  const sunPos = mapToScreen(skyData.sun.az, skyData.sun.el);
  const moonPos = mapToScreen(skyData.moon.az, skyData.moon.el);
  const sunVisible = skyData.sun.el > -10;
  const moonVisible = skyData.moon.el > -10;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {sunVisible && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: sunPos.x, top: sunPos.y }}>
          <div className="relative">
            <div className="w-6 h-6 rounded-full bg-yellow-400/30 animate-pulse" />
            <div className="absolute inset-1 rounded-full bg-yellow-400" />
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-yellow-300 font-bold drop-shadow-lg">
              &#9728; {t.sunLabel}
            </span>
          </div>
        </div>
      )}
      {moonVisible && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: moonPos.x, top: moonPos.y }}>
          <div className="relative">
            <div className="w-5 h-5 rounded-full bg-blue-200/20 animate-pulse" />
            <div className="absolute inset-1 rounded-full bg-blue-100" />
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-blue-200 font-bold drop-shadow-lg">
              &#9790; {t.moonLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
NasaOverlayMarkers.displayName = 'NasaOverlayMarkers';

/* ------------------------------------------------------------------ */
/*  Mini azimuthal overlay canvas                                      */
/* ------------------------------------------------------------------ */

function MiniOverlayCanvas({ skyData, t }: { skyData: SkyData | null; t: { sunLabel: string; moonLabel: string } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !skyData) return;
    drawMiniOverlay(canvasRef.current, skyData, t);
  }, [skyData, t]);
  return <canvas ref={canvasRef} width={260} height={200} className="w-full rounded bg-black/30 border border-white/5" />;
}

function drawMiniOverlay(canvas: HTMLCanvasElement, data: SkyData, t: { sunLabel: string; moonLabel: string }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H * 0.55;
  const maxR = Math.min(W, H) * 0.4;

  ctx.clearRect(0, 0, W, H);

  // Sky gradient
  const grad = ctx.createRadialGradient(cx, cy - 30, 0, cx, cy, maxR * 1.3);
  grad.addColorStop(0, '#0a0a3e');
  grad.addColorStop(0.5, '#1a1a5e');
  grad.addColorStop(0.8, '#2d1f4d');
  grad.addColorStop(1.0, '#1a1a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stars
  ctx.fillStyle = '#fff';
  const rng = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  const rand = rng(42);
  for (let i = 0; i < 80; i++) {
    ctx.globalAlpha = rand() * 0.4 + 0.2;
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H * 0.7, rand() * 1 + 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Horizon
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, maxR, maxR * 0.15, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Compass
  const compass = [{ label: 'N', az: 0 }, { label: 'E', az: 90 }, { label: 'S', az: 180 }, { label: 'W', az: 270 }];
  ctx.font = '9px monospace'; ctx.fillStyle = '#a0aec0'; ctx.textAlign = 'center';
  for (const cp of compass) {
    const angle = ((cp.az - 90) * Math.PI) / 180;
    ctx.fillText(cp.label, cx + Math.cos(angle) * (maxR + 12), cy + Math.sin(angle) * (maxR * 0.15 + 12) + 3);
  }

  // Alt circles
  ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 0.5;
  for (const alt of [30, 60]) {
    const r = maxR * (1 - alt / 90);
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.15, 0, 0, Math.PI * 2); ctx.stroke();
  }

  function toCanvas(az: number, el: number) {
    const r = maxR * (1 - Math.max(0, el) / 90);
    const angle = ((wrapAz(az) - 90) * Math.PI) / 180;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * 0.15 - (el > 0 ? (el / 90) * maxR * 0.6 : 0), visible: el > -5 };
  }

  // Sun
  const sunPos = toCanvas(data.sun.az, data.sun.el);
  if (sunPos.visible || data.sun.el > -10) {
    const sg = ctx.createRadialGradient(sunPos.x, sunPos.y, 0, sunPos.x, sunPos.y, 16);
    sg.addColorStop(0, data.sun.el > 0 ? '#ffd700' : '#ff8c00');
    sg.addColorStop(0.5, data.sun.el > 0 ? 'rgba(255,215,0,0.3)' : 'rgba(255,140,0,0.2)');
    sg.addColorStop(1, 'transparent');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sunPos.x, sunPos.y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = data.sun.el > 0 ? '#ffd700' : '#ff8c00';
    ctx.beginPath(); ctx.arc(sunPos.x, sunPos.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t.sunLabel, sunPos.x, sunPos.y - 10);
    ctx.font = '7px monospace';
    ctx.fillText(`${data.sun.az.toFixed(1)}\u00B0 / ${data.sun.el.toFixed(1)}\u00B0`, sunPos.x, sunPos.y + 14);
  }

  // Moon
  const moonPos = toCanvas(data.moon.az, data.moon.el);
  if (moonPos.visible || data.moon.el > -10) {
    const mg = ctx.createRadialGradient(moonPos.x, moonPos.y, 0, moonPos.x, moonPos.y, 12);
    mg.addColorStop(0, 'rgba(200,200,240,0.8)'); mg.addColorStop(0.5, 'rgba(200,200,240,0.2)'); mg.addColorStop(1, 'transparent');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(moonPos.x, moonPos.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(moonPos.x, moonPos.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0a3e'; ctx.beginPath(); ctx.arc(moonPos.x + 2, moonPos.y - 0.5, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t.moonLabel, moonPos.x, moonPos.y - 9);
    ctx.font = '7px monospace';
    ctx.fillText(`${data.moon.az.toFixed(1)}\u00B0 / ${data.moon.el.toFixed(1)}\u00B0`, moonPos.x, moonPos.y + 13);
  }

  ctx.fillStyle = '#718096'; ctx.font = '7px monospace'; ctx.textAlign = 'left';
  ctx.fillText('Horizon 0\u00B0', cx - maxR, cy + maxR * 0.15 + 12);
}
