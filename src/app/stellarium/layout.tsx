import { routeMetadata } from '@/lib/seo';

export const metadata = routeMetadata({
  path: '/stellarium',
  title: "Stellarium View — Peta Langit Interaktif",
  description:
    "Peta langit interaktif berbasis Stellarium Web Engine: bintang, rasi, planet model 3D, posisi Matahari dan Bulan secara waktu nyata dari lokasi Anda.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
