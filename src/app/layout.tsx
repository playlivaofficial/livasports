import type { Metadata } from 'next';
import './globals.css';
import './visual-system.css';
import {Suspense} from 'react';
import {SlipShell} from '@/components/slip/SlipShell';

export const metadata: Metadata = {
  metadataBase: new URL('https://livasports.com'),
  title: { default: 'LivaSports', template: '%s | LivaSports' },
  description: 'Placares esportivos e comparação transparente de odds para Brasil e México.',
  robots: process.env.VERCEL_ENV === 'production' ? { index: true, follow: true } : { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><div className="site-content-wrapper">{children}</div><Suspense fallback={null}><SlipShell/></Suspense></body></html>;
}
