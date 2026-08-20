import { describe, it, expect } from 'vitest';
import { getProviderForCountry, isCountrySupported } from '../providers';

describe('officialHistory/providers', () => {
  it('1. Indonesia is recognized by its ISO 3166-1 alpha-2 code, case-insensitively', () => {
    expect(getProviderForCountry('ID')?.countryCode).toBe('ID');
    expect(getProviderForCountry('id')?.countryCode).toBe('ID');
    expect(isCountrySupported('ID')).toBe(true);
  });

  it('5. an unsupported country returns no provider — and therefore can never fall back to Indonesia data', () => {
    expect(getProviderForCountry('MY')).toBeNull();
    expect(getProviderForCountry('SA')).toBeNull();
    expect(isCountrySupported('MY')).toBe(false);
  });

  it('handles null/undefined/empty input honestly as unsupported, not as a crash', () => {
    expect(getProviderForCountry(null)).toBeNull();
    expect(getProviderForCountry(undefined)).toBeNull();
    expect(getProviderForCountry('')).toBeNull();
  });
});
