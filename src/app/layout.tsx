import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'LivaSports', template: '%s | LivaSports' },
  description: 'Placares esportivos e comparação transparente de odds para Brasil e México.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
