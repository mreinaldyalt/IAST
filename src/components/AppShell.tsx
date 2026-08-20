'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from './I18nProvider';
import { useState, useEffect, useCallback, useRef } from 'react';

const SIDEBAR_KEY = 'sidebar-open';
const RAMADAN_HREFS = ['/prediksi-ramadan', '/evaluasi-konjungsi', '/evaluasi'];
const PERISTIWA_HREFS = ['/astronomy-event', '/parade-planet', '/gerhana'];

/* ── Small inline icons (16px) ──────────────────────────────── */
const IconCrescent = () => (
  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
);
const IconMoonStar = () => (
  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M20 14a7 7 0 11-9-8.7A6 6 0 0020 14z" /></svg>
);
const IconStars = () => (
  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.3 4L17 7l-3.7 1L12 12l-1.3-4L7 7l3.7-1L12 2zM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13zM18 13l.8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13z" /></svg>
);
const IconInfo = () => (
  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 11v5M12 8h.01" /></svg>
);
const IconOrbit = () => (
  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /><ellipse cx="12" cy="12" rx="10" ry="4.5" /></svg>
);

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
  const [sidebarSpaceReserved, setSidebarSpaceReserved] = useState(open);
  const [desktopMotion, setDesktopMotion] = useState<'idle' | 'preparing' | 'opening' | 'closing'>('idle');
  const [isMobile, setIsMobile] = useState(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFrameRef = useRef<number | null>(null);
  const secondOpenFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(open));
  }, [open]);

  const closeSidebar = useCallback(() => {
    if (openFrameRef.current !== null) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    if (collapseTimerRef.current !== null) clearTimeout(collapseTimerRef.current);
    if (secondOpenFrameRef.current !== null) {
      cancelAnimationFrame(secondOpenFrameRef.current);
      secondOpenFrameRef.current = null;
    }
    setOpen(false);
    if (isMobile) {
      setSidebarSpaceReserved(false);
      setDesktopMotion('idle');
      return;
    }
    // FLIP: konten bergeser ke kiri bersamaan dengan sidebar. Saat ruang flex
    // dilepas, transform dinolkan tanpa mengubah posisi visualnya.
    setDesktopMotion('closing');
    collapseTimerRef.current = setTimeout(() => {
      setSidebarSpaceReserved(false);
      setDesktopMotion('idle');
      collapseTimerRef.current = null;
    }, 200);
  }, [isMobile]);

  const openSidebar = useCallback(() => {
    if (collapseTimerRef.current !== null) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    if (isMobile) {
      setSidebarSpaceReserved(false);
      setOpen(true);
      return;
    }
    // Sisakan ruang sambil mengompensasi posisi konten, kemudian animasikan
    // sidebar dan konten pada compositor yang sama.
    setSidebarSpaceReserved(true);
    setDesktopMotion('preparing');
    openFrameRef.current = requestAnimationFrame(() => {
      secondOpenFrameRef.current = requestAnimationFrame(() => {
        setOpen(true);
        setDesktopMotion('opening');
        openFrameRef.current = null;
        secondOpenFrameRef.current = null;
        collapseTimerRef.current = setTimeout(() => {
          setDesktopMotion('idle');
          collapseTimerRef.current = null;
        }, 200);
      });
    });
  }, [isMobile]);

  const toggleSidebar = useCallback(() => {
    if (open) closeSidebar();
    else openSidebar();
  }, [open, closeSidebar, openSidebar]);

  useEffect(() => () => {
    if (collapseTimerRef.current !== null) clearTimeout(collapseTimerRef.current);
    if (openFrameRef.current !== null) cancelAnimationFrame(openFrameRef.current);
    if (secondOpenFrameRef.current !== null) cancelAnimationFrame(secondOpenFrameRef.current);
  }, []);

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) closeSidebar();
  }, [pathname, isMobile, closeSidebar]);

  // Ramadan group accordion — open when a child route is active
  const [ramadanOpen, setRamadanOpen] = useState(() => RAMADAN_HREFS.includes(pathname));
  useEffect(() => {
    if (RAMADAN_HREFS.includes(pathname)) setRamadanOpen(true);
  }, [pathname]);

  // Peristiwa Astronomi group accordion
  const [peristiwaOpen, setPeristiwaOpen] = useState(() => PERISTIWA_HREFS.includes(pathname));
  useEffect(() => {
    if (PERISTIWA_HREFS.includes(pathname)) setPeristiwaOpen(true);
  }, [pathname]);

  const isFullBleed = pathname === '/stellarium' || pathname === '/solar-system';
  const hasDedicatedBackdrop = pathname === '/astronomy-event' || pathname === '/parade-planet' || pathname === '/gerhana' || pathname === '/';

  const ramadhanChildren = [
    { href: '/prediksi-ramadan', label: t.menu1 },
    { href: '/evaluasi-konjungsi', label: t.conjEvalMenu },
    { href: '/evaluasi', label: t.evaluation },
  ];

  const peristiwaChildren = [
    { href: '/astronomy-event', label: t.astronomyCalendarMenu },
    { href: '/parade-planet', label: t.paradeMenu },
    { href: '/gerhana', label: t.eclipseMenu },
  ];

  return (
    <div className="fixed inset-0 flex cosmic-bg text-slate-100 overflow-hidden">
      {/* Starfield background layer */}
      {!hasDedicatedBackdrop && <div className="starfield" />}
      {/* Mobile backdrop */}
      {open && isMobile && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`flex-shrink-0 h-full z-40 ${
          sidebarSpaceReserved ? 'w-64' : 'w-0'
        } ${isMobile ? 'fixed left-0 top-0' : 'relative'}`}
      >
        <div
          className={`h-full w-64 bg-[#0b1026]/[0.98] border-r border-white/[0.08] flex flex-col overflow-hidden transition-transform duration-200 ease-out transform-gpu will-change-transform [contain:paint] ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-gradient-to-r from-indigo-950/60 to-purple-950/40">
            <span className="text-sm font-bold tracking-tight truncate">
              {t.siteName}
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
            <Link
              href="/"
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                pathname === '/'
                  ? 'bg-indigo-600/30 text-indigo-200 border-r-2 border-indigo-400'
                  : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <span className="w-4 text-center flex-shrink-0" aria-hidden="true">◫</span>
              <span>{t.dashboardMenu}</span>
            </Link>

            {/* 1 — Peristiwa Astronomi (grup collapsible: Kalender + Parade) */}
            <button
              onClick={() => setPeristiwaOpen((o) => !o)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                PERISTIWA_HREFS.includes(pathname) ? 'text-indigo-200' : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
              }`}
              aria-expanded={peristiwaOpen}
            >
              <IconMoonStar />
              <span className="flex-1 text-left">{t.astronomyEventMenu}</span>
              <svg
                className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${peristiwaOpen ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className={`overflow-hidden transition-all duration-200 ${peristiwaOpen ? 'max-h-40' : 'max-h-0'}`}>
              {peristiwaChildren.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 pl-11 pr-4 py-2 text-sm transition-colors ${
                    pathname === item.href
                      ? 'bg-indigo-600/30 text-indigo-200 border-r-2 border-indigo-400'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>

            {/* 2 — Ramadan (grup collapsible) */}
            <button
              onClick={() => setRamadanOpen((o) => !o)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                RAMADAN_HREFS.includes(pathname) ? 'text-indigo-200' : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
              }`}
              aria-expanded={ramadanOpen}
            >
              <IconCrescent />
              <span className="flex-1 text-left">{t.ramadhanMenu}</span>
              <svg
                className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${ramadanOpen ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${ramadanOpen ? 'max-h-60' : 'max-h-0'}`}
            >
              {ramadhanChildren.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 pl-11 pr-4 py-2 text-sm transition-colors ${
                    pathname === item.href
                      ? 'bg-indigo-600/30 text-indigo-200 border-r-2 border-indigo-400'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>

            {/* 3 — Stellarium View */}
            <Link
              href="/stellarium"
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                pathname === '/stellarium'
                  ? 'bg-indigo-600/30 text-indigo-200 border-r-2 border-indigo-400'
                  : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <IconStars />
              <span>{t.menu2}</span>
            </Link>

            {/* 4 — Solar System */}
            <Link
              href="/solar-system"
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                pathname === '/solar-system'
                  ? 'bg-indigo-600/30 text-indigo-200 border-r-2 border-indigo-400'
                  : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <IconOrbit />
              <span>{t.ssMenu}</span>
            </Link>

            {/* 5 — Tentang */}
            <Link
              href="/about"
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                pathname === '/about'
                  ? 'bg-indigo-600/30 text-indigo-200 border-r-2 border-indigo-400'
                  : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <IconInfo />
              <span>{t.about}</span>
            </Link>
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
          className="fixed top-3 left-3 z-50 p-2 bg-[#0b1026]/80 hover:bg-[#0b1026] rounded-lg text-white transition backdrop-blur-xl border border-white/[0.08]"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Main content */}
      <main
        className={`flex-1 min-w-0 overflow-auto relative z-[1] ${
          !isMobile && desktopMotion === 'closing' ? 'transition-transform duration-200 ease-out transform-gpu -translate-x-64' : ''
        } ${
          !isMobile && desktopMotion === 'preparing' ? '-translate-x-64' : ''
        } ${
          !isMobile && desktopMotion === 'opening' ? 'transition-transform duration-200 ease-out transform-gpu translate-x-0' : ''
        } ${
          isFullBleed ? 'p-0 overflow-hidden' : ''
        }`}
      >
        {children}
      </main>
    </div>
  );
}
