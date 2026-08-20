/**
 * Astronomy Events — dataset statis peristiwa astronomi yang ditandai di
 * kalender menu "Astronomy Event".
 *
 * Sumber data (semua sudah terverifikasi, TIDAK ada tanggal karangan):
 *  - conjunction (Ijtimak Ramadan)  → hasil komputasi sistem (Skripsi Tabel 4.11)
 *  - ramadan (1 Ramadan lokal)       → hasil komputasi sistem (Skripsi Tabel 4.12,
 *                                       lokasi Kota Bekasi, Rule A & Rule B)
 *  - syawal (1 Syawal / Idul Fitri)  → penetapan resmi Sidang Isbat Kemenag RI
 *
 * Data disimpan statis agar kalender langsung terisi saat dibuka — pengguna
 * tidak perlu menjalankan komputasi manual. Struktur "cycle" menjaga rantai
 * Ijtimak → 1 Ramadan → 1 Syawal tetap jelas dan mudah ditambah event lain
 * di masa depan.
 */

export type AstronomyEventType = 'conjunction' | 'ramadan' | 'syawal' | 'parade' | 'eclipse';
export type EventSource = 'system' | 'official';

export interface AstronomyEvent {
  id: string;
  type: AstronomyEventType;
  /** Tanggal sipil lokal, format YYYY-MM-DD */
  date: string;
  gregorianYear: number;
  hijriYear: number;
  source: EventSource;
  /** Nama peristiwa (dipakai untuk parade; event Ramadan/Syawal cukup dari type). */
  label?: string;
  /** Tautan ke halaman perhitungan (parade → /parade-planet?date=...). */
  href?: string;
}

/**
 * Katalog Parade Planet. HANYA berisi tanggal yang sudah DIKONFIRMASI oleh
 * sistem kita sendiri (pipeline /api/parade → memenuhi N_min), bukan tanggal
 * viral yang belum diverifikasi. Tambah entri baru hanya setelah dihitung.
 * 2026-08-12: enam planet masuk hitungan parade; empat dapat dijangkau dengan
 * mata telanjang dan dua memerlukan alat bantu.
 */
export interface ParadeEvent {
  id: string;
  date: string;
  gregorianYear: number;
  hijriYear: number;
  label: string;
}
export const PARADE_EVENTS: ParadeEvent[] = [
  { id: 'parade-2026-08-12', date: '2026-08-12', gregorianYear: 2026, hijriYear: 1448, label: 'Parade 6 Planet (4 kasat mata + 2 optik)' },
];

/** Katalog gerhana yang sudah diverifikasi ulang oleh pipeline /api/eclipse. */
export interface EclipseEvent {
  id: string;
  date: string;
  gregorianYear: number;
  hijriYear: number;
  kind: 'solar' | 'lunar';
  label: string;
}
export const ECLIPSE_EVENTS: EclipseEvent[] = [
  { id: 'eclipse-solar-2026-02-17', date: '2026-02-17', gregorianYear: 2026, hijriYear: 1447, kind: 'solar', label: 'Gerhana Matahari Cincin' },
  { id: 'eclipse-lunar-2026-03-03', date: '2026-03-03', gregorianYear: 2026, hijriYear: 1447, kind: 'lunar', label: 'Gerhana Bulan Total' },
  { id: 'eclipse-solar-2026-08-12', date: '2026-08-12', gregorianYear: 2026, hijriYear: 1448, kind: 'solar', label: 'Gerhana Matahari Total' },
  { id: 'eclipse-lunar-2026-08-28', date: '2026-08-28', gregorianYear: 2026, hijriYear: 1448, kind: 'lunar', label: 'Gerhana Bulan Sebagian' },
];

export interface RamadanCycle {
  gregorianYear: number;
  hijriYear: number;
  conjunction: string; // Ijtimak (YYYY-MM-DD)
  ramadan: string;     // 1 Ramadan lokal
  syawal: string;      // 1 Syawal / Idul Fitri
}

