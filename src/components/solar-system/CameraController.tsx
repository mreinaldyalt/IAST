'use client';

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fitRadius } from '@/lib/solar-system/scale';

/**
 * Kontrol kamera:
 *  - fit-to-solar-system pada mount & saat Reset (seluruh orbit Neptune masuk
 *    viewport + padding, tanpa terpotong di sisi manapun),
 *  - smooth focus ke planet terpilih.
 *
 * Fit memakai fov efektif terkecil (vertikal vs horizontal) sehingga tidak
 * terpotong pada aspect ratio apa pun.
 */
const DEG = Math.PI / 180;
const VIEW_DIR = new THREE.Vector3(0, 2.2, 1.0).normalize(); // top-down + tilt

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Controls = any;

export default function CameraController({
  controlsRef, resetSignal, focusPos, focusRadius = 1,
}: {
  controlsRef: React.MutableRefObject<Controls>;
  resetSignal: number;
  focusPos: THREE.Vector3 | null;
  focusRadius?: number;
}) {
  const { camera, size } = useThree();
  const focusRef = useRef<THREE.Vector3 | null>(null);
  const focusDistRef = useRef(11);

  const fit = () => {
    const persp = camera as THREE.PerspectiveCamera;
    const fovV = persp.fov * DEG;
    const aspect = size.width / size.height;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
    const limit = Math.min(fovV, fovH);
    const R = fitRadius();
    const dist = R / Math.sin(limit / 2);
    camera.position.copy(VIEW_DIR.clone().multiplyScalar(dist));
    camera.lookAt(0, 0, 0);
    persp.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    focusRef.current = null;
  };

  // fit pada mount + tiap Reset (defer 1 frame agar OrbitControls siap)
  useEffect(() => {
    const raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (focusPos) {
      focusRef.current = focusPos.clone();
      // Jarak fokus proporsional radius planet → bola ter-frame enak (~28% layar)
      // meski di mode ilmiah radiusnya sangat kecil (near-plane kini 0.00001,
      // jadi aman mendekat sejauh ini). Bisa di-zoom lebih dekat lagi manual.
      focusDistRef.current = Math.min(40, Math.max(0.00005, focusRadius * 24));
    }
  }, [focusPos, focusRadius]);

  useFrame(() => {
    const target = focusRef.current;
    if (target && controlsRef.current) {
      const ctrl = controlsRef.current;
      const dist = focusDistRef.current;
      ctrl.target.lerp(target, 0.09);
      const desired = target.clone().add(VIEW_DIR.clone().multiplyScalar(dist));
      camera.position.lerp(desired, 0.09);
      ctrl.update();
      if (camera.position.distanceTo(desired) < Math.max(1e-6, dist * 0.05)) focusRef.current = null;
    }
  });

  return null;
}
