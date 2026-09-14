import type { Metadata } from 'next';
import './globals.css';
import './visual-system.css';
import './language.css';
import './sports-board.css';
import './sports-product.css';
import './owner-preview.css';
import {requestOwnerSession} from '@/owner/session';
import {OwnerPreviewBar} from '@/owner/PreviewControls';
import {Suspense} from 'react';
import {headers} from 'next/headers';
import {LegacyPageShell} from '@/localization/LegacyPageShell';
import {isInterfaceLocale,languageTags} from '@/localization/interface';
import {SiteFooter} from '@/localization/LegalPage';
import {requestTimePreference} from '@/localization/time-zone-server';
import {TimePreferenceProvider} from '@/localization/TimeZoneSelector';

export const metadata: Metadata = {
  metadataBase: new URL('https://livasports.com'),
  title: { default: 'LivaSports', template: '%s | LivaSports' },
  description: 'Placares esportivos e comparação transparente de odds para Brasil e México.',
  robots: process.env.VERCEL_ENV === 'production' ? { index: true, follow: true } : { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const h=await headers(),session=requestOwnerSession(h);
  const value=h.get('x-livasports-interface-language');
  const language=isInterfaceLocale(value)?languageTags[value]:'en';
  const locale=isInterfaceLocale(value)?value:'en',timePreference=await requestTimePreference(locale);
  return <html lang={language} data-scroll-behavior="smooth"><body><TimePreferenceProvider {...timePreference}>{session?<OwnerPreviewBar preview={session.preview}/>:null}<div className="site-content-wrapper">{children}<SiteFooter locale={locale}/></div><Suspense fallback={null}><LegacyPageShell/></Suspense></TimePreferenceProvider></body></html>;
}
