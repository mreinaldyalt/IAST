'use client';

import { useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { PlanetVisual, PlanetId } from '@/lib/solar-system/types';

/**
 * Planet: group (posisi di-update per-frame oleh scene lewat registerRef) berisi
 * bola (ukuran mode-aware: overview=diperbesar, scientific=to-scale) + cincin
 * opsional + label teks.
 *
 * Yang diklik user = BOLA 3D-nya langsung (bukan pin/dot). Label teks juga bisa
 * diklik sebagai bantuan, khususnya di mode Ilmiah saat bola berukuran sub-pixel
 * (ukuran fisik dibiarkan 100% to-scale, tanpa marker yang membesarkannya).
 */
export default function Planet({
  visual, label, selected, sphereRadius, onHover, onSelect, registerRef,
}: {
  visual: PlanetVisual;
  label: string;
  selected: boolean;
  sphereRadius: number;
  onHover: (id: string | null) => void;
  onSelect: (id: PlanetId) => void;
  registerRef: (g: THREE.Group | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const active = hovered || selected;

  const over = () => { setHovered(true); onHover(visual.id); document.body.style.cursor = 'pointer'; };
  const out = () => { setHovered(false); onHover(null); document.body.style.cursor = 'auto'; };

  return (
    <group ref={registerRef}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); over(); }}
        onPointerOut={() => out()}
        onClick={(e) => { e.stopPropagation(); onSelect(visual.id); }}
      >
        <sphereGeometry args={[sphereRadius, 32, 32]} />
        <meshStandardMaterial
          color={visual.color}
          emissive={visual.emissive ?? '#000000'}
          emissiveIntensity={visual.emissive ? 0.45 : 0}
          roughness={0.75}
          metalness={0.15}
        />
      </mesh>

      {visual.hasRing && (
        <mesh rotation={[-Math.PI / 2 + 0.42, 0, 0]}>
          <ringGeometry args={[sphereRadius * 1.35, sphereRadius * 2.15, 64]} />
          <meshBasicMaterial color={visual.ringColor ?? '#c2ad86'} side={THREE.DoubleSide} transparent opacity={0.55} />
        </mesh>
      )}

      {active && (
        <mesh>
          <sphereGeometry args={[sphereRadius * 1.28, 24, 24]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.12} />
        </mesh>
      )}

      {/* Label teks (tanpa dot). Bisa diklik → memilih planet, terutama berguna
          di mode Ilmiah saat bola sub-pixel. Tidak mengubah ukuran fisik bola. */}
      <Html center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
        <button
          onPointerOver={over}
          onPointerOut={out}
          onClick={() => onSelect(visual.id)}
          style={{
            pointerEvents: 'auto',
            background: 'transparent',
            border: 'none',
            padding: '2px 4px',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            color: '#e8eefc',
            textShadow: '0 1px 3px rgba(0,0,0,.95)',
            whiteSpace: 'nowrap',
            opacity: active ? 1 : 0.72,
            transition: 'opacity .15s',
            transform: 'translateY(-14px)',
          }}
          title={label}
        >{label}</button>
      </Html>
    </group>
  );
}
