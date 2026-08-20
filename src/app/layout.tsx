import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/components/I18nProvider';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'International Astronomical Studies [IAST]',
  description:
    'Komputasi hisab menentukan awal Ramadan berdasarkan data ephemeris NASA/JPL HORIZONS menggunakan Algoritma Newton–Raphson',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen cosmic-bg text-slate-100 antialiased">
        <I18nProvider>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
