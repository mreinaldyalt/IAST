'use client';

/**
 * useSimulationClock — jam simulasi tata surya.
 *
 * Model waktu (spec #7): simulationTime += realDeltaTime * speedFactor.
 * Integrasi waktu sebenarnya di-tick oleh render loop scene (useFrame) yang
 * memanggil `tick(delta)`; hook ini memiliki MODEL jam (clockRef) + aksi
 * kontrol + state tampilan low-frequency (agar tidak memicu re-render 60fps).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface ClockModel {
  simMs: number;      // waktu simulasi (epoch ms, UTC)
  speed: number;      // faktor kecepatan
  playing: boolean;
  live: boolean;      // ikuti waktu nyata (1x)
}

export const SPEED_OPTIONS = [0.1, 1, 10, 100, 1000, 10000, 100000, 1_000_000, 10_000_000, 100_000_000];

export function useSimulationClock() {
  const clockRef = useRef<ClockModel>({
    simMs: Date.now(),
    speed: 1,
    playing: true,
    live: true,
  });

  // Cermin state untuk UI kontrol (berubah hanya saat aksi user)
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeedState] = useState(1);
  const [live, setLive] = useState(true);
  // Waktu tampilan (low-freq, ~8fps)
  const [displayMs, setDisplayMs] = useState(clockRef.current.simMs);

  useEffect(() => {
    const iv = setInterval(() => setDisplayMs(clockRef.current.simMs), 120);
    return () => clearInterval(iv);
  }, []);

  /** Dipanggil render loop tiap frame dengan delta (detik). */
  const tick = useCallback((deltaSec: number) => {
    const c = clockRef.current;
    if (c.live && c.playing) {
      c.simMs = Date.now();
    } else if (c.playing) {
      c.simMs += deltaSec * 1000 * c.speed;
    }
  }, []);

  const play = useCallback(() => { clockRef.current.playing = true; setPlaying(true); }, []);
  const pause = useCallback(() => { clockRef.current.playing = false; clockRef.current.live = false; setPlaying(false); setLive(false); }, []);
  const togglePlay = useCallback(() => {
    const c = clockRef.current;
    c.playing = !c.playing;
    if (!c.playing) c.live = false;
    setPlaying(c.playing);
    setLive(c.live);
  }, []);

  const setSpeed = useCallback((s: number) => {
    const c = clockRef.current;
    c.speed = s; c.live = false; c.playing = true;
    setSpeedState(s); setLive(false); setPlaying(true);
  }, []);

  const goLive = useCallback(() => {
    const c = clockRef.current;
    c.live = true; c.playing = true; c.speed = 1; c.simMs = Date.now();
    setLive(true); setPlaying(true); setSpeedState(1); setDisplayMs(c.simMs);
  }, []);

  const goNow = useCallback(() => {
    const c = clockRef.current;
    c.simMs = Date.now(); c.live = false;
    setLive(false); setDisplayMs(c.simMs);
  }, []);

  const stepMs = useCallback((deltaMs: number) => {
    const c = clockRef.current;
    c.simMs += deltaMs; c.live = false;
    setLive(false); setDisplayMs(c.simMs);
  }, []);

  const setTime = useCallback((ms: number) => {
    const c = clockRef.current;
    c.simMs = ms; c.live = false;
    setLive(false); setDisplayMs(ms);
  }, []);

  return useMemo(() => ({
    clockRef, tick,
    displayMs, playing, speed, live,
    play, pause, togglePlay, setSpeed, goLive, goNow, stepMs, setTime,
  }), [displayMs, playing, speed, live, tick, play, pause, togglePlay, setSpeed, goLive, goNow, stepMs, setTime]);
}

export type SimulationClock = ReturnType<typeof useSimulationClock>;
