'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from './I18nProvider';

export default function Navbar() {
  const { t, locale, toggleLocale } = useI18n();
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: t.dashboardMenu },
    { href: '/prediksi-ramadan', label: t.menu1 },
    { href: '/stellarium', label: t.menu2 },
    { href: '/evaluasi', label: t.evaluation },
    { href: '/about', label: t.about },
  ];

  return (
    <nav className="bg-gradient-to-r from-emerald-800 to-teal-700 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold tracking-tight">{t.siteName}</span>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-white/20 text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <button
              onClick={toggleLocale}
              className="ml-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-sm font-bold transition-colors"
              title={locale === 'en' ? 'Switch to Bahasa Indonesia' : 'Switch to English'}
            >
              {t.langToggle}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
