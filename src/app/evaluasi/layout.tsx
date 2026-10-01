import { routeMetadata } from '@/lib/seo';

export const metadata = routeMetadata({
  path: '/evaluasi',
  title: "Evaluasi Riwayat Global dan Lokal",
  description:
    "Perbandingan hasil prediksi awal Ramadan dengan riwayat penetapan resmi global dan lokal untuk menguji akurasi metode hisab.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
