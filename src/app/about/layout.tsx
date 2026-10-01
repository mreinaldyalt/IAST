import { routeMetadata } from '@/lib/seo';

export const metadata = routeMetadata({
  path: '/about',
  title: "Muhammad Reinaldy Santoso Alaratte — Pengembang IAST",
  description:
    "Tentang International Astronomical Studies (IAST): metode, teknologi, dan pengembangnya, Muhammad Reinaldy Santoso Alaratte, proyek Skripsi S1 Data Sains tentang komputasi hisab awal Ramadan.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
