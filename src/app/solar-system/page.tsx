'use client';

import dynamic from 'next/dynamic';
import { useI18n } from '@/components/I18nProvider';

function Loader() {
  const { t } = useI18n();
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-[#05070f] text-slate-400">
      <div className="w-10 h-10 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin mb-3" />
      <p className="text-sm">{t.ssLoading}</p>
    </div>
  );
}

// Three.js hanya boleh jalan di client → ssr:false
const SolarSystemView = dynamic(
  () => import('@/components/solar-system/SolarSystemView'),
  { ssr: false, loading: () => <Loader /> },
);

export default function SolarSystemPage() {
  return (
    <div className="h-full w-full">
      <SolarSystemView />
    </div>
  );
}
