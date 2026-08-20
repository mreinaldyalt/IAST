'use client';

import { useEffect, useRef, useState } from 'react';
import { OrbitControls, Stars } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Sun from './Sun';
import Planet from './Planet';
import OrbitPath from './OrbitPath';
import CameraController from './CameraController';
import { PLANET_IDS, PLANET_VISUALS, SUN_RADIUS_KM, type PlanetId, type ScaleMode, type BodyState } from '@/lib/solar-system/types';
import { auToScene, realRadiusScene } from '@/lib/solar-system/scale';
import type { ClockModel } from '@/hooks/useSimulationClock';

/**
 * Isi Canvas. Menerima clock + fungsi getBodiesAt (kontrak BodyState[]). Tiap
 * frame: majukan jam → hitung BodyState[] → set posisi mesh (imperatif, tanpa
 * re-render React). Rendering TIDAK tahu asal data astronomi.
 */
export default function SolarSystemScene({
  clockRef, tick, getBodiesAt, mode,
  selectedId, onHover, onSelect, resetSignal, focusId, localizeName, sunLabel,
}: {
  clockRef: React.MutableRefObject<ClockModel>;
  tick: (deltaSec: number) => void;
  getBodiesAt: (ms: number) => BodyState[];
  mode: ScaleMode;
  selectedId: PlanetId | 'sun' | null;
  onHover: (id: string | null) => void;
  onSelect: (id: PlanetId | 'sun') => void;
  resetSignal: number;
  focusId: PlanetId | null;
  localizeName: (id: PlanetId) => string;
  sunLabel: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const groupRefs = useRef<Partial<Record<PlanetId, THREE.Group>>>({});
  const [focusPos, setFocusPos] = useState<THREE.Vector3 | null>(null);
  const [focusRadius, setFocusRadius] = useState(1);
  const [orbitEpoch] = useState(() => Date.now()); // stabil: garis orbit tak dihitung per-frame

  useFrame((_, delta) => {
    tick(delta);
    const bodies = getBodiesAt(clockRef.current.simMs);
    for (const b of bodies) {
      const g = groupRefs.current[b.id as PlanetId];
      if (g) {
        const [x, y, z] = auToScene(b.position, mode);
        g.position.set(x, y, z);
        // Ukuran bola = radius asli (mode ilmiah = fisika 100%; overview =
        // diperbesar). Tanpa scaling per-frame → mendekati planet (fokus/zoom)
        // memperbesarnya secara alami, menjauh mengecil sesuai perspektif nyata.
      }
    }
  });

  useEffect(() => {
    if (!focusId) { setFocusPos(null); return; }
    const b = getBodiesAt(clockRef.current.simMs).find((x) => x.id === focusId);
    if (b) {
      const [x, y, z] = auToScene(b.position, mode);
      setFocusPos(new THREE.Vector3(x, y, z));
      const v = PLANET_VISUALS[focusId];
      setFocusRadius(mode === 'scientific' ? realRadiusScene(v.realRadiusKm) : v.visualRadius);
    }
  }, [focusId, mode, getBodiesAt, clockRef]);

  return (
    <>
      <color attach="background" args={['#05070f']} />
      <Stars radius={320} depth={70} count={3500} factor={6} saturation={0} fade speed={0.4} />

      <Sun
        label={sunLabel}
        mode={mode}
        radius={mode === 'scientific' ? realRadiusScene(SUN_RADIUS_KM) : 1.7}
        selected={selectedId === 'sun'}
        onSelect={() => onSelect('sun')}
        onHover={(h) => onHover(h ? 'sun' : null)}
      />

      {PLANET_IDS.map((id) => (
        <OrbitPath
          key={`orbit-${id}`}
          id={id}
          mode={mode}
          epochMs={orbitEpoch}
          color={PLANET_VISUALS[id].color}
          highlighted={selectedId === id}
        />
      ))}

      {PLANET_IDS.map((id) => {
        const v = PLANET_VISUALS[id];
        const sphereRadius = mode === 'scientific' ? realRadiusScene(v.realRadiusKm) : v.visualRadius;
        return (
          <Planet
            key={id}
            visual={v}
            label={localizeName(id)}
            selected={selectedId === id}
            sphereRadius={sphereRadius}
            onHover={onHover}
            onSelect={onSelect}
            registerRef={(g) => { groupRefs.current[id] = g ?? undefined; }}
          />
        );
      })}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.08}
        minDistance={0.00002}
        maxDistance={400}
      />
      <CameraController controlsRef={controlsRef} resetSignal={resetSignal} focusPos={focusPos} focusRadius={focusRadius} />
    </>
  );
}
