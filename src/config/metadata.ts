import type { Metadata } from 'next';
import type {PageKey} from './i18n';
import {interfaceDictionary as getDictionary,interfaceRoutes as localeRoutes,languageAlternates,type InterfaceLocale as SiteLocale} from '@/localization/interface';

export function routeMetadata(locale: SiteLocale, page: PageKey): Metadata {
  const dictionary = getDictionary(locale);
  const route = localeRoutes[locale][page];
  const content = dictionary.pages[page];
  return {
    title: content.title, description: content.description,
    alternates: { canonical: route, languages: languageAlternates(localeRoutes.br[page],localeRoutes.mx[page],localeRoutes.en[page]) },
    openGraph: { type: 'website', url: route, siteName: 'LivaSports', locale: dictionary.locale.replace('-', '_'), title: content.title, description: content.description },
    other: { 'content-language': dictionary.locale },
  };
}
