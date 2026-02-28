'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from './I18nProvider';
import { useState, useEffect, useCallback } from 'react';

const SIDEBAR_KEY = 'sidebar-open';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { t, locale, toggleLocale } = useI18n();
  const pathname = usePathname();

  // Persist sidebar state in localStorage
  const [open, setOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_KEY);
      if (saved !== null) return saved === 'true';
    }
    return true;
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(open));
  }, [open]);

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) setOpen(false);
  }, [pathname, isMobile]);

  const toggleSidebar = useCallback(() => setOpen((p) => !p), []);

  const isStellarium = pathname === '/stellarium';

  const navItems = [
    { href: '/', label: t.menu1, icon: '🌙' },
    { href: '/stellarium', label: t.menu2, icon: '🔭' },
    { href: '/evaluasi', label: t.evaluation, icon: '📊' },
    { href: '/about', label: t.about, icon: 'ℹ️' },
  ];

  return (
    <div className="fixed inset-0 flex bg-[#0d1117] text-slate-100 overflow-hidden">
      {/* Mobile backdrop */}
      {open && isMobile && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`flex-shrink-0 h-full z-40 transition-all duration-300 ${
          open ? 'w-64' : 'w-0'
        } ${isStellarium || isMobile ? 'absolute left-0 top-0' : 'relative'}`}
      >
        <div
          className={`h-full w-64 bg-[#161b22]/95 backdrop-blur-md border-r border-white/10 flex flex-col overflow-hidden transition-transform duration-300 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-indigo-900/40 to-purple-900/30">
            <span className="text-sm font-bold tracking-tight truncate">
              🌙 {t.siteName}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={toggleLocale}
                className="px-2 py-0.5 bg-white/15 hover:bg-white/25 rounded text-xs font-bold transition"
                title={locale === 'en' ? 'Switch to Bahasa Indonesia' : 'Switch to English'}
              >
                {t.langToggle}
              </button>
              <button
                onClick={toggleSidebar}
                className="p-1 hover:bg-white/15 rounded transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  pathname === item.href
                    ? 'bg-indigo-600/30 text-indigo-200 border-r-2 border-indigo-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* AGPL Notice */}
          <div className="px-4 py-3 border-t border-white/5">
            <p className="text-[9px] text-white/20 leading-relaxed">{t.agplNote}</p>
          </div>
        </div>
      </aside>

      {/* Hamburger (when sidebar closed) */}
      {!open && (
        <button
          onClick={toggleSidebar}
          className="fixed top-3 left-3 z-50 p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition backdrop-blur-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Main content */}
      <main
        className={`flex-1 overflow-auto relative ${
          isStellarium ? 'p-0' : 'p-0 md:pl-0'
        }`}
      >
        {children}
      </main>

      {/* Watermark overlay (bottom-right, always visible) */}
      <div className="fixed bottom-3 right-3 z-50 text-right pointer-events-none">
        <p className="text-[9px] text-white/20">{t.watermark1}</p>
        <p className="text-[9px] text-white/20">{t.watermark2}</p>
      </div>
    </div>
  );
}
