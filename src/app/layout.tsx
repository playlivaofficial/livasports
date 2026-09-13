import type { Metadata } from 'next';
import './globals.css';
import './visual-system.css';
import './language.css';
import {Suspense} from 'react';
import {headers} from 'next/headers';
import {LegacyPageShell} from '@/localization/LegacyPageShell';
import {isInterfaceLocale,languageTags} from '@/localization/interface';

export const metadata: Metadata = {
  metadataBase: new URL('https://livasports.com'),
  title: { default: 'LivaSports', template: '%s | LivaSports' },
  description: 'Placares esportivos e comparação transparente de odds para Brasil e México.',
  robots: process.env.VERCEL_ENV === 'production' ? { index: true, follow: true } : { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const value=(await headers()).get('x-livasports-interface-language');
  const language=isInterfaceLocale(value)?languageTags[value]:'en';
  return <html lang={language}><body><div className="site-content-wrapper">{children}</div><Suspense fallback={null}><LegacyPageShell/></Suspense></body></html>;
}
