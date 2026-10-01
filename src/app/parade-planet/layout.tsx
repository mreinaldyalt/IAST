import { routeMetadata } from '@/lib/seo';

export const metadata = routeMetadata({
  path: '/parade-planet',
  title: "Parade Planet",
  description:
    "Menghitung kapan dan dari mana beberapa planet tampak berjajar di langit, berbasis data NASA JPL Horizons dan kriteria visibilitas operasional.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
