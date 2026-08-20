import { dateToJD, queryHorizons } from '@/lib/horizonsClient';
import type { HorizonsSource, HorizonsVector } from './types';

// Menjaga URL dan beban tiap kalkulasi di bawah ukuran batch yang stabil pada
// endpoint publik Horizons. Dua target tetap diambil paralel, antar-batch berurutan.
const MAX_EPOCHS_PER_QUERY = 40;

// Horizons VECTORS memakai TDB. Konversi UTC -> TDB di sini agar tag waktu UI
// tetap UTC. TDB-TT < 0,002 s; untuk keperluan kontak 5-menit cukup memakai
// TT-UTC dari tabel leap-second (dan nilai terakhir untuk tanggal mendatang).
const LEAP_SECOND_EFFECTIVE: Array<[string, number]> = [
  ['1972-01-01', 10], ['1972-07-01', 11], ['1973-01-01', 12], ['1974-01-01', 13],
  ['1975-01-01', 14], ['1976-01-01', 15], ['1977-01-01', 16], ['1978-01-01', 17],
  ['1979-01-01', 18], ['1980-01-01', 19], ['1981-07-01', 20], ['1982-07-01', 21],
  ['1983-07-01', 22], ['1985-07-01', 23], ['1988-01-01', 24], ['1990-01-01', 25],
  ['1991-01-01', 26], ['1992-07-01', 27], ['1993-07-01', 28], ['1994-07-01', 29],
  ['1996-01-01', 30], ['1997-07-01', 31], ['1999-01-01', 32], ['2006-01-01', 33],
  ['2009-01-01', 34], ['2012-07-01', 35], ['2015-07-01', 36], ['2017-01-01', 37],
];

function tdbMinusUtcSeconds(date: Date): number {
  let taiMinusUtc = 10;
  for (const [effective, value] of LEAP_SECOND_EFFECTIVE) {
    if (date.getTime() >= Date.parse(`${effective}T00:00:00Z`)) taiMinusUtc = value;
    else break;
  }
  return taiMinusUtc + 32.184;
}

function parseVectorRows(raw: string, epochs: Date[], source: HorizonsSource): HorizonsVector[] {
  const soeStart = raw.indexOf('$$SOE');
  const soeEnd = raw.indexOf('$$EOE');
  if (soeStart < 0 || soeEnd < 0) throw new Error('NASA Horizons tidak mengembalikan tabel state vector.');
  const lines = raw.slice(soeStart + 5, soeEnd).trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== epochs.length) {
    throw new Error(`Jumlah state vector NASA tidak sesuai (diminta ${epochs.length}, diterima ${lines.length}).`);
  }

  return lines.map((line, index) => {
    const parts = line.split(',').map((part) => part.trim());
    const jd = Number.parseFloat(parts[0]);
    const values = parts.slice(2).map((part) => Number.parseFloat(part)).filter(Number.isFinite);
    if (!Number.isFinite(jd) || values.length < 6) throw new Error('Baris state vector NASA tidak dapat diparsing.');
    return {
      epochUTC: epochs[index],
      jd,
      positionKm: { x: values[0], y: values[1], z: values[2] },
      velocityKmS: { x: values[3], y: values[4], z: values[5] },
      source,
    };
  });
}

async function fetchChunk(command: '10' | '301', epochs: Date[]): Promise<HorizonsVector[]> {
  const tlist = epochs
    .map((date) => `'${(dateToJD(date) + tdbMinusUtcSeconds(date) / 86400).toFixed(9)}'`)
    .join(' ');
  const params: Record<string, string> = {
    COMMAND: `'${command}'`,
    // See horizonsQueries.ts: OBJ_DATA='NO' + COMMAND=10/301 (Sun/Moon) 500s on
    // NASA's end; 'YES' is a safe workaround since we only parse $$SOE/$$EOE.
    OBJ_DATA: "'YES'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@399'",
    TLIST: tlist,
    REF_PLANE: "'FRAME'",
    OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'2'",
    CSV_FORMAT: "'YES'",
  };
  const response = await queryHorizons(params);
  if (response.source === 'mock') {
    throw new Error('NASA/JPL Horizons sedang tidak tersedia. Kalkulasi Gerhana tidak memakai data simulasi; silakan coba lagi.');
  }
  return parseVectorRows(response.result, epochs, response.source);
}

/** Mengambil state vector ICRF geosentrik tanpa mencampur fallback simulasi. */
export async function fetchHorizonsVectors(command: '10' | '301', epochs: Date[]): Promise<HorizonsVector[]> {
  if (epochs.length === 0) return [];
  const rows: HorizonsVector[] = [];
  for (let index = 0; index < epochs.length; index += MAX_EPOCHS_PER_QUERY) {
    rows.push(...await fetchChunk(command, epochs.slice(index, index + MAX_EPOCHS_PER_QUERY)));
  }
  return rows;
}

export async function fetchSunMoonVectors(epochs: Date[]): Promise<{ sun: HorizonsVector[]; moon: HorizonsVector[] }> {
  const [sun, moon] = await Promise.all([
    fetchHorizonsVectors('10', epochs),
    fetchHorizonsVectors('301', epochs),
  ]);
  return { sun, moon };
}
