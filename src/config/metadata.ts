import type { Metadata } from 'next';
import { getDictionary, localeRoutes, type PageKey, type SiteLocale } from './i18n';

export function routeMetadata(locale: SiteLocale, page: PageKey): Metadata {
  const dictionary = getDictionary(locale);
  const route = localeRoutes[locale][page];
  const content = dictionary.pages[page];
  return {
    title: content.title, description: content.description,
    alternates: { canonical: route, languages: { 'pt-BR': localeRoutes.br[page], 'es-MX': localeRoutes.mx[page] } },
    openGraph: { type: 'website', url: route, siteName: 'LivaSports', locale: dictionary.locale.replace('-', '_'), title: content.title, description: content.description },
    other: { 'content-language': dictionary.locale },
  };
}
