'use client';

import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { PlanetId, ScaleMode } from '@/lib/solar-system/types';
import { orbitPathAU, jdFromMs } from '@/lib/solar-system/orbitalElements';
import { auToScene } from '@/lib/solar-system/scale';

/**
 * Lintasan orbit penuh 360° sebagai OBJECT pada scene (bukan gambar
 * background) — mengikuti proyeksi kamera. Reusable per planet.
 */
export default function OrbitPath({
  id, mode, epochMs, color, highlighted,
}: {
  id: PlanetId;
  mode: ScaleMode;
  epochMs: number;
  color: string;
  highlighted?: boolean;
}) {
  const points = useMemo(() => {
    const jd = jdFromMs(epochMs);
    return orbitPathAU(id, jd).map((p) => {
      const [x, y, z] = auToScene(p, mode);
      return new THREE.Vector3(x, y, z);
    });
  }, [id, mode, epochMs]);

  return (
    <Line
      points={points}
      color={color}
      lineWidth={highlighted ? 2 : 1}
      transparent
      opacity={highlighted ? 0.9 : 0.32}
    />
  );
}
