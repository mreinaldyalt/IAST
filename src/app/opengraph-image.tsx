import { ImageResponse } from 'next/og';
import { AUTHOR_NAME, SITE_NAME, SITE_SHORT } from '@/lib/seo';

export const alt = `${SITE_NAME} [${SITE_SHORT}] — Platform Riset Astronomi Internasional`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          color: '#f2fbfb',
          background: 'linear-gradient(135deg, #05090c 0%, #0b1f26 60%, #123238 100%)',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, letterSpacing: 10, color: '#7fd7dc' }}>
          KOMPUTASI · EPHEMERIS · VISUALISASI
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>{SITE_NAME}</div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: '#7fd7dc', marginTop: 8 }}>
            [{SITE_SHORT}]
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: '#a9c4c7', marginTop: 28 }}>
            Hisab awal Ramadan · NASA JPL Horizons · Newton-Raphson
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#8aa3a6' }}>{AUTHOR_NAME}</div>
      </div>
    ),
    { ...size },
  );
}
