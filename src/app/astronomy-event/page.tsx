'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import styles from './page.module.css';
import {
  getAllEvents,
  buildEventMap,
  type AstronomyEvent,
  type AstronomyEventType,
} from '@/lib/astronomyEvents';

/* ─── Visual identity per event type ─────────────────────────── */
type TypeStyle = {
  dot: string;        // solid marker color
  glow: string;       // rgba for glow shadow
  icon: React.ReactNode;
};

function moonNew(cls: string) {
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="none">
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.25" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function moonCrescent(cls: string) {
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function sparkle(cls: string) {
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
      <path d="M12 2l1.8 5.6L19.5 9l-4.8 3 1.7 5.7L12 14.9 7.6 17.7 9.3 12 4.5 9l5.7-1.4L12 2z" />
    </svg>
  );
}
function planetsRow(cls: string) {
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
      <circle cx="4" cy="12" r="1.5" /><circle cx="9" cy="12" r="2.4" /><circle cx="15.5" cy="12" r="3" /><circle cx="21" cy="12" r="1.2" />
    </svg>
  );
}
function eclipseDisc(cls: string) {
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="none">
      <circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.28" />
      <circle cx="9.5" cy="10.5" r="7" fill="#0b1026" />
      <path d="M15.8 5.7a8 8 0 0 1 1.8 9.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const STYLES: Record<AstronomyEventType, TypeStyle> = {
  conjunction: {
    dot: '#f5b642',
    glow: 'rgba(245,182,66,0.55)',
    icon: moonNew('w-full h-full text-amber-300'),
  },
  ramadan: {
    dot: '#34d399',
    glow: 'rgba(52,211,153,0.55)',
    icon: moonCrescent('w-full h-full text-emerald-300'),
  },
  syawal: {
    dot: '#c084fc',
    glow: 'rgba(192,132,252,0.55)',
    icon: sparkle('w-full h-full text-fuchsia-300'),
  },
  parade: {
    dot: '#38bdf8',
    glow: 'rgba(56,189,248,0.55)',
    icon: planetsRow('w-full h-full text-sky-300'),
  },
  eclipse: {
    dot: '#fb7185',
    glow: 'rgba(251,113,133,0.58)',
    icon: eclipseDisc('w-full h-full text-rose-300'),
  },
};

