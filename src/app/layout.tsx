import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/components/I18nProvider';
import AppShell from '@/components/AppShell';
import {
  AUTHOR_NAME,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_SHORT,
  SITE_URL,
  buildJsonLd,
} from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} [${SITE_SHORT}] — Platform Riset Astronomi Internasional`,
    template: `%s | ${SITE_SHORT}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: `${SITE_NAME} [${SITE_SHORT}]`,
  authors: [{ name: AUTHOR_NAME, url: `${SITE_URL}/about` }],
  creator: AUTHOR_NAME,
  publisher: AUTHOR_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: `${SITE_NAME} [${SITE_SHORT}]`,
    locale: 'id_ID',
    alternateLocale: ['en_US'],
    url: '/',
    title: `${SITE_NAME} [${SITE_SHORT}] — Platform Riset Astronomi Internasional`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} [${SITE_SHORT}]`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  // Token dari Google Search Console (metode "Tag HTML"). Diisi lewat
  // GOOGLE_SITE_VERIFICATION di .env.local server; kosong = tag tidak dirender.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen cosmic-bg text-slate-100 antialiased">
        <script
          type="application/ld+json"
          // `<` di-escape agar string apa pun di dalam data tak bisa menutup tag <script>.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd()).replace(/</g, '\\u003c') }}
        />
        <I18nProvider>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
