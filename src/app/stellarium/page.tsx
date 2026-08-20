'use client';

import { useState, useEffect, useRef, useCallback, Suspense, memo, forwardRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { DateTime } from 'luxon';
import SkyOverlayCanvas from '@/components/stellarium/SkyOverlayCanvas';

const MODEL_PATHS: Record<string, string> = {
  sun: '/assets/3d/stars/sun.glb',
  moon: '/assets/3d_pbr/satellite/moon.glb',
  mercury: '/assets/3d/planets/mercury.glb',
  venus: '/assets/3d_pbr/planets/venus.glb',
  mars: '/assets/3d_pbr/planets/mars.glb',
  jupiter: '/assets/3d_pbr/planets/jupiter.glb',
  saturn: '/assets/3d/planets/saturn.glb',
  uranus: '/assets/3d/planets/uranus.glb',
  neptune: '/assets/3d/planets/neptune.glb',
  earth: '/assets/3d/planets/earth.glb',
};

function resolveModelPath(name: string, id: string, designations: string[]): string | null {
  const haystack = [name, id, ...designations].join(' ').toLowerCase();
  for (const key of Object.keys(MODEL_PATHS)) {
    if (haystack.includes(key)) return MODEL_PATHS[key];
  }
  return null;
}

interface SkyData {
  sun: { az: number; el: number; source: string };
  moon: { az: number; el: number; source: string };
  datetimeUTC: string;
  datetimeLocal: string;
  moonVisualAssetPath?: string;
  visualAssetPath?: string;
  moonEvent?: string;
  baseEvent?: string;
  isPinkMoon?: boolean;
}

function pickMoonAssetPath(data?: SkyData | null): string {
  if (!data) return DEFAULT_MOON_ASSET;
  return data.visualAssetPath || data.moonVisualAssetPath || DEFAULT_MOON_ASSET;
}

const DEFAULT_MOON_ASSET = '/assets/2d/satellite/moon.png';

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

function wrapAz(az: number): number {
  return ((az % 360) + 360) % 360;
}

function dateToMJD(d: Date): number {
  return d.getTime() / 86400000 + 40587;
}

function mjdToDate(mjd: number): Date {
  return new Date((mjd - 40587) * 86400000);
}

const NAIVE_FMT = "yyyy-MM-dd'T'HH:mm:ss";

function nowInZone(tz: string): string {
  return DateTime.now().setZone(tz).toFormat(NAIVE_FMT);
}

function addSeconds(dt: string, sec: number, tz: string): string {
  return DateTime.fromISO(dt, { zone: tz }).plus({ seconds: sec }).toFormat(NAIVE_FMT);
}

function addMinutes(dt: string, min: number, tz: string): string {
  return DateTime.fromISO(dt, { zone: tz }).plus({ minutes: min }).toFormat(NAIVE_FMT);
}

function localToUtcDate(dt: string, tz: string): Date {
  return DateTime.fromISO(dt, { zone: tz }).toUTC().toJSDate();
}

function fmtTime(dt: string): string {
  try {
    return dt.split('T')[1]?.slice(0, 8) || '--:--:--';
  } catch {
    return '--:--:--';
  }
}

function fmtDate(dt: string): string {
  try {
    return dt.split('T')[0] || '----/--/--';
  } catch {
    return '----/--/--';
  }
}

function numericSearchParam(params: { get(name: string): string | null }, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function StellariumPage() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();

  const [lat, setLat] = useState(() => numericSearchParam(searchParams, 'lat', -6.2383));
  const [lon, setLon] = useState(() => numericSearchParam(searchParams, 'lon', 106.9756));
  const tz0 = searchParams.get('tz') || 'Asia/Jakarta';
  const [tz, setTz] = useState(tz0);
  const [datetime, setDatetime] = useState(() => searchParams.get('datetime') || '2025-01-01T00:00:00');
  const [mounted, setMounted] = useState(false);
  const [skyData, setSkyData] = useState<SkyData | null>(null);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState('');
  const [engineLoaded, setEngineLoaded] = useState(false);
  const [engineError, setEngineError] = useState('');
  const [timePopupOpen, setTimePopupOpen] = useState(false);
  const [locationPopupOpen, setLocationPopupOpen] = useState(false);
  const [showStars, setShowStars] = useState(true);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [cityQuery, setCityQuery] = useState('');
  const [timeSliderValue, setTimeSliderValue] = useState(0);
  const [showAtmo, setShowAtmo] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showLandscape, setShowLandscape] = useState(true);
  const [locationName, setLocationName] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [showStarOverlay, setShowStarOverlay] = useState(true);
  const [showConstellationOverlay, setShowConstellationOverlay] = useState(true);
  const [showDsoOverlay, setShowDsoOverlay] = useState(true);
  const [showSatOverlay, setShowSatOverlay] = useState(false);
  const [overlayPicked, setOverlayPicked] = useState<{ kind: string; title: string; extra?: Record<string, string> } | null>(null);
  const [moonHookStatus, setMoonHookStatus] = useState('INIT');
  const [moonHookDetail, setMoonHookDetail] = useState('waiting');
  const [moonObjExists, setMoonObjExists] = useState(false);
  const [moonHasVisible, setMoonHasVisible] = useState(false);
  const [moonHasCall, setMoonHasCall] = useState(false);
  const [moonRuntimeCandidates, setMoonRuntimeCandidates] = useState('pending');
  const [moonInspectSummary, setMoonInspectSummary] = useState('pending');
  const [moonProofStatus, setMoonProofStatus] = useState('idle');
  const [selectionExists, setSelectionExists] = useState(false);
  const [selectionId, setSelectionId] = useState('-');
  const [selectionName, setSelectionName] = useState('-');
  const [selectionHasVisible, setSelectionHasVisible] = useState(false);
  const [selectionHasCall, setSelectionHasCall] = useState(false);
  const [clickedObj, setClickedObj] = useState<{
    name: string; id: string; designations: string[];
    alt?: number; az?: number;
    modelPath?: string | null;
    vmag?: number; distance?: string; phase?: number; radius?: string;
    raDeg?: number; decDeg?: number;
    riseLocal?: string; setLocal?: string; visibilityNote?: string;
  } | null>(null);

  const [zoomLocked, setZoomLocked] = useState(false);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [modelErrorMsg, setModelErrorMsg] = useState<string | null>(null);
  const modelViewerRef = useRef<HTMLElement | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stelRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  const simAccumRef = useRef(0);

  // Muat model-viewer via <script type="module"> MENTAH (file self-hosted),
  // BUKAN `import('@google/model-viewer')`. Terbukti lewat pengujian headless
  // Chrome: `import()` dinamis yang dibundel Turpopack membuat model-viewer
  // "loaded"/"modelIsVisible" TRUE secara internal tapi kanvas tetap HITAM di
  // semua browser (Turbopack merusak resolusi import.meta.url internal library
  // untuk worker/environment-lighting). Script tag lepas-bundel terbukti
  // render sempurna di konteks halaman yang identik.
  useEffect(() => {
    if (customElements.get('model-viewer')) return;
    if (document.querySelector('script[data-model-viewer]')) return;
    const s = document.createElement('script');
    s.type = 'module';
    s.src = '/vendor/model-viewer/model-viewer.min.js';
    s.setAttribute('data-model-viewer', '1');
    document.head.appendChild(s);
  }, []);

  // Lacak status muat model 3D (load/error) agar kegagalan TERLIHAT di UI —
  // sebelumnya popup gagal diam-diam tanpa pesan apa pun bila asset 404/rusak.
  useEffect(() => {
    if (!clickedObj?.modelPath) { setModelStatus('idle'); return; }
    setModelStatus('loading');
    setModelErrorMsg(null);
  }, [clickedObj?.modelPath]);

  useEffect(() => {
    const el = modelViewerRef.current;
    if (!el || !clickedObj?.modelPath) return;
    const onLoad = () => setModelStatus('loaded');
    const onError = (e: Event) => {
      setModelStatus('error');
      const detail = (e as CustomEvent)?.detail;
      setModelErrorMsg(detail?.type || detail?.sourceError?.message || 'load error');
    };
    el.addEventListener('load', onLoad);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('load', onLoad);
      el.removeEventListener('error', onError);
    };
  }, [clickedObj?.modelPath]);

  const applyMoonVisualConfig = useCallback((assetPath?: string) => {
    const selectedAssetPath = assetPath || DEFAULT_MOON_ASSET;
    try {
      const stel = stelRef.current as any;
      if (!stel) {
        setMoonHookStatus('NO_STEL');
        setMoonHookDetail(`path=${selectedAssetPath}`);
        return;
      }

      const hasSetMoonVisualConfig = typeof stel.setMoonVisualConfig === 'function';
      const hasSetMoonNativeVisible = typeof stel.setMoonNativeVisible === 'function';

      if (!hasSetMoonVisualConfig) {
        const candidateKeys = Object.keys(stel)
          .filter((key) => /moon|visual|asset|texture/i.test(key))
          .slice(0, 12);
        const candidateText = candidateKeys.length > 0 ? candidateKeys.join(',') : 'none';
        setMoonHookStatus('HOOK_MISSING');
        setMoonHookDetail(`candidates=${candidateText}`);
        return;
      }

      stel.setMoonVisualConfig({ enabled: true, assetPath: selectedAssetPath });
      if (hasSetMoonNativeVisible) {
        stel.setMoonNativeVisible(false);
        setMoonHookStatus('HOOK_APPLIED_NATIVE_HIDDEN');
        setMoonHookDetail(`path=${selectedAssetPath};nativeCallable=YES`);
      } else {
        setMoonHookStatus('HOOK_APPLIED');
        setMoonHookDetail(`path=${selectedAssetPath};nativeCallable=NO`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMoonHookStatus('HOOK_ERROR');
      setMoonHookDetail(msg || 'unknown error');
    }
  }, []);

  const resolvedMoonAssetPath = pickMoonAssetPath(skyData);

  const updateMoonRuntimeSummary = useCallback((Module: any, core: any, moonObj: any) => {
    try {
      const moon = moonObj || null;
      const moonKeys = moon ? Object.keys(moon) : [];
      const moonProtoKeys = moon ? Object.getOwnPropertyNames(Object.getPrototypeOf(moon) || {}) : [];
      const combined = Array.from(new Set([...moonKeys, ...moonProtoKeys]));
      const pattern = /visible|hidden|show|opacity|alpha|scale|color|label|render|point|sprite|halo/i;
      const candidates = combined.filter((k) => pattern.test(k)).slice(0, 40);
      const coreKeys = core ? Object.keys(core).filter((k) => pattern.test(k)).slice(0, 20) : [];

      setMoonObjExists(!!moon);
      setMoonHasVisible(!!moon && 'visible' in moon);
      setMoonHasCall(!!moon && typeof moon._call === 'function');
      setMoonRuntimeCandidates(candidates.length ? candidates.join(', ') : 'none');
      setMoonInspectSummary(
        `moonKeys=${moonKeys.length};moonProtoKeys=${moonProtoKeys.length};coreKeys=${coreKeys.length};coreCandidates=${coreKeys.join(',') || 'none'}`
      );

      const win = window as any;
      win.__SWE = Module;
      win.__SWE_CORE = core || null;
      win.__SWE_MOON = moon;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMoonInspectSummary(`summary_error:${msg}`);
    }
  }, []);

  const updateSelectionRuntimeSummary = useCallback((coreArg?: any) => {
    try {
      const win = window as any;
      const core = coreArg || win.__SWE_CORE;
      const sel = core?.selection || null;
      setSelectionExists(!!sel);
      setSelectionHasVisible(!!sel && 'visible' in sel);
      setSelectionHasCall(!!sel && typeof sel._call === 'function');

      if (!sel) {
        setSelectionId('-');
        setSelectionName('-');
        return;
      }

      const sid = typeof sel.id === 'string' && sel.id ? sel.id : 'Unknown';
      let sname = sid;
      try {
        const desigs = typeof sel.designations === 'function' ? sel.designations() : [];
        if (Array.isArray(desigs) && desigs.length > 0 && typeof desigs[0] === 'string') {
          sname = desigs[0];
        }
      } catch {
        // ignore
      }
      setSelectionId(sid);
      setSelectionName(sname);
    } catch {
      setSelectionExists(false);
      setSelectionHasVisible(false);
      setSelectionHasCall(false);
      setSelectionId('-');
      setSelectionName('-');
    }
  }, []);

  const proofVisibleFalse = useCallback(() => {
    try {
      const win = window as any;
      const moon = win.__SWE_MOON;
      if (!moon) {
        setMoonProofStatus('visible=false: moon object missing');
        return;
      }
      const hasVisible = 'visible' in moon;
      const before = hasVisible ? String((moon as any).visible) : 'no_visible_prop';
      try { (moon as any).visible = false; } catch { }
      const after = hasVisible ? String((moon as any).visible) : 'no_visible_prop';
      setMoonProofStatus(`visible=false executed; hasVisible=${hasVisible ? 'YES' : 'NO'}; before=${before}; after=${after}`);
      updateMoonRuntimeSummary(win.__SWE, win.__SWE_CORE, moon);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMoonProofStatus(`visible=false error: ${msg}`);
    }
  }, [updateMoonRuntimeSummary]);

  const proofSelectionVisibleFalse = useCallback(() => {
    try {
      const win = window as any;
      const core = win.__SWE_CORE;
      const sel = core?.selection;
      if (!sel) {
        setMoonProofStatus('selection visible=false: selection missing');
        updateSelectionRuntimeSummary(core);
        return;
      }
      const hasVisible = 'visible' in sel;
      const before = hasVisible ? String((sel as any).visible) : 'no_visible_prop';
      try { (sel as any).visible = false; } catch { }
      const after = hasVisible ? String((sel as any).visible) : 'no_visible_prop';
      setMoonProofStatus(`selection visible=false executed; hasVisible=${hasVisible ? 'YES' : 'NO'}; before=${before}; after=${after}`);
      updateSelectionRuntimeSummary(core);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMoonProofStatus(`selection visible=false error: ${msg}`);
    }
  }, [updateSelectionRuntimeSummary]);

  const proofCallSetHidden = useCallback(() => {
    try {
      const win = window as any;
      const moon = win.__SWE_MOON;
      if (!moon) {
        setMoonProofStatus('_call set hidden: moon object missing');
        return;
      }
      if (typeof moon._call !== 'function') {
        setMoonProofStatus('_call set hidden: _call missing');
        updateMoonRuntimeSummary(win.__SWE, win.__SWE_CORE, moon);
        return;
      }
      let ret: unknown = null;
      ret = moon._call('set', { visible: false, hidden: true, show: false, opacity: 0, alpha: 0, scale: 0.0001, color: [1, 0, 1, 1] });
      setMoonProofStatus(`_call set hidden executed; ret=${ret == null ? 'null' : String(ret).slice(0, 80)}`);
      updateMoonRuntimeSummary(win.__SWE, win.__SWE_CORE, moon);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMoonProofStatus(`_call set hidden error: ${msg}`);
    }
  }, [updateMoonRuntimeSummary]);

  const proofSelectionCallSetHidden = useCallback(() => {
    try {
      const win = window as any;
      const core = win.__SWE_CORE;
      const sel = core?.selection;
      if (!sel) {
        setMoonProofStatus('selection _call set hidden: selection missing');
        updateSelectionRuntimeSummary(core);
        return;
      }
      if (typeof sel._call !== 'function') {
        setMoonProofStatus('selection _call set hidden: _call missing');
        updateSelectionRuntimeSummary(core);
        return;
      }
      const ret = sel._call('set', { visible: false, hidden: true, show: false, opacity: 0, alpha: 0, scale: 0.0001, color: [1, 0, 1, 1] });
      setMoonProofStatus(`selection _call set hidden executed; ret=${ret == null ? 'null' : String(ret).slice(0, 80)}`);
      updateSelectionRuntimeSummary(core);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMoonProofStatus(`selection _call set hidden error: ${msg}`);
    }
  }, [updateSelectionRuntimeSummary]);

  const proofInspectKeys = useCallback(() => {
    try {
      const win = window as any;
      const core = win.__SWE_CORE;
      const sel = core?.selection || null;
      const selectionAll = sel
        ? Array.from(new Set([...Object.keys(sel), ...Object.getOwnPropertyNames(Object.getPrototypeOf(sel) || {})]))
        : [];
      const coreAll = core ? Object.keys(core) : [];
      const pattern = /visible|hidden|show|opacity|alpha|scale|color|label|render|point|sprite|halo/i;
      const selectionCand = selectionAll.filter((k) => pattern.test(k)).slice(0, 50);
      const coreCand = coreAll.filter((k) => pattern.test(k)).slice(0, 30);
      setMoonInspectSummary(`selection:${selectionCand.join(',') || 'none'} | core:${coreCand.join(',') || 'none'}`);
      setMoonProofStatus(`inspect keys executed; selection=${sel ? 'YES' : 'NO'}; core=${core ? 'YES' : 'NO'}`);
      updateSelectionRuntimeSummary(core);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMoonProofStatus(`inspect keys error: ${msg}`);
    }
  }, [updateSelectionRuntimeSummary]);

  const fetchSky = useCallback(async (dt: string) => {
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
      if (myId !== fetchIdRef.current) return;
      const data = await resp.json();
      if (myId !== fetchIdRef.current) return;
      if (data.error) {
        setError(data.error);
      } else {
        data.sun.az = wrapAz(data.sun.az);
        data.moon.az = wrapAz(data.moon.az);
        const selectedMoonAssetPath = pickMoonAssetPath(data);
        data.moonVisualAssetPath = selectedMoonAssetPath;
        setSkyData(data);
        applyMoonVisualConfig(selectedMoonAssetPath);
        setError('');
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setShowLoading(false);
    }
  }, [lat, lon, tz, applyMoonVisualConfig]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = playSpeed > 0 ? 350 : 250;
    debounceRef.current = setTimeout(() => fetchSky(datetime), delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [datetime, fetchSky, playSpeed]);

  useEffect(() => {
    if (!mounted) {
      const dt = searchParams.get('datetime');
      if (!dt) setDatetime(nowInZone(tz));
      setMounted(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const simStepSec = playSpeed === 1 ? 1 : playSpeed === 60 ? 60 : playSpeed === 3600 ? 3600 : 1;

  useEffect(() => {
    if (playSpeed <= 0) return;
    simAccumRef.current = 0;
    let lastTs: number | null = null;
    let rafId: number;
    const tick = (ts: number) => {
      if (lastTs !== null) {
        const deltaRealSec = (ts - lastTs) / 1000;
        simAccumRef.current += deltaRealSec * playSpeed;
        const steps = Math.floor(simAccumRef.current / simStepSec);
        if (steps > 0) {
          const advanceSec = steps * simStepSec;
          simAccumRef.current -= advanceSec;
          setDatetime((prev) => addSeconds(prev, advanceSec, tz));
        }
      }
      lastTs = ts;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playSpeed, simStepSec, tz]);

  useEffect(() => {
    if (!stelRef.current) return;
    try {
      const core = stelRef.current.core;
      if (!core) return;
      const obs = core.observer;
      if (obs) {
        obs.latitude = lat * Math.PI / 180;
        obs.longitude = lon * Math.PI / 180;
        obs.utc = dateToMJD(localToUtcDate(datetime, tz));
      }
    } catch {
      // ignore
    }
  }, [lat, lon, datetime, tz]);

  useEffect(() => {
    if (!stelRef.current) return;
    try {
      const core = stelRef.current.core;
      if (!core) return;
      if (core.atmosphere) core.atmosphere.visible = showAtmo;
      if (core.landscapes) core.landscapes.visible = showLandscape;
      if (core.lines && core.lines.equatorial) core.lines.equatorial.visible = showGrid;
    } catch {
      // ignore
    }
  }, [showAtmo, showLandscape, showGrid]);

  useEffect(() => {
    if (!engineLoaded) return;
    applyMoonVisualConfig(resolvedMoonAssetPath);
  }, [engineLoaded, resolvedMoonAssetPath, applyMoonVisualConfig]);

  useEffect(() => {
    let cancelled = false;
    const script = document.createElement('script');
    script.src = '/vendor/stellarium/stellarium-web-engine.js';
    script.async = true;
    script.onload = () => {
      if (cancelled) return;
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
            applyMoonVisualConfig(DEFAULT_MOON_ASSET);
            const Module = stel as any;
            const core = Module.core;
            let moonObj: any = null;
            try {
              moonObj = typeof Module.getObj === 'function'
                ? (Module.getObj('NAME Moon') || Module.getObj('Moon') || null)
                : null;
            } catch {
              moonObj = null;
            }
            updateMoonRuntimeSummary(Module, core, moonObj);
            updateSelectionRuntimeSummary(core);
            const dataBase = '/vendor/stellarium/data/';
            try {
              core.landscapes?.addDataSource?.({ url: dataBase + 'landscapes/guereins_hd', key: 'guereins' });
            } catch {
              // ignore
            }
            // Pastikan planet redup (Uranus mag ~5,7 & Neptunus ~7,8) tetap
            // DIGAMBAR + BERLABEL. Dua penyebab Neptunus tak tampak: (a) batas
            // magnitudo menyembunyikan titiknya, (b) tanpa label sangat sulit
            // ditemukan. Tiap set dibungkus try agar aman bila atribut tak ada.
            try {
              // Atribut core terverifikasi dari binary engine (sama seperti
              // setting di stellarium-web.org): bortle_index = polusi cahaya
              // (1 = langit tergelap → objek paling redup tampak),
              // display_limit_mag = magnitudo terredup yang digambar.
              try { core.bortle_index = 1; } catch { /* ignore */ }
              try { core.display_limit_mag = 15; } catch { /* ignore */ }
              try { core.exposure_scale = 1; } catch { /* ignore */ }
              const planets = core.planets;
              if (planets) {
                try { planets.visible = true; } catch { /* ignore */ }
                try { planets.hints_visible = true; } catch { /* ignore */ }
                try { planets.hints_mag_offset = 9; } catch { /* ignore */ }
              }
            } catch {
              // ignore
            }
            try {
              const onFn = Module?.on || Module?.['on'];
              if (typeof onFn === 'function') {
                onFn.call(Module, 'click', () => {
                  requestAnimationFrame(() => {
                    try {
                      const sel = core.selection;
                      if (!sel) {
                        setClickedObj(null);
                        updateSelectionRuntimeSummary(core);
                        return;
                      }
                      const desigs: string[] = typeof sel.designations === 'function' ? sel.designations() : [];
                      const objId: string = sel.id || desigs[0] || 'Unknown';
                      const name = desigs[0] || objId;
                      let alt: number | undefined;
                      let az: number | undefined;
                      let raDeg: number | undefined;
                      let decDeg: number | undefined;
                      try {
                        const obs = core.observer;
                        const radec = sel.getInfo('radec');
                        if (radec && obs && typeof Module.convertFrame === 'function' && typeof Module.c2s === 'function') {
                          const radecSph = Module.c2s(radec);
                          if (radecSph && radecSph.length >= 2 && isFinite(radecSph[0]) && isFinite(radecSph[1])) {
                            raDeg = ((radecSph[0] * 180 / Math.PI) % 360 + 360) % 360;
                            decDeg = radecSph[1] * 180 / Math.PI;
                          }
                          const observed = Module.convertFrame(obs, 'ICRF', 'OBSERVED', radec);
                          const azel = Module.c2s(observed);
                          az = azel[0] * 180 / Math.PI;
                          alt = azel[1] * 180 / Math.PI;
                          if (az < 0) az += 360;
                        }
                      } catch {
                        // ignore
                      }
                      let riseLocal: string | undefined;
                      let setLocal: string | undefined;
                      let visibilityNote: string | undefined;
                      try {
                        if (typeof sel.computeVisibility === 'function') {
                          const vis = sel.computeVisibility({ obs: core.observer });
                          if (Array.isArray(vis) && vis.length > 0 && vis[0]) {
                            if (vis[0].rise != null) {
                              riseLocal = DateTime.fromJSDate(mjdToDate(vis[0].rise), { zone: 'utc' }).setZone(tz).toFormat('HH:mm');
                            }
                            if (vis[0].set != null) {
                              setLocal = DateTime.fromJSDate(mjdToDate(vis[0].set), { zone: 'utc' }).setZone(tz).toFormat('HH:mm');
                            }
                          } else if (Array.isArray(vis) && vis.length === 0) {
                            visibilityNote = 'not_visible';
                          }
                        }
                      } catch {
                        // ignore
                      }
                      let vmag: number | undefined;
                      let distance: string | undefined;
                      let phase: number | undefined;
                      let radius: string | undefined;
                      try { const v = sel.getInfo('vmag'); if (typeof v === 'number' && isFinite(v)) vmag = v; } catch { }
                      try { const d = sel.getInfo('distance'); if (d != null) distance = String(d); } catch { }
                      try { const p = sel.getInfo('phase'); if (typeof p === 'number' && isFinite(p)) phase = p; } catch { }
                      try { const r = sel.getInfo('radius'); if (r != null) radius = String(r); } catch { }
                      const modelPath = resolveModelPath(name, objId, desigs);
                      setClickedObj({ name, id: objId, designations: desigs, alt, az, modelPath, vmag, distance, phase, radius, raDeg, decDeg, riseLocal, setLocal, visibilityNote });
                      setZoomLocked(false); // objek baru dipilih → label tombol fokus direset
                      updateSelectionRuntimeSummary(core);
                    } catch (e) {
                      if (process.env.NODE_ENV === 'development') {
                        console.error('[SWE click handler]', e);
                      }
                    }
                  });
                  return 0;
                });
              }
            } catch (e) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[SWE] Could not register click handler:', e);
              }
            }
            if (process.env.NODE_ENV === 'development') {
              fetch('/vendor/stellarium/data/landscapes/guereins/properties', { method: 'HEAD' })
                .then(r => { if (!r.ok) console.warn('[SWE] Landscape properties missing (404). Ground may not render.'); })
                .catch(() => { });
            }
            try {
              const obs = core.observer;
              if (obs) {
                obs.latitude = lat * Math.PI / 180;
                obs.longitude = lon * Math.PI / 180;
                obs.utc = dateToMJD(localToUtcDate(datetime, tz));
              }
            } catch {
              // ignore
            }
          },
        });
      } catch (err) {
        setEngineError(`Engine init error: ${(err as Error).message}`);
      }
    };
    script.onerror = () => { if (!cancelled) setEngineError('Failed to load stellarium-web-engine.js'); };
    document.head.appendChild(script);
    return () => { cancelled = true; try { document.head.removeChild(script); } catch { } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setNow() { setPlaySpeed(1); setTimeSliderValue(0); setDatetime(nowInZone(tz)); }
  function adjustTime(deltaMins: number) {
    setPlaySpeed(0);
    setDatetime((prev) => addMinutes(prev, deltaMins, tz));
  }
  function handleTzChange(newTz: string) {
    try {
      const test = DateTime.now().setZone(newTz);
      if (!test.isValid || test.invalidExplanation) return;
    } catch {
      return;
    }
    setDatetime(prev => DateTime.fromISO(prev, { zone: tz }).setZone(newTz).toFormat(NAIVE_FMT));
    setTz(newTz);
  }

  async function searchCity() {
    if (!cityQuery.trim()) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityQuery)}&limit=1`,
        { headers: { 'User-Agent': 'InternationalAstronomicalStudies/1.0' } }
      );
      const data = await res.json();
      if (data.length > 0) {
        setLat(parseFloat(data[0].lat));
        setLon(parseFloat(data[0].lon));
        setLocationName(data[0].display_name?.split(',')[0] || cityQuery);
      }
    } catch {
      // ignore
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  const blurClass = isFullscreen ? '' : 'backdrop-blur-sm';

  return (
    <div ref={containerRef} className="absolute inset-0 bg-black overflow-hidden">
      <EngineCanvas ref={canvasRef} />
      {engineLoaded && (
        <SkyOverlayCanvas
          stel={stelRef.current}
          lat={lat}
          lon={lon}
          showStars={showStarOverlay}
          showConstellations={showConstellationOverlay}
          showDso={showDsoOverlay}
          showSatellites={showSatOverlay}
          onPick={setOverlayPicked}
        />
      )}

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

      {clickedObj && (
        <div className={`absolute top-3 left-3 z-30 bg-black/80 ${isFullscreen ? '' : 'backdrop-blur-md'} border border-white/20 rounded-xl p-4 min-w-[260px] max-w-[320px] shadow-2xl`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-white">{clickedObj.name}</span>
            <button onClick={() => setClickedObj(null)} className="text-white/40 hover:text-white text-lg leading-none">&times;</button>
          </div>
          {clickedObj.designations.length > 1 && (
            <div className="text-[10px] text-white/40 mb-2">{clickedObj.designations.join(', ')}</div>
          )}
          {clickedObj.modelPath && (
            <div className="w-full aspect-square bg-black/50 rounded-lg overflow-hidden border border-white/10 mb-2 relative">
              <model-viewer
                ref={modelViewerRef}
                src={clickedObj.modelPath}
                alt={`${clickedObj.name} 3D model`}
                auto-rotate
                camera-controls
                interaction-prompt="none"
                style={{ width: '100%', height: '100%' }}
              />
              {modelStatus === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-[10px] text-white/40 animate-pulse">{locale === 'id' ? 'Memuat model 3D…' : 'Loading 3D model…'}</p>
                </div>
              )}
              {modelStatus === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-2 pointer-events-none">
                  <p className="text-[10px] text-red-300 text-center leading-relaxed">
                    {locale === 'id' ? 'Gagal memuat model 3D' : 'Failed to load 3D model'}
                    {modelErrorMsg ? ` (${modelErrorMsg})` : ''}
                    <br /><span className="text-white/30 break-all">{clickedObj.modelPath}</span>
                  </p>
                </div>
              )}
            </div>
          )}
          <div className="text-xs font-mono text-white/60 space-y-0.5">
            {clickedObj.alt !== undefined && clickedObj.az !== undefined && (
              <>
                <div>{t.popupAlt}: {clickedObj.alt.toFixed(2)}&deg;</div>
                <div>{t.popupAz}: {clickedObj.az.toFixed(2)}&deg;</div>
              </>
            )}
            {clickedObj.raDeg !== undefined && <div>{t.popupRA}: {clickedObj.raDeg.toFixed(4)}&deg;</div>}
            {clickedObj.decDeg !== undefined && <div>{t.popupDec}: {clickedObj.decDeg.toFixed(4)}&deg;</div>}
            {clickedObj.vmag !== undefined && <div>{t.popupMag}: {clickedObj.vmag.toFixed(2)}</div>}
            {clickedObj.distance !== undefined && <div>{t.popupDist}: {clickedObj.distance}</div>}
            {clickedObj.phase !== undefined && <div>{t.popupPhase}: {(clickedObj.phase * 100).toFixed(1)}%</div>}
            {clickedObj.radius !== undefined && <div>{t.popupRadius}: {clickedObj.radius}</div>}
            {(clickedObj.riseLocal || clickedObj.setLocal || clickedObj.visibilityNote) && (
              <div className="mt-1 pt-1 border-t border-white/10">
                {clickedObj.visibilityNote === 'not_visible'
                  ? <div className="text-yellow-400/70">{t.popupNotVisible}</div>
                  : <>
                    {clickedObj.riseLocal && <div>{t.popupRise}: {clickedObj.riseLocal}</div>}
                    {clickedObj.setLocal && <div>{t.popupSet}: {clickedObj.setLocal}</div>}
                  </>
                }
              </div>
            )}
          </div>
          <button
            onClick={() => {
              const core = stelRef.current?.core;
              if (!core) return;
              if (zoomLocked) {
                core.lock = null;
                core.fov = 90 * Math.PI / 180;
                setZoomLocked(false);
              } else if (core.selection) {
                core.lock = core.selection;
                core.fov = 0.6 * Math.PI / 180; // ~0.6° — cukup dekat utk lihat bulan planet
                setZoomLocked(true);
              }
            }}
            className="mt-2 w-full py-1.5 rounded-lg text-xs font-medium border border-indigo-400/40 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/35 transition"
          >
            {zoomLocked
              ? (locale === 'id' ? 'Lepas Fokus' : 'Release Focus')
              : (locale === 'id' ? 'Fokus & Perbesar (lihat bulan)' : 'Focus & Zoom In (see moons)')}
          </button>
          <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noopener noreferrer" className="mt-2 block text-[10px] text-indigo-400 hover:text-indigo-300 underline">
            NASA/JPL HORIZONS
          </a>
        </div>
      )}

      <div onClick={() => setTimePopupOpen(v => !v)} className="absolute bottom-3 left-3 z-30 cursor-pointer bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 hover:bg-black/70 transition select-none">
        <div className="text-xl font-mono font-bold text-white tracking-wider tabular-nums text-center">{mounted ? fmtTime(datetime) : '--:--:--'}</div>
        <div className="text-[10px] text-white/40 font-mono text-center">{mounted ? fmtDate(datetime) : '----/--/--'}</div>
        <div className="text-[9px] text-center mt-0.5"><span className={playSpeed > 0 ? 'text-green-400' : 'text-white/30'}>{playSpeed > 0 ? `▶ ${playSpeed}×` : '⏸'}</span></div>
      </div>

      {timePopupOpen && (
        <div className={`absolute bottom-23.5 left-3 z-30 bg-[#0b1020]/95 ${isFullscreen ? '' : 'backdrop-blur-md'} border border-white/10 rounded-xl p-4 w-72 shadow-2xl`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">{t.dateTimePicker}</span>
            <button onClick={() => setTimePopupOpen(false)} className="text-white/40 hover:text-white text-lg leading-none">&times;</button>
          </div>
          <input type="datetime-local" value={datetime} onChange={(e) => { setPlaySpeed(0); setTimeSliderValue(0); setDatetime(e.target.value); }} className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-blue-500/50 [color-scheme:dark] mb-2" />
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => adjustTime(-60)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">-1h</button>
            <button onClick={() => adjustTime(-10)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">-10m</button>
            <button onClick={() => adjustTime(-1)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">-1m</button>
            <button onClick={setNow} className="px-2 py-0.5 bg-blue-600/60 hover:bg-blue-500/60 rounded text-[10px] font-bold text-white transition">{t.nowBtn}</button>
            <button onClick={() => adjustTime(1)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">+1m</button>
            <button onClick={() => adjustTime(10)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">+10m</button>
            <button onClick={() => adjustTime(60)} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 rounded text-[10px] text-white/60 hover:text-white transition">+1h</button>
          </div>
          <div className="mt-3 space-y-1">
            <div className="text-[10px] text-white/30 font-bold uppercase tracking-wider">{t.playbackLabel}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPlaySpeed(0)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${playSpeed === 0 ? 'bg-red-500/60 text-white' : 'bg-white/5 hover:bg-white/15 text-white/50'}`}>⏸</button>
              <button onClick={() => setPlaySpeed(1)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${playSpeed === 1 ? 'bg-green-500/60 text-white' : 'bg-white/5 hover:bg-white/15 text-white/50'}`}>1×</button>
              <button onClick={() => setPlaySpeed(60)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${playSpeed === 60 ? 'bg-green-500/60 text-white' : 'bg-white/5 hover:bg-white/15 text-white/50'}`}>60×</button>
              <button onClick={() => setPlaySpeed(3600)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${playSpeed === 3600 ? 'bg-green-500/60 text-white' : 'bg-white/5 hover:bg-white/15 text-white/50'}`}>3600×</button>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <div className="text-[10px] text-white/30">&plusmn;12h slider</div>
            <input type="range" min={-720} max={720} step={5} value={timeSliderValue} onChange={(e) => {
              const newVal = parseInt(e.target.value);
              const delta = newVal - timeSliderValue;
              setTimeSliderValue(newVal);
              setPlaySpeed(0);
              setDatetime((prev) => addMinutes(prev, delta, tz));
            }} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-400" />
            <div className="flex justify-between text-[9px] text-white/20"><span>-12h</span><span>0</span><span>+12h</span></div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-white/30">{t.atmosphereLabel}</span>
            <button onClick={() => setShowAtmo(v => !v)} className={`px-2 py-0.5 rounded text-[10px] transition ${showAtmo ? 'bg-blue-600/50 text-white' : 'bg-white/5 text-white/40'}`}>{showAtmo ? t.onLabel : t.offLabel}</button>
          </div>
        </div>
      )}

      {skyData && (
        <div className={`absolute top-3 right-3 z-20 pointer-events-auto bg-black/50 ${blurClass} rounded-lg px-3 py-2 text-[11px] font-mono text-white/80 space-y-0.5 max-w-[380px]`}>
          <div className="text-yellow-300">{t.sunLabel}: Az {skyData.sun.az.toFixed(2)}&deg; El {skyData.sun.el.toFixed(2)}&deg;</div>
          <div className="text-blue-200">{t.moonLabel}: Az {skyData.moon.az.toFixed(2)}&deg; El {skyData.moon.el.toFixed(2)}&deg;</div>
          <div className="text-[9px] text-white/20">{skyData.sun.source === 'mock' ? 'MOCK' : 'LIVE'} | {engineLoaded ? '✓' : '⟳'}</div>
        </div>
      )}

      {locationPopupOpen && (
        <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 z-30 bg-[#0b1020]/95 ${isFullscreen ? '' : 'backdrop-blur-md'} border border-white/10 rounded-xl p-4 w-80 shadow-2xl`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">{t.locationInput}</span>
            <button onClick={() => setLocationPopupOpen(false)} className="text-white/40 hover:text-white text-lg leading-none">&times;</button>
          </div>
          <div className="flex gap-1 mb-2">
            <input type="text" placeholder={t.citySearch} value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCity()} className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50" />
            <button onClick={searchCity} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white transition">{t.searchBtn}</button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-white/30">{t.latitude}</label>
              <input type="number" step="0.001" value={lat} onChange={(e) => setLat(parseFloat(e.target.value))} className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-white/30">{t.longitude}</label>
              <input type="number" step="0.001" value={lon} onChange={(e) => setLon(parseFloat(e.target.value))} className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-blue-500/50" />
            </div>
          </div>
          <div className="mb-2">
            <label className="text-[10px] text-white/30">{t.timezone}</label>
            <input type="text" value={tz} onChange={(e) => handleTzChange(e.target.value)} className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-blue-500/50" />
          </div>
          <div className="text-[10px] text-white/30 mb-1">{locationName || `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`}</div>
          <div className="rounded border border-white/10 overflow-hidden">
            <iframe title="map" width="100%" height="150" style={{ border: 0, filter: 'invert(0.9) hue-rotate(180deg)' }} src={`https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.05}%2C${lat - 0.05}%2C${lon + 0.05}%2C${lat + 0.05}&layer=mapnik&marker=${lat}%2C${lon}`} loading="lazy" />
          </div>
        </div>
      )}

      <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-black/50 ${blurClass} rounded-xl px-2 py-1`}>
        <ToolbarBtn active={showStars} onClick={() => setShowStars(v => !v)} title={t.toolbarStars} icon={<ToolIcon d="M12 3l1.9 4.6 4.6 1.4-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z" />} />
        <ToolbarBtn active={showLandscape} onClick={() => setShowLandscape(v => !v)} title={t.toolbarLandscape} icon={<ToolIcon d="M3 20l6-9 3.5 5 2.5-3.5L21 20z" />} />
        <ToolbarBtn active={locationPopupOpen} onClick={() => { setLocationPopupOpen(v => !v); setTimePopupOpen(false); }} title={t.toolbarLocation} icon={<ToolIcon d="M12 21s-6-5.7-6-10a6 6 0 1112 0c0 4.3-6 10-6 10zM12 11h.01" />} />
        <ToolbarBtn active={showGrid} onClick={() => setShowGrid(v => !v)} title={t.toolbarMilkyWay} icon={<ToolIcon d="M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3v18" />} />
        <ToolbarBtn active={catalogOpen} onClick={() => { setCatalogOpen(v => !v); }} title={t.toolbarCatalog} icon={<ToolIcon d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />} />
        <span className="w-px h-5 bg-white/10 mx-0.5" />
        <ToolbarBtn active={showStarOverlay} onClick={() => setShowStarOverlay(v => !v)} title={locale === 'id' ? 'Katalog Bintang' : 'Star Catalog'} icon={<ToolIcon d="M12 2l1.8 5.6L19.5 9l-4.8 3 1.7 5.7L12 14.9 7.6 17.7 9.3 12 4.5 9l5.7-1.4L12 2z" />} />
        <ToolbarBtn active={showConstellationOverlay} onClick={() => setShowConstellationOverlay(v => !v)} title={locale === 'id' ? 'Rasi Bintang' : 'Constellations'} icon={<ToolIcon d="M5 6l5 4-2 7 6-4 6 5-2-8 4-5-6 1-3-5-3 5z" />} />
        <ToolbarBtn active={showDsoOverlay} onClick={() => setShowDsoOverlay(v => !v)} title={locale === 'id' ? 'Nebula/Galaksi' : 'Nebula/Galaxies'} icon={<ToolIcon d="M12 3a9 9 0 019 9M12 3a9 9 0 00-9 9m9-9v18m0-18a4 4 0 014 4m-4-4a4 4 0 00-4 4" />} />
        <ToolbarBtn active={showSatOverlay} onClick={() => setShowSatOverlay(v => !v)} title={locale === 'id' ? 'Satelit' : 'Satellites'} icon={<ToolIcon d="M7 17L17 7M9 3l3 3-3 3-3-3 3-3zm12 12l-3-3 3-3 3 3-3 3zM3 15l2-2 4 4-2 2-4-4z" />} />
        <ToolbarBtn active={isFullscreen} onClick={toggleFullscreen} title={t.toolbarFullscreen} icon={<ToolIcon d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" />} />
      </div>

      {overlayPicked && (
        <div className={`absolute top-3 left-3 z-30 bg-black/80 ${isFullscreen ? '' : 'backdrop-blur-md'} border border-white/20 rounded-xl p-4 min-w-[220px] max-w-[300px] shadow-2xl`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-bold text-white">{overlayPicked.title}</span>
            <button onClick={() => setOverlayPicked(null)} className="text-white/40 hover:text-white text-lg leading-none">&times;</button>
          </div>
          <div className="text-[10px] text-white/40 uppercase tracking-wide mb-2">
            {overlayPicked.kind === 'dso' ? (locale === 'id' ? 'Nebula/Galaksi' : 'Nebula/Galaxy') : overlayPicked.kind === 'satellite' ? (locale === 'id' ? 'Satelit' : 'Satellite') : 'Star'}
          </div>
          {overlayPicked.extra && (
            <div className="text-xs font-mono text-white/60 space-y-0.5">
              {Object.entries(overlayPicked.extra).map(([k, v]) => (
                <div key={k}>{k}: {v}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {catalogOpen && (
        <div className={`absolute bottom-16 right-3 z-30 bg-[#0b1020]/95 ${isFullscreen ? '' : 'backdrop-blur-md'} border border-white/10 rounded-xl p-4 w-80 max-h-[70vh] overflow-y-auto shadow-2xl`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">{t.catalogTitle}</span>
            <button onClick={() => setCatalogOpen(false)} className="text-white/40 hover:text-white text-lg leading-none">&times;</button>
          </div>
          <p className="text-[10px] text-white/40 mb-3">{t.catalogSubtitle}</p>
          <div className="space-y-2.5">
            {([
              ['catalog_azimuth_title', 'catalog_azimuth_desc'],
              ['catalog_altitude_title', 'catalog_altitude_desc'],
              ['catalog_ra_title', 'catalog_ra_desc'],
              ['catalog_dec_title', 'catalog_dec_desc'],
              ['catalog_elongation_title', 'catalog_elongation_desc'],
              ['catalog_magnitude_title', 'catalog_magnitude_desc'],
              ['catalog_distance_title', 'catalog_distance_desc'],
              ['catalog_phase_title', 'catalog_phase_desc'],
              ['catalog_fov_title', 'catalog_fov_desc'],
              ['catalog_visibility_title', 'catalog_visibility_desc'],
            ] as const).map(([titleKey, descKey]) => (
              <div key={titleKey} className="bg-white/5 rounded-lg p-2">
                <div className="text-[11px] font-bold text-indigo-300">{t[titleKey]}</div>
                <div className="text-[10px] text-white/50 leading-relaxed mt-0.5">{t[descKey]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolIcon({ d }: { d: string }) {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function ToolbarBtn({ active, onClick, title, icon }: { active: boolean; onClick: () => void; title: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm transition ${active
        ? 'bg-blue-600/50 text-white border border-blue-400/30'
        : 'bg-black/40 text-white/50 hover:bg-black/60 hover:text-white/80 border border-white/5'
        }`}
    >
      {icon}
    </button>
  );
}

const EngineCanvas = memo(forwardRef<HTMLCanvasElement>(function EngineCanvasFC(_props, ref) {
  return <canvas ref={ref} id="stel-canvas" className="w-full h-full block absolute inset-0" style={{ background: '#000' }} />;
}));
EngineCanvas.displayName = 'EngineCanvas';

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
