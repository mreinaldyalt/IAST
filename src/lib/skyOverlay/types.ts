/** Tipe data katalog overlay langit (bintang, rasi, DSO, satelit). */

/** [hip, raDeg, decDeg, vmag] */
export type StarEntry = [number, number, number, number];
export interface StarsData { format: string; count: number; stars: StarEntry[] }

export interface ConstellationEntry { id: string; name: string; lines: number[][] }
export interface ConstellationsData { count: number; constellations: ConstellationEntry[] }

export interface DsoEntry {
  name: string;
  messier: string | null;
  common: string | null;
  type: string;
  ra: number;
  dec: number;
  mag: number | null;
}
export interface DsoData { count: number; objects: DsoEntry[] }

export interface SatTleEntry { name: string; l1: string; l2: string }
export interface SatellitesData { count: number; sats: SatTleEntry[] }

/** Objek yang sedang diklik/dipilih di overlay, utk popup info. */
export type OverlayPickedKind = 'star' | 'dso' | 'satellite';
export interface OverlayPicked {
  kind: OverlayPickedKind;
  title: string;
  subtitle?: string;
  extra?: Record<string, string>;
}