/* ─── Date helpers (local, no TZ shift) ──────────────────────── */
const pad2 = (n: number) => String(n).padStart(2, '0');
const toKey = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
function parseKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function AstronomyEventPage() {
  const { t, locale } = useI18n();
  const loc = locale === 'id' ? 'id-ID' : 'en-US';

  const initialEvents = useMemo(() => getAllEvents().filter((event) => event.type !== 'conjunction'), []);
  const initialMap = useMemo(() => buildEventMap(initialEvents), [initialEvents]);

  // Default landing and detail panel: the user's current local date.
  const now = new Date();
  const todayKey = toKey(now.getFullYear(), now.getMonth(), now.getDate());

  const [events, setEvents] = useState<AstronomyEvent[]>(initialEvents);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [focusedId, setFocusedId] = useState<string | null>(() => initialMap.get(todayKey)?.[0]?.id ?? null);
  const [loadingYear, setLoadingYear] = useState<number | null>(null);
  const [yearWarnings, setYearWarnings] = useState<string[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const eventMap = useMemo(() => buildEventMap(events), [events]);

  // Re-sync after hydration so "today" always follows the visitor's device timezone.
  useEffect(() => {
    const localNow = new Date();
    const localKey = toKey(localNow.getFullYear(), localNow.getMonth(), localNow.getDate());
    setViewYear(localNow.getFullYear());
    setViewMonth(localNow.getMonth());
    setSelectedDate(localKey);
    setFocusedId(initialMap.get(localKey)?.[0]?.id ?? null);
  }, [initialMap]);

  useEffect(() => {
    if (viewYear < 1972 || viewYear > 2100) return;
    const controller = new AbortController();
    setLoadingYear(viewYear);
    setYearWarnings([]);
    const categoryTypes: Record<string, AstronomyEventType[]> = {
      ramadan: ['ramadan', 'syawal'], eclipse: ['eclipse'], parade: ['parade'],
    };
    void (async () => {
      const unresolved: string[] = [];
      for (const category of ['ramadan', 'eclipse', 'parade'] as const) {
        try {
          const response = await fetch(`/api/astronomy-events?year=${viewYear}&category=${category}`, { signal: controller.signal });
          if (!response.ok) throw new Error('calendar-year-load-failed');
          const data = await response.json() as { events: AstronomyEvent[]; warnings: string[] };
          if (controller.signal.aborted) return;
          const relevantTypes = new Set(categoryTypes[category]);
          const hasUsableData = data.events.some((event) => relevantTypes.has(event.type));
          if ((data.warnings ?? []).length > 0 && !hasUsableData) unresolved.push(category);
          setEvents((current) => {
            const preserved = current.filter((event) => event.gregorianYear !== viewYear || !relevantTypes.has(event.type));
            return [...preserved, ...data.events]
              .filter((event, index, list) => list.findIndex((candidate) => candidate.id === event.id) === index)
              .sort((a, b) => a.date.localeCompare(b.date));
          });
          setYearWarnings([...unresolved]);
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
          unresolved.push(category);
          setYearWarnings([...unresolved]);
        }
      }
      setLoadingYear((current) => current === viewYear ? null : current);
    })();
    return () => controller.abort();
  }, [viewYear, reloadToken]);

  const typeLabel = (ty: AstronomyEventType) =>
    ty === 'conjunction' ? t.aeTypeConjunction : ty === 'ramadan' ? t.aeTypeRamadan
      : ty === 'syawal' ? t.aeTypeSyawal : ty === 'parade' ? t.aeTypeParade : t.aeTypeEclipse;
  const typeDesc = (ty: AstronomyEventType) =>
    ty === 'conjunction' ? t.aeDescConjunction : ty === 'ramadan' ? t.aeDescRamadan
      : ty === 'syawal' ? t.aeDescSyawal : ty === 'parade' ? t.aeDescParade : t.aeDescEclipse;
  const eventTitle = (event: AstronomyEvent) => {
    if (event.type === 'parade') {
      const count = event.label?.match(/Parade\s+(\d+)\s+Planet/i)?.[1] ?? '4';
      return locale === 'id' ? `Parade ${count} Planet` : `${count}-Planet Parade`;
    }
    if (event.type === 'eclipse') {
      const labels: Record<string, { id: string; en: string }> = {
        'eclipse-solar-2026-02-17': { id: 'Gerhana Matahari Cincin', en: 'Annular Solar Eclipse' },
        'eclipse-lunar-2026-03-03': { id: 'Gerhana Bulan Total', en: 'Total Lunar Eclipse' },
        'eclipse-solar-2026-08-12': { id: 'Gerhana Matahari Total', en: 'Total Solar Eclipse' },
        'eclipse-lunar-2026-08-28': { id: 'Gerhana Bulan Sebagian', en: 'Partial Lunar Eclipse' },
      };
      if (labels[event.id]) return labels[event.id][locale];
      const id = event.id;
      if (id.includes('solar-total')) return locale === 'id' ? 'Gerhana Matahari Total' : 'Total Solar Eclipse';
      if (id.includes('solar-annular')) return locale === 'id' ? 'Gerhana Matahari Cincin' : 'Annular Solar Eclipse';
      if (id.includes('solar-hybrid')) return locale === 'id' ? 'Gerhana Matahari Hibrida' : 'Hybrid Solar Eclipse';
      if (id.includes('solar-partial')) return locale === 'id' ? 'Gerhana Matahari Sebagian' : 'Partial Solar Eclipse';
      if (id.includes('lunar-total')) return locale === 'id' ? 'Gerhana Bulan Total' : 'Total Lunar Eclipse';
      if (id.includes('lunar-partial')) return locale === 'id' ? 'Gerhana Bulan Sebagian' : 'Partial Lunar Eclipse';
      if (id.includes('lunar-penumbral')) return locale === 'id' ? 'Gerhana Bulan Penumbra' : 'Penumbral Lunar Eclipse';
      return typeLabel(event.type);
    }
    return typeLabel(event.type);
  };

  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(new Date(2023, 0, 1 + i))),
    [loc],
  );
  const monthTitle = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' })
    .format(new Date(viewYear, viewMonth, 1));
  const fmtFull = (dateStr: string) =>
    new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      .format(parseKey(dateStr));

  // Build calendar grid
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthHasEvents = cells.some(
    (d) => d !== null && eventMap.has(toKey(viewYear, viewMonth, d)),
  );

  const goMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goToday = () => {
    const now = new Date();
    const key = toKey(now.getFullYear(), now.getMonth(), now.getDate());
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(key);
    setFocusedId(eventMap.get(key)?.[0]?.id ?? null);
  };
  const jumpToEvent = (e: AstronomyEvent) => {
    const d = parseKey(e.date);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(e.date);
    setFocusedId(e.id);
  };

  const selectedDayEvents = eventMap.get(selectedDate) ?? [];
  const yearEvents = events.filter((event) => event.gregorianYear === viewYear)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.gridOverlay} aria-hidden="true" />
      <header className={styles.topbar}>
        <div className={styles.brand}>IAST <span>/ {locale === 'id' ? 'KALENDER PERISTIWA' : 'EVENT CALENDAR'}</span></div>
        <div className={styles.status}><i /> {locale === 'id' ? 'KATALOG AKTIF' : 'CATALOG ACTIVE'}</div>
      </header>
      <main className={styles.content}>
      {/* Header */}
      <header className={styles.heroHeader}>
        <p className={styles.eyebrow}>{locale === 'id' ? 'ARSIP PERISTIWA LANGIT' : 'CELESTIAL EVENT ARCHIVE'} · 01</p>
        <h1>
          {t.aeTitle}
        </h1>
        <p className={styles.subtitle}>{t.aeSubtitle}</p>
        <div className={styles.yearPicker}>
          <label htmlFor="calendar-year">{locale === 'id' ? 'Pilih tahun pengamatan' : 'Select observation year'}</label>
          <input
            id="calendar-year"
            type="number"
            min="1972"
            max="2100"
            value={viewYear}
            onChange={(event) => {
              const year = Number(event.target.value);
              if (year >= 1972 && year <= 2100) setViewYear(year);
            }}
          />
          <span>{loadingYear === viewYear
            ? (locale === 'id' ? 'Menghitung peristiwa NASA…' : 'Computing NASA events…')
            : (locale === 'id' ? 'NASA/JPL Horizons · 1972–2100' : 'NASA/JPL Horizons · 1972–2100')}</span>
        </div>
      </header>

      <div className={styles.workspace}>
        {/* ─── Calendar ─────────────────────────────────── */}
        <section className={styles.calendarPanel}>
          {/* Month nav */}
          <div className={styles.monthNav}>
            <button
              onClick={() => goMonth(-1)}
              aria-label={locale === 'id' ? 'Bulan sebelumnya' : 'Previous month'}
            >
              ‹
            </button>
            <div>
              <h2>{monthTitle}</h2>
              <button onClick={goToday} className={styles.todayButton}>
                {t.aeToday}
              </button>
            </div>
            <button
              onClick={() => goMonth(1)}
              aria-label={locale === 'id' ? 'Bulan berikutnya' : 'Next month'}
            >
              ›
            </button>
          </div>

          {/* Weekday header */}
          <div className={styles.weekdays}>
            {weekdays.map((w, i) => (
              <div key={i}>
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className={styles.calendarGrid}>
            {cells.map((day, idx) => {
              if (day === null) return <div key={idx} className={styles.blankDay} />;
              const key = toKey(viewYear, viewMonth, day);
              const dayEvents = eventMap.get(key) ?? [];
              const isToday = key === todayKey;
              const isSelected = key === selectedDate;
              const hasEvents = dayEvents.length > 0;
              return (
                <div
                  key={idx}
                  className={`${styles.dayCell} ${hasEvents ? styles.hasEvents : ''} ${isSelected ? styles.selectedDay : ''} ${isToday ? styles.today : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(key);
                      setFocusedId(dayEvents[0]?.id ?? null);
                    }}
                    className={styles.dayButton}
                    aria-label={hasEvents ? `${day}: ${dayEvents.map((event) => typeLabel(event.type)).join(', ')}` : String(day)}
                  >
                    <span>{day}</span>
                  </button>
                  {hasEvents && (
                    <div className={styles.dayDots}>
                      {dayEvents.map((event) => (
                        <button
                          type="button"
                          key={event.id}
                          onClick={() => { setSelectedDate(key); setFocusedId(event.id); }}
                          aria-label={`${typeLabel(event.type)}: ${eventTitle(event)}`}
                          title={eventTitle(event)}
                          className={`${styles.eventDot} ${event.id === focusedId ? styles.activeDot : ''}`}
                          style={{ background: STYLES[event.type].dot, boxShadow: `0 0 6px ${STYLES[event.type].glow}` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!monthHasEvents && loadingYear !== viewYear && (
            <p className={styles.noEvents}>{t.aeNoEventsMonth}</p>
          )}

          {/* Legend */}
          <div className={styles.legend}>
            <p>{t.aeLegend}</p>
            <div className={styles.legendGrid}>
              {(['conjunction', 'ramadan', 'syawal', 'parade', 'eclipse'] as AstronomyEventType[]).map((ty) => (
                <div key={ty} className={styles.legendItem}>
                  <span
                    style={{ background: STYLES[ty].dot, boxShadow: `0 0 8px ${STYLES[ty].glow}` }} />
                  <div>
                    <strong>{typeLabel(ty)}</strong>
                    <small>{typeDesc(ty)}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Side panel ───────────────────────────────── */}
        <aside className={styles.sidePanel}>
          {/* Every event on the selected date is shown, not only the first one. */}
          <section className={styles.dayDetail}>
            <div className={styles.dayDetailHeader}>
              <div><span>{t.aeEventOn}</span><h2>{fmtFull(selectedDate)}</h2></div>
              <b>{selectedDayEvents.length.toString().padStart(2, '0')}</b>
            </div>
            {selectedDayEvents.length === 0 ? (
              <p className={styles.emptyDay}>{locale === 'id' ? 'Tidak ada peristiwa astronomi pada tanggal ini.' : 'There are no astronomy events on this date.'}</p>
            ) : (
              <div className={styles.eventStack}>
                {selectedDayEvents.map((selectedEvent) => (
                  <article key={selectedEvent.id} className={styles.eventDetail}>
                    <div className={styles.eventIcon}>{STYLES[selectedEvent.type].icon}</div>
                    <div className={styles.eventCopy}>
                      <span className={styles.eventTag} style={{ color: STYLES[selectedEvent.type].dot }}>
                        {typeLabel(selectedEvent.type)}
                      </span>
                      <h3>{eventTitle(selectedEvent)}</h3>
                      <div className={styles.eventMeta}>
                        {selectedEvent.type !== 'parade' && <span>{t.aeHijriYear}: <b>{selectedEvent.hijriYear} H</b></span>}
                        <span>{t.aeSource}: <b>{selectedEvent.source === 'system' ? t.aeSourceSystem : t.aeSourceOfficial}</b></span>
                      </div>
                      {selectedEvent.href && (
                        <Link href={selectedEvent.href} className={styles.eventLink}>
                          {selectedEvent.type === 'eclipse' ? t.aeOpenEclipse
                            : selectedEvent.type === 'parade' ? t.aeOpenParade
                              : (locale === 'id' ? 'Buka Prediksi Ramadan →' : 'Open Ramadan Prediction →')}
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Annual event navigator */}
          <section className={styles.cyclePanel}>
            <div className={styles.cycleHead}>
              <div><span>03 / {locale === 'id' ? 'ARSIP TAHUNAN' : 'ANNUAL ARCHIVE'}</span><h3>{locale === 'id' ? `Peristiwa ${viewYear}` : `${viewYear} Events`}</h3></div>
              <b>{loadingYear === viewYear ? '•••' : yearEvents.length.toString().padStart(2, '0')}</b>
            </div>
            <p className={styles.cycleHint}>{locale === 'id'
              ? 'Pilih peristiwa untuk melompat langsung ke tanggalnya. Data tahun yang dipilih dihitung dan disimpan otomatis.'
              : 'Select an event to jump directly to its date. The selected year is computed and cached automatically.'}</p>

            <div className={styles.timeline}>
              {yearEvents.map((e) => {
                const isSel = e.id === focusedId;
                return (
                  <button
                    key={e.id}
                    onClick={() => jumpToEvent(e)}
                    className={isSel ? styles.activeTimelineItem : ''}
                  >
                    <span
                      className={styles.timelineDot}
                      style={{ background: STYLES[e.type].dot, boxShadow: `0 0 8px ${STYLES[e.type].glow}` }}
                    />
                    <div>
                      <span style={{ color: STYLES[e.type].dot }}>{typeLabel(e.type)}</span>
                      <small>{e.type === 'parade' ? (locale === 'id' ? 'KANDIDAT NASA' : 'NASA CANDIDATE') : `${e.hijriYear} H`}</small>
                    </div>
                    <p>{fmtFull(e.date)}</p>
                  </button>
                );
              })}
              {loadingYear === viewYear && <p className={styles.yearMessage}>{locale === 'id' ? 'Sedang menghitung katalog tahun…' : 'Computing the annual catalog…'}</p>}
              {loadingYear !== viewYear && yearEvents.length === 0 && <p className={styles.yearMessage}>{locale === 'id' ? 'Belum ada hasil peristiwa untuk tahun ini.' : 'No event results are available for this year yet.'}</p>}
              {yearWarnings.length > 0 && <div className={styles.yearWarning}><span>{locale === 'id' ? 'Sebagian kategori belum berhasil dimuat.' : 'Some categories could not be loaded.'}</span><button onClick={() => setReloadToken((value) => value + 1)}>{locale === 'id' ? 'Coba Lagi' : 'Retry'}</button></div>}
            </div>
          </section>
        </aside>
      </div>
      </main>
    </div>
  );
}
