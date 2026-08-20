'use client';

/**
 * Overlay 2D kanvas di atas kanvas WASM Stellarium: menggambar bintang
 * (Hipparcos, Vmag<=6.5), garis rasi (skyculture barat), nebula/DSO
 * (OpenNGC, terkurasi ~629 objek terkenal), dan satelit (CelesTrak + SGP4).
 *
 * Data BUKAN dari format HiPS/katalog internal Stellarium (yang server-nya
 * terkunci) — semua dari sumber publik independen yang diproses jadi JSON
 * ringkas (lihat scripts/parse-*.js), diproyeksikan pakai rumus & fungsi ASLI
 * milik engine (s2c/convertFrame, frame VIEW) supaya konsisten dgn rendering
 * native. Lihat src/lib/skyOverlay/projection.ts utk validasi rumus.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { icrfToView, observedToView, viewToScreen } from '@/lib/skyOverlay/projection';
import { computeSatellitePositions, type SatPosition } from '@/lib/skyOverlay/satellites';
import type {
  StarsData, ConstellationsData, DsoData, SatellitesData, OverlayPicked,
} from '@/lib/skyOverlay/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StelModule = any;

function mjdToDateLocal(mjd: number): Date {
  return new Date((mjd - 40587) * 86400000);
}

interface Projected {
  x: number; y: number; kind: 'star' | 'dso' | 'satellite';
  ref: unknown; size: number;
}

export default function SkyOverlayCanvas({
  stel, lat, lon, showStars, showConstellations, showDso, showSatellites, onPick,
}: {
  stel: StelModule | null;
  lat: number;
  lon: number;
  showStars: boolean;
  showConstellations: boolean;
  showDso: boolean;
  showSatellites: boolean;
  onPick?: (obj: OverlayPicked) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<{
    stars: StarsData; constellations: ConstellationsData; dso: DsoData; sats: SatellitesData;
  } | null>(null);
  const satPosRef = useRef<SatPosition[]>([]);
  const lastSatComputeRef = useRef(0);
  const pickListRef = useRef<Array<{ x: number; y: number; kind: 'star' | 'dso' | 'satellite'; label: string; extra?: Record<string, string> }>>([]);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/data/stars.json').then((r) => r.json()),
      fetch('/data/constellations.json').then((r) => r.json()),
      fetch('/data/dso.json').then((r) => r.json()),
      fetch('/data/satellites.json').then((r) => r.json()),
    ]).then(([stars, constellations, dso, sats]) => {
      if (!cancelled) setData({ stars, constellations, dso, sats });
    }).catch(() => { /* overlay opsional — diam bila gagal muat */ });
    return () => { cancelled = true; };
  }, []);

  const draw = useCallback((now: number) => {
    rafRef.current = requestAnimationFrame(draw);
    if (!stel || !data || !canvasRef.current) return;
    // Throttle ~15fps — katalog besar, tak perlu tiap frame render 3D.
    if (now - lastFrameRef.current < 66) return;
    lastFrameRef.current = now;

    const Module = stel;
    const core = stel.core;
    const canvas = canvasRef.current;
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth, h = parent.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const fov = core.fov as number;
    const fovDeg = fov * 180 / Math.PI;
    const obs = core.observer;
    const picks: typeof pickListRef.current = [];

    // Pusat pandang saat ini (RA/Dec) — utk filter sudut murah sebelum
    // proyeksi WASM yg lebih mahal (hindari memanggil WASM utk semua objek).
    let centerRaRad = 0, centerDecRad = 0;
    try {
      const azalt = obs.azalt;
      const icrfCenter = Module.convertFrame(obs, 'OBSERVED', 'ICRF', azalt);
      const sph = Module.c2s(icrfCenter);
      centerRaRad = sph[0]; centerDecRad = sph[1];
    } catch { return; }

    // Filter sudut kasar — SEKARANG murni utk performa (skip WASM call utk
    // objek yg jelas jauh di luar layar), BUKAN lagi krn batas matematis
    // proyeksi (proyeksi stereografik valid mulus s.d. ~180°, lihat
    // projection.ts). Margin longgar (fov*0.8+15°, dibatasi 170°) supaya
    // tak ada objek yg salah terpotong sebelum sempat diproyeksikan.
    const safeHalfAngleRad = Math.min(fov / 2 + 15 * Math.PI / 180, 170 * Math.PI / 180);
    const cosSafe = Math.cos(safeHalfAngleRad);
    const nearView = (raDeg: number, decDeg: number) => {
      const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180;
      const cosSep = Math.sin(centerDecRad) * Math.sin(dec) +
        Math.cos(centerDecRad) * Math.cos(dec) * Math.cos(centerRaRad - ra);
      return cosSep > cosSafe;
    };

    const margin = 40;
    const inBounds = (x: number, y: number) => x > -margin && x < w + margin && y > -margin && y < h + margin;

    // ── LOD (level-of-detail) berbasis FOV — meniru Stellarium asli: makin
    // lebar pandangan, makin sedikit detail (cuma garis+bintang terang),
    // detail penuh (DSO berlabel) baru padat saat sudah zoom cukup dekat.
    // Tanpa ini ratusan label akan bertumpuk tak terbaca di FOV lebar.
    const starVmagLimit =
      fovDeg > 120 ? 2.0 : fovDeg > 80 ? 3.2 : fovDeg > 45 ? 4.5 : fovDeg > 20 ? 5.5 : 6.5;
    const dsoMagLimit =
      fovDeg > 90 ? -Infinity : fovDeg > 50 ? 4 : fovDeg > 25 ? 7 : Infinity;
    const dsoRequireMessier = fovDeg > 50; // FOV lebar: hanya objek Messier terkenal

    // Hindari label bertabrakan (tumpuk jadi "sup teks") — lacak kotak label
    // yg sudah digambar frame ini, lewati label baru yg bertumpang tindih.
    const labelRects: Array<[number, number, number, number]> = []; // x0,y0,x1,y1
    const labelFits = (x: number, y: number, textW: number, textH: number) => {
      const x0 = x, y0 = y - textH, x1 = x + textW, y1 = y;
      for (const [rx0, ry0, rx1, ry1] of labelRects) {
        if (x0 < rx1 && x1 > rx0 && y0 < ry1 && y1 > ry0) return false;
      }
      labelRects.push([x0, y0, x1, y1]);
      return true;
    };

    // ── Garis rasi bintang — SELALU digambar (spt Stellarium asli, sparse
    // & jadi acuan arah walau di FOV sangat lebar), tak kena LOD magnitudo.
    if (showConstellations) {
      const starByHip = new Map<number, [number, number]>(); // hip -> [ra,dec]
      for (const s of data.stars.stars) starByHip.set(s[0], [s[1], s[2]]);
      ctx.strokeStyle = 'rgba(120,150,220,0.45)';
      ctx.lineWidth = 1;
      for (const c of data.constellations.constellations) {
        for (const seg of c.lines) {
          ctx.beginPath();
          let started = false;
          let any = false;
          for (const hip of seg) {
            const pos = starByHip.get(hip);
            if (!pos) { started = false; continue; }
            if (!nearView(pos[0], pos[1])) { started = false; continue; }
            const view = icrfToView(Module, obs, pos[0], pos[1]);
            const p = viewToScreen(view, fov, w, h);
            if (!p.inFront) { started = false; continue; }
            any = true;
            if (!started) { ctx.moveTo(p.x, p.y); started = true; } else { ctx.lineTo(p.x, p.y); }
          }
          if (any) ctx.stroke();
        }
      }
    }

    // ── Bintang — jumlah yg digambar menyempit seiring FOV melebar ────
    if (showStars) {
      for (const [, raDeg, decDeg, vmag] of data.stars.stars) {
        if (vmag > starVmagLimit) break; // data sudah terurut terang->redup
        if (!nearView(raDeg, decDeg)) continue;
        const view = icrfToView(Module, obs, raDeg, decDeg);
        const p = viewToScreen(view, fov, w, h);
        if (!p.inFront || !inBounds(p.x, p.y)) continue;
        const size = Math.max(0.5, 2.6 - vmag * 0.35);
        const alpha = Math.max(0.25, 1 - vmag / 7);
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Nebula / DSO — digating magnitudo+Messier sesuai FOV, label anti-
    // tabrakan, ditata terang/terkenal dulu (data sudah terurut magnitudo).
    if (showDso && dsoMagLimit !== -Infinity) {
      ctx.font = '11px sans-serif';
      for (const o of data.dso.objects) {
        if (dsoRequireMessier && !o.messier) continue;
        if (o.mag !== null && o.mag > dsoMagLimit) continue;
        if (!nearView(o.ra, o.dec)) continue;
        const view = icrfToView(Module, obs, o.ra, o.dec);
        const p = viewToScreen(view, fov, w, h);
        if (!p.inFront || !inBounds(p.x, p.y)) continue;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(120,220,180,0.85)';
        ctx.lineWidth = 1.2;
        ctx.ellipse(p.x, p.y, 6, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        const label = o.messier || o.common?.split(',')[0] || o.name;
        const textW = ctx.measureText(label).width;
        if (labelFits(p.x + 8, p.y + 3, textW, 11)) {
          ctx.fillStyle = 'rgba(150,230,200,0.9)';
          ctx.fillText(label, p.x + 8, p.y + 3);
        }
        picks.push({
          x: p.x, y: p.y, kind: 'dso', label,
          extra: { Tipe: o.type, Magnitudo: o.mag !== null ? String(o.mag) : '-', NGC: o.name },
        });
      }
    }

    // ── Satelit — tak digating FOV (jumlahnya sedikit, 157), tetap anti-
    // tabrakan label spt DSO.
    if (showSatellites && data.sats.sats.length > 0) {
      if (now - lastSatComputeRef.current > 2000) {
        lastSatComputeRef.current = now;
        try {
          const mjd = obs.utc as number;
          const simDate = mjdToDateLocal(mjd);
          satPosRef.current = computeSatellitePositions(data.sats.sats, simDate, lat, lon);
        } catch { satPosRef.current = []; }
      }
      ctx.font = '11px sans-serif';
      for (const sp of satPosRef.current) {
        const view = observedToView(Module, obs, sp.azDeg, sp.altDeg);
        const p = viewToScreen(view, fov, w, h);
        if (!p.inFront || !inBounds(p.x, p.y)) continue;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,210,90,0.95)';
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        const textW = ctx.measureText(sp.name).width;
        if (labelFits(p.x + 6, p.y - 4, textW, 11)) {
          ctx.fillStyle = 'rgba(255,220,130,0.85)';
          ctx.fillText(sp.name, p.x + 6, p.y - 4);
        }
        picks.push({
          x: p.x, y: p.y, kind: 'satellite', label: sp.name,
          extra: { Elevasi: sp.altDeg.toFixed(1) + '°', Azimut: sp.azDeg.toFixed(1) + '°', Jarak: Math.round(sp.rangeKm) + ' km' },
        });
      }
    }

    pickListRef.current = picks;
  }, [stel, data, showStars, showConstellations, showDso, showSatellites, lat, lon]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // Kanvas overlay HARUS pointer-events:none (murni visual) — drag-pan &
  // scroll-zoom native Stellarium jalan lewat kanvas WASM di bawahnya, tak
  // boleh ketutup. Deteksi klik dipasang di kanvas WASM ITU SENDIRI (bukan
  // React onClick di overlay) via addEventListener biasa, agar drag/scroll
  // tetap tembus ke engine sementara klik-pilih overlay tetap berfungsi.
  useEffect(() => {
    const overlay = canvasRef.current;
    const engineCanvas = overlay?.parentElement?.querySelector('#stel-canvas') as HTMLCanvasElement | null;
    if (!engineCanvas) return;
    let downX = 0, downY = 0;
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
    const onUp = (e: PointerEvent) => {
      // Hanya anggap "klik" bila mouse nyaris tak bergerak (bukan drag pan).
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return;
      const rect = engineCanvas.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      let best: (typeof pickListRef.current)[number] | null = null;
      let bestD = 14;
      for (const p of pickListRef.current) {
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best && onPick) onPick({ kind: best.kind, title: best.label, extra: best.extra });
    };
    engineCanvas.addEventListener('pointerdown', onDown);
    engineCanvas.addEventListener('pointerup', onUp);
    return () => {
      engineCanvas.removeEventListener('pointerdown', onDown);
      engineCanvas.removeEventListener('pointerup', onUp);
    };
  }, [onPick]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none' }}
    />
  );
}
