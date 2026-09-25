'use client';

import { useI18n } from '@/components/I18nProvider';
import styles from './page.module.css';

export default function SimulasiPage() {
  const { locale } = useI18n();
  const title = locale === 'id' ? 'Simulasi lintasan planet' : 'Planetary trajectory simulation';

  return (
    <iframe
      key={locale}
      className={styles.frame}
      src={`/simulasi/index.html?lang=${locale}`}
      title={title}
      allow="fullscreen"
    />
  );
}
