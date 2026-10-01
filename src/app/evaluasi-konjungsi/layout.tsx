import { routeMetadata } from '@/lib/seo';

export const metadata = routeMetadata({
  path: '/evaluasi-konjungsi',
  title: "Evaluasi Konjungsi Periode",
  description:
    "Evaluasi konjungsi (ijtimak) Bulan–Matahari per periode: jejak perhitungan Newton-Raphson, iterasi, dan klasifikasi kandidat yang dapat diaudit dan diunduh.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
