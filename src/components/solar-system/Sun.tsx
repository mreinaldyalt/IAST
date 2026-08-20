'use client';

import { useState } from 'react';
import { Html } from '@react-three/drei';

/**
 * Matahari di pusat. Mode-aware:
 *  - overview  : bola diperbesar + korona bercahaya.
 *  - scientific: bola to-scale (sangat kecil). Agar tetap TERLIHAT & bisa diklik,
 *    diberi batas-minimum ukuran layar (di-scale mengikuti jarak kamera); saat
 *    di-zoom cukup dekat, ukuran aslinya yang muncul. Tidak ada dot/marker datar.
 */
export default function Sun({
  label, radius, mode, selected, onSelect, onHover,
}: {
  label: string;
  radius: number;
  mode: 'overview' | 'scientific';
  selected: boolean;
  onSelect: () => void;
  onHover: (h: boolean) => void;
}) {
  const showGlow = mode === 'overview';
  const [hovered, setHovered] = useState(false);
  const active = hovered || selected;

  const over = () => { setHovered(true); onHover(true); document.body.style.cursor = 'pointer'; };
  const out = () => { setHovered(false); onHover(false); document.body.style.cursor = 'auto'; };

  return (
    <group>
      <pointLight position={[0, 0, 0]} intensity={2.5} distance={0} decay={0} color="#fff4d6" />
      <ambientLight intensity={0.3} />

      <group>
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); over(); }}
          onPointerOut={() => out()}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <sphereGeometry args={[radius, 48, 48]} />
          <meshBasicMaterial color="#ffd24a" />
        </mesh>

        {active && (
          <mesh>
            <sphereGeometry args={[radius * 1.3, 24, 24]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.14} />
          </mesh>
        )}

        {showGlow && (
          <>
            <mesh>
              <sphereGeometry args={[radius * 1.5, 32, 32]} />
              <meshBasicMaterial color="#ffb020" transparent opacity={0.16} />
            </mesh>
            <mesh>
              <sphereGeometry args={[radius * 2.1, 32, 32]} />
              <meshBasicMaterial color="#ff9500" transparent opacity={0.07} />
            </mesh>
          </>
        )}
      </group>

      {/* label teks (tanpa dot), bisa diklik */}
      <Html center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <button
          onPointerOver={over}
          onPointerOut={out}
          onClick={onSelect}
          style={{
            pointerEvents: 'auto', background: 'transparent', border: 'none',
            padding: '2px 4px', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, color: '#ffe58a',
            textShadow: '0 1px 4px rgba(0,0,0,.9)', whiteSpace: 'nowrap',
            opacity: active ? 1 : 0.85, transition: 'opacity .15s',
            transform: 'translateY(-16px)',
          }}
          title={label}
        >{label}</button>
      </Html>
    </group>
  );
}
