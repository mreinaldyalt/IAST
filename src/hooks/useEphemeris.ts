'use client';

/**
 * useEphemeris — sumber posisi benda langit untuk rendering.
 *
 * Mengembalikan `getBodiesAt(ms)` yang menyembunyikan sumber data dari
 * renderer (spec #6, #13). Sekarang: MOCK (Kepler, sinkron). Nanti: prefetch
 * NASA JPL Horizons → cache → interpolasi, dengan signature yang sama.
 */
import { useCallback, useMemo } from 'react';
import { computeBodiesAt, DATA_SOURCE } from '@/lib/solar-system/ephemeris';
import type { BodyState } from '@/lib/solar-system/types';

export function useEphemeris() {
  const getBodiesAt = useCallback((ms: number): BodyState[] => computeBodiesAt(ms), []);
  return useMemo(() => ({ getBodiesAt, source: DATA_SOURCE }), [getBodiesAt]);
}
