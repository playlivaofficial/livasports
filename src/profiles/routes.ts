import type { SiteLocale } from '@/config/i18n';

export function slugifyProfileName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'perfil';
}
export function teamPath(locale: SiteLocale, publicId: string, name: string): string {
  return `/${locale}/${locale === 'br' ? 'time' : 'equipo'}/${slugifyProfileName(name)}-${publicId}`;
}

export function playerPath(locale: SiteLocale, publicId: string, name: string): string {
  return `/${locale}/${locale === 'br' ? 'jogador' : 'jugador'}/${slugifyProfileName(name)}-${publicId}`;
}

export function parseProfileParam(value: string): { slug: string; publicId: string } | null {
  const match = /^(.*)-([a-f0-9]{16})$/i.exec(value);
  return match?.[1] ? { slug: match[1].toLowerCase(), publicId: match[2].toLowerCase() } : null;
}
