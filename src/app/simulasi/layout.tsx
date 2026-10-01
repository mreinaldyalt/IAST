import { routeMetadata } from '@/lib/seo';

export const metadata = routeMetadata({
  path: '/simulasi',
  title: "Simulasi Lintasan Planet",
  description:
    "Simulasi interaktif lintasan Matahari dan planet-planet yang dapat dipercepat, diputar, dan dijelajahi.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
