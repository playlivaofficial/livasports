import type { SiteLocale } from '@/config/i18n';

export function slugifyMatch(home: string, away: string): string {
  return `${home}-x-${away}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 96);
}

export function matchPath(locale: SiteLocale, publicId: string, home: string, away: string): string {
  const segment = locale === 'br' ? 'jogo' : 'partido';
  return `/${locale}/${segment}/${slugifyMatch(home, away)}-${publicId}`;
}

export function parseMatchParam(value: string): { slug: string; publicId: string } | null {
  const match = /^(.*)-([a-f0-9]{16})$/i.exec(value);
  return match?.[1] ? { slug: match[1].toLowerCase(), publicId: match[2].toLowerCase() } : null;
}
