'use client';

import { useI18n } from '@/components/I18nProvider';

export default function AboutPage() {
  const { t } = useI18n();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-blue-300 bg-clip-text text-transparent mb-6">ℹ️ {t.aboutTitle}</h1>

      <div className="glass-card p-6 mb-6">
        <p className="text-slate-300 leading-relaxed mb-6">{t.aboutText}</p>

        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-yellow-300 mb-2">AGPL License Notice</h3>
          <p className="text-yellow-200/80 text-sm">{t.agplNote}</p>
        </div>

        <div className="space-y-4">
          <Section title="Methodology">
            <ul className="list-disc list-inside text-slate-400 space-y-1 text-sm">
              <li>Muhammadiyah Wujudul Hilal criterion (conjunction before sunset + Moon altitude {'>'} 0°)</li>
              <li>Conjunction computed via Newton–Raphson on ecliptic longitude difference (ObsEcLon)</li>
              <li>Central difference derivative with δ=60s</li>
              <li>Convergence: |f| {'<'} 1e-6° AND |step| {'<'} 0.2s</li>
              <li>Bisection validation when bracket available</li>
              <li>Scan step: 6 hours</li>
            </ul>
          </Section>

          <Section title="Data Source">
            <ul className="list-disc list-inside text-slate-400 space-y-1 text-sm">
              <li>NASA/JPL HORIZONS API (https://ssd.jpl.nasa.gov/api/horizons.api)</li>
              <li>Sun: COMMAND=&apos;10&apos;, Moon: COMMAND=&apos;301&apos;</li>
              <li>Geocentric ecliptic longitude (QUANTITIES=&apos;31&apos;) for conjunction</li>
              <li>Topocentric AZ/EL (QUANTITIES=&apos;4&apos;) for sunset check</li>
            </ul>
          </Section>

          <Section title="Technology Stack">
            <ul className="list-disc list-inside text-slate-400 space-y-1 text-sm">
              <li>Next.js (App Router) + TypeScript</li>
              <li>TailwindCSS</li>
              <li>pnpm</li>
              <li>luxon (datetime), suncalc (sunset), tz-lookup (timezone)</li>
              <li>Stellarium Web Engine (AGPL) for sky visualization</li>
              <li>vitest for testing</li>
            </ul>
          </Section>

          <Section title="Credits">
            <div className="text-slate-400 text-sm">
              <p className="font-semibold text-slate-200">Skripsi S1 Muhammad Reinaldy Santoso Alaratte</p>
              <p className="font-semibold text-slate-200">KKC DEV</p>
              <p className="mt-2">
                &quot;Komputasi hisab menentukan awal Ramadan berdasarkan data ephemeris NASA/JPL HORIZONS
                menggunakan Algoritma Newton–Raphson&quot;
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-bold text-slate-200 mb-2">{title}</h3>
      {children}
    </section>
  );
}
