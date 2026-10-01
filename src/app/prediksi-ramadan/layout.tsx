import { routeMetadata } from '@/lib/seo';

export const metadata = routeMetadata({
  path: '/prediksi-ramadan',
  title: "Prediksi Awal Ramadan",
  description:
    "Prediksi awal Ramadan berbasis komputasi hisab: konjungsi Bulan–Matahari dari data ephemeris NASA JPL Horizons, dihitung dengan algoritma Newton-Raphson, lengkap dengan kriteria wujudul hilal dan KHGT.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
