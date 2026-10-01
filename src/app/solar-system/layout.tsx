import { routeMetadata } from '@/lib/seo';

export const metadata = routeMetadata({
  path: '/solar-system',
  title: "Tata Surya 3D",
  description:
    "Visualisasi 3D posisi planet Tata Surya dengan kendali waktu: skala ikhtisar dan skala ilmiah.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
