'use client';

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { type Locale, type Dictionary, getDictionary, defaultLocale } from '@/lib/i18n';

interface I18nContextType {
  locale: Locale;
  t: Dictionary;
  toggleLocale: () => void;
}

const I18nContext = createContext<I18nContextType>({
  locale: defaultLocale,
  t: getDictionary(defaultLocale),
  toggleLocale: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);

  const toggleLocale = useCallback(() => {
    setLocale((prev) => (prev === 'en' ? 'id' : 'en'));
  }, []);

  const t = getDictionary(locale);

  return (
    <I18nContext.Provider value={{ locale, t, toggleLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
