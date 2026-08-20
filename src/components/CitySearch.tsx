'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './CitySearch.module.css';

export interface CityLocation {
  id: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

interface CityCandidate extends Omit<CityLocation, 'timeZone'> {}

interface Props {
  locale: 'id' | 'en';
  value: CityLocation | null;
  onChange: (location: CityLocation | null) => void;
  optional?: boolean;
}

export default function CitySearch({ locale, value, onChange, optional = true }: Props) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value?.displayName ?? '');
  const [results, setResults] = useState<CityCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => setQuery(value?.displayName ?? ''), [value]);

  useEffect(() => {
    const handleOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (value?.displayName === query || text.length < 2) {
      setResults([]); setOpen(false); setLoading(false); return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(false);
      try {
        const response = await fetch(`/api/geocode/search?${new URLSearchParams({ q: text, lang: locale })}`, { signal: controller.signal });
        const data = await response.json() as { results?: CityCandidate[] };
        if (!response.ok) throw new Error('city-search-failed');
        setResults(data.results ?? []); setOpen(true);
      } catch (caught) {
        if ((caught as Error).name !== 'AbortError') { setResults([]); setOpen(true); setError(true); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 320);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, locale, value?.displayName]);

  async function selectCity(candidate: CityCandidate) {
    setQuery(candidate.displayName); setResults([]); setOpen(false); setLoading(true); setError(false);
    let timeZone = 'UTC';
    try {
      const response = await fetch(`/api/timezone?${new URLSearchParams({ lat: String(candidate.latitude), lon: String(candidate.longitude) })}`);
      const data = await response.json() as { tz?: string };
      if (response.ok && data.tz) timeZone = data.tz;
    } finally {
      onChange({ ...candidate, timeZone }); setLoading(false);
    }
  }

  function updateQuery(next: string) {
    setQuery(next);
    if (value && next !== value.displayName) onChange(null);
  }

  return <div className={styles.field} ref={containerRef}>
    <label htmlFor={`${listId}-input`}>{locale === 'id' ? `Lokasi pengamat${optional ? ' (opsional)' : ''}` : `Observer location${optional ? ' (optional)' : ''}`}</label>
    <div className={`${styles.inputWrap} ${value ? styles.selected : ''}`}>
      <span aria-hidden="true">⌖</span>
      <input id={`${listId}-input`} value={query} onChange={(event) => updateQuery(event.target.value)} onFocus={() => results.length > 0 && setOpen(true)} placeholder={locale === 'id' ? 'Ketik kota, mis. Bekasi…' : 'Type a city, e.g. London…'} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${listId}-list`} autoComplete="off" />
      {loading && <i aria-label={locale === 'id' ? 'Mencari kota' : 'Searching cities'} />}
      {!loading && query && <button type="button" onClick={() => { setQuery(''); setResults([]); setOpen(false); onChange(null); }} aria-label={locale === 'id' ? 'Hapus lokasi' : 'Clear location'}>×</button>}
    </div>
    {open && <ul id={`${listId}-list`} className={styles.results} role="listbox">
      {results.map((candidate) => <li key={candidate.id} role="option" aria-selected="false"><button type="button" onClick={() => selectCity(candidate)}><b>{candidate.name}</b><span>{candidate.displayName}</span><small>{candidate.latitude.toFixed(4)}, {candidate.longitude.toFixed(4)}</small></button></li>)}
      {results.length === 0 && <li className={styles.empty}>{error ? (locale === 'id' ? 'Pencarian kota sedang tidak tersedia.' : 'City search is currently unavailable.') : (locale === 'id' ? 'Kota tidak ditemukan. Coba sertakan negara/provinsi.' : 'No city found. Try adding a country or state.')}</li>}
    </ul>}
    <small className={styles.hint}>{value ? `${value.latitude.toFixed(4)}, ${value.longitude.toFixed(4)} · ${value.timeZone}` : (locale === 'id' ? 'Cari kota di seluruh dunia. Kosongkan untuk hasil global.' : 'Search cities worldwide. Leave empty for global results.')}</small>
  </div>;
}
