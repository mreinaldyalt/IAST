import { CountryProviderConfig } from './types';
import { INDONESIA_PROVIDER } from './indonesia';

/**
 * Extensible per-country registry. Add a new country by adding one entry here
 * (and a corresponding `providers/<country>.ts` config) — no other code needs
 * to change. Currently only Indonesia is implemented; everything else is
 * "belum tersedia" by design (never falls back to Indonesia's data).
 */
const PROVIDERS: Record<string, CountryProviderConfig> = {
  ID: INDONESIA_PROVIDER,
  // MY: (future) Malaysia provider
  // SA: (future) Saudi Arabia provider
};

export function getProviderForCountry(countryCode: string | null | undefined): CountryProviderConfig | null {
  if (!countryCode) return null;
  return PROVIDERS[countryCode.toUpperCase()] ?? null;
}

export function isCountrySupported(countryCode: string | null | undefined): boolean {
  return getProviderForCountry(countryCode) !== null;
}
