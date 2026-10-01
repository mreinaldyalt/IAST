import { routeMetadata } from '@/lib/seo';

export const metadata = routeMetadata({
  path: '/astronomy-event',
  title: "Kalender Peristiwa Astronomi",
  description:
    "Kalender peristiwa astronomi hasil komputasi sistem: gerhana, awal Ramadan, parade planet, dan peristiwa langit lain, otomatis tertandai per tahun.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
