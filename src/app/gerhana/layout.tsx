import { routeMetadata } from '@/lib/seo';

export const metadata = routeMetadata({
  path: '/gerhana',
  title: "Gerhana Matahari dan Bulan",
  description:
    "Laboratorium gerhana Matahari dan Bulan: waktu kontak, durasi, dan visibilitas dari lokasi pengamat, dihitung dari data ephemeris.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
