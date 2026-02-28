'use client';

import { useI18n } from './I18nProvider';

export default function Footer() {
  const { t } = useI18n();

  return (
    <footer className="bg-gray-900 text-gray-400 py-4 mt-auto">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <p className="text-xs opacity-70">{t.watermark1}</p>
        <p className="text-xs opacity-70">{t.watermark2}</p>
      </div>
    </footer>
  );
}