/** Periode pengujian skripsi: 2017–2026 (Ramadan 1438 H – 1447 H). */
export const RAMADAN_CYCLES: RamadanCycle[] = [
  { gregorianYear: 2017, hijriYear: 1438, conjunction: '2017-05-25', ramadan: '2017-05-27', syawal: '2017-06-25' },
  { gregorianYear: 2018, hijriYear: 1439, conjunction: '2018-05-15', ramadan: '2018-05-17', syawal: '2018-06-15' },
  { gregorianYear: 2019, hijriYear: 1440, conjunction: '2019-05-04', ramadan: '2019-05-06', syawal: '2019-06-05' },
  { gregorianYear: 2020, hijriYear: 1441, conjunction: '2020-04-23', ramadan: '2020-04-24', syawal: '2020-05-24' },
  { gregorianYear: 2021, hijriYear: 1442, conjunction: '2021-04-12', ramadan: '2021-04-13', syawal: '2021-05-13' },
  { gregorianYear: 2022, hijriYear: 1443, conjunction: '2022-04-01', ramadan: '2022-04-02', syawal: '2022-05-02' },
  { gregorianYear: 2023, hijriYear: 1444, conjunction: '2023-03-21', ramadan: '2023-03-23', syawal: '2023-04-22' },
  { gregorianYear: 2024, hijriYear: 1445, conjunction: '2024-03-10', ramadan: '2024-03-12', syawal: '2024-04-10' },
  { gregorianYear: 2025, hijriYear: 1446, conjunction: '2025-02-28', ramadan: '2025-03-01', syawal: '2025-03-31' },
  { gregorianYear: 2026, hijriYear: 1447, conjunction: '2026-02-17', ramadan: '2026-02-19', syawal: '2026-03-21' },
];

const EVENT_SOURCE: Record<AstronomyEventType, EventSource> = {
  conjunction: 'system',
  ramadan: 'system',
  syawal: 'official',
  parade: 'system',
  eclipse: 'system',
};

/** Semua event dalam bentuk daftar datar, terurut menaik berdasarkan tanggal. */
export function getAllEvents(): AstronomyEvent[] {
  const events: AstronomyEvent[] = [];
  for (const c of RAMADAN_CYCLES) {
    events.push(
      { id: `conj-${c.hijriYear}`, type: 'conjunction', date: c.conjunction, gregorianYear: c.gregorianYear, hijriYear: c.hijriYear, source: EVENT_SOURCE.conjunction },
      { id: `ram-${c.hijriYear}`, type: 'ramadan', date: c.ramadan, gregorianYear: c.gregorianYear, hijriYear: c.hijriYear, source: EVENT_SOURCE.ramadan },
      { id: `syw-${c.hijriYear}`, type: 'syawal', date: c.syawal, gregorianYear: c.gregorianYear, hijriYear: c.hijriYear, source: EVENT_SOURCE.syawal },
    );
  }
  for (const p of PARADE_EVENTS) {
    events.push({
      id: p.id, type: 'parade', date: p.date, gregorianYear: p.gregorianYear,
      hijriYear: p.hijriYear, source: 'system', label: p.label,
      href: `/parade-planet?date=${p.date}`,
    });
  }
  for (const eclipse of ECLIPSE_EVENTS) {
    events.push({
      id: eclipse.id, type: 'eclipse', date: eclipse.date,
      gregorianYear: eclipse.gregorianYear, hijriYear: eclipse.hijriYear,
      source: EVENT_SOURCE.eclipse, label: eclipse.label,
      href: `/gerhana?type=${eclipse.kind}&start=${eclipse.date}`,
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/** Peta cepat: tanggal (YYYY-MM-DD) → daftar event pada hari itu. */
export function buildEventMap(events: AstronomyEvent[] = getAllEvents()): Map<string, AstronomyEvent[]> {
  const map = new Map<string, AstronomyEvent[]>();
  for (const e of events) {
    const arr = map.get(e.date) ?? [];
    arr.push(e);
    map.set(e.date, arr);
  }
  return map;
}

/** Rentang tahun tersedia (untuk chip pemilih tahun). */
export function getYearRange(): number[] {
  return RAMADAN_CYCLES.map((c) => c.gregorianYear);
}
