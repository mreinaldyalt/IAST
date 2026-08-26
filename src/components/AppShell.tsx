'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from './I18nProvider';
import { useState, useEffect, useCallback } from 'react';
import styles from './AppShell.module.css';

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

  /**
   * Sidebar memakai layout "push": lebar <aside> dan padding-kiri <main>
   * dianimasikan langsung, jadi <main> tidak pernah digeser dengan transform.
   *
   * Kenapa bukan transform: transform tidak mengubah UKURAN elemen. Versi lama
   * menggeser <main> ke kiri 200px sementara lebarnya masih ukuran lama, jadi
   * tepi kanannya mundur 1920→1720 dan menyisakan lubang 200px selama animasi,
   * lalu tertutup mendadak dalam satu frame (terlihat sebagai "kedip"). Dengan
   * menganimasikan ukuran aslinya, lebar <main> selalu = sisa ruang di sebelah
   * <aside>, sehingga tepi kanannya tidak pernah bergerak dan celah itu mustahil
   * muncul. Konsekuensinya animasi ini memicu layout tiap frame (bukan
   * compositor saja) — itu harga wajib untuk push tanpa celah.
   */
  const closeSidebar = useCallback(() => setOpen(false), []);
  const openSidebar = useCallback(() => setOpen(true), []);
  const toggleSidebar = useCallback(() => setOpen((o) => !o), []);

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
  const hasDedicatedBackdrop = pathname === '/astronomy-event' || pathname === '/parade-planet' || pathname === '/gerhana' || RAMADAN_HREFS.includes(pathname) || pathname === '/about' || pathname === '/';

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
        className={`flex-shrink-0 h-full z-40 ${open ? 'w-64' : 'w-0'} ${
          isMobile ? 'fixed left-0 top-0' : `relative ${styles.asideAnim}`
        }`}
      >
        <div
          className={`${styles.panel} h-full w-64 flex flex-col overflow-hidden transition-transform duration-200 ease-out transform-gpu will-change-transform [contain:paint] ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Header */}
          <div className={`${styles.header} flex items-center justify-between`}>
            <div className={styles.brandWrap}>
              <span className={styles.brandMark}>IAST</span>
              <span className={styles.brandText}><b>{t.siteName}</b><span>{locale === 'id' ? 'Sistem Riset Astronomi' : 'Astronomy Research System'}</span></span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={toggleLocale}
                className={styles.lang}
                title={locale === 'en' ? 'Switch to Bahasa Indonesia' : 'Switch to English'}
              >
                {t.langToggle}
              </button>
              <button
                onClick={toggleSidebar}
                className={styles.close}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className={`${styles.nav} flex-1 overflow-y-auto`}>
            <p className={styles.navLabel}>{locale === 'id' ? 'Navigasi Sistem' : 'System Navigation'}</p>
            <Link
              href="/"
              className={`${styles.item} ${
                pathname === '/'
                  ? styles.active
                  : ''
              }`}
            >
              <span className="w-4 text-center flex-shrink-0" aria-hidden="true">◫</span>
              <span>{t.dashboardMenu}</span>
            </Link>

            {/* 1 — Peristiwa Astronomi (grup collapsible: Kalender + Parade) */}
            <button
              onClick={() => setPeristiwaOpen((o) => !o)}
              className={`${styles.item} ${styles.groupButton} ${
                PERISTIWA_HREFS.includes(pathname) ? styles.active : ''
              }`}
              aria-expanded={peristiwaOpen}
            >
              <IconMoonStar />
              <span className="flex-1 text-left">{t.astronomyEventMenu}</span>
              <svg
                className={`${styles.chevron} w-4 h-4 flex-shrink-0 ${peristiwaOpen ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className={`${styles.childWrap} overflow-hidden transition-all duration-200 ${peristiwaOpen ? 'max-h-40' : 'max-h-0'}`}>
              {peristiwaChildren.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.item} ${styles.child} ${
                    pathname === item.href
                      ? styles.active
                      : ''
                  }`}
                >
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>

            {/* 2 — Ramadan (grup collapsible) */}
            <button
              onClick={() => setRamadanOpen((o) => !o)}
              className={`${styles.item} ${styles.groupButton} ${
                RAMADAN_HREFS.includes(pathname) ? styles.active : ''
              }`}
              aria-expanded={ramadanOpen}
            >
              <IconCrescent />
              <span className="flex-1 text-left">{t.ramadhanMenu}</span>
              <svg
                className={`${styles.chevron} w-4 h-4 flex-shrink-0 ${ramadanOpen ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div
              className={`${styles.childWrap} overflow-hidden transition-all duration-200 ${ramadanOpen ? 'max-h-60' : 'max-h-0'}`}
            >
              {ramadhanChildren.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.item} ${styles.child} ${
                    pathname === item.href
                      ? styles.active
                      : ''
                  }`}
                >
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>

            {/* 3 — Stellarium View */}
            <Link
              href="/stellarium"
              className={`${styles.item} ${
                pathname === '/stellarium'
                  ? styles.active
                  : ''
              }`}
            >
              <IconStars />
              <span>{t.menu2}</span>
            </Link>

            {/* 4 — Solar System */}
            <Link
              href="/solar-system"
              className={`${styles.item} ${
                pathname === '/solar-system'
                  ? styles.active
                  : ''
              }`}
            >
              <IconOrbit />
              <span>{t.ssMenu}</span>
            </Link>

            {/* 5 — Tentang */}
            <Link
              href="/about"
              className={`${styles.item} ${
                pathname === '/about'
                  ? styles.active
                  : ''
              }`}
            >
              <IconInfo />
              <span>{t.about}</span>
            </Link>
          </nav>

          {/* AGPL Notice */}
          <div className={styles.footer}>
            <b>IAST / LICENSE</b>
            <p>{t.agplNote}</p>
          </div>
        </div>

        {!open && !isMobile && (
          <div className={styles.collapsedRail}>
            <svg className={styles.railShape} viewBox="0 0 56 1000" preserveAspectRatio="none" aria-hidden="true">
              <path className={styles.railFill} d="M0 0H55V150C55 164 43 169 43 184V285C43 300 55 305 55 320V505C55 520 43 525 43 540V641C43 656 55 661 55 676V1000H0Z" />
              <path className={styles.railStroke} d="M55 0V150C55 164 43 169 43 184V285C43 300 55 305 55 320V505C55 520 43 525 43 540V641C43 656 55 661 55 676V1000" />
            </svg>
            <button type="button" onClick={openSidebar} className={styles.railToggle} aria-label={locale === 'id' ? 'Buka navigasi' : 'Open navigation'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className={styles.railBrand}>IAST</span>
            <div className={styles.railLabels} aria-hidden="true">
              <span>{locale === 'id' ? 'PERISTIWA' : 'EVENTS'}</span><i />
              <span>RAMADAN</span><i />
              <span>{locale === 'id' ? 'LANGIT' : 'SKY'}</span>
            </div>
            <small>KKCDEV</small>
          </div>
        )}
      </aside>

      {/* Hamburger (when sidebar closed) */}
      {!open && isMobile && (
        <button
          onClick={toggleSidebar}
          className={`${styles.hamburger} fixed top-3 left-3 z-50 p-2 transition`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Main content */}
      <main
        className={`flex-1 min-w-0 overflow-auto relative z-[1] ${
          !isMobile ? `${styles.mainPad} ${open ? '' : styles.mainUnderRail}` : ''
        } ${
          isFullBleed ? 'overflow-hidden' : ''
        }`}
      >
        {children}
      </main>
    </div>
  );
}
