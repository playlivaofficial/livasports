import type {Metadata} from 'next';
import type {InterfaceLocale} from './interface';
import {LegalPage,legalMetadata,legalParams} from './LegalPage';
import {HelpPage,helpMetadata,helpParams} from './HelpPage';
import {helpKind} from './help-routes';
import {legalKind} from './legal-routes';
import {sectionFromSlug} from '@/v2/routes';
import {EditorialIndex,editorialDocumentParams,v2Metadata} from '@/v2/pages';

/** `/{locale}/{document}` serves legal documents and P2 evergreen help topics from one static route. */
export function documentMetadata(locale:InterfaceLocale,slug:string):Metadata{
  const section=sectionFromSlug(locale,slug);if(section)return v2Metadata(locale,section);
  if(helpKind(locale,slug))return helpMetadata(locale,slug);
  return legalMetadata(locale,slug);
}
export function DocumentPage({locale,slug}:{locale:InterfaceLocale;slug:string}){
  const section=sectionFromSlug(locale,slug);if(section)return <EditorialIndex locale={locale} section={section}/>;
  if(helpKind(locale,slug))return <HelpPage locale={locale} slug={slug}/>;
  if(legalKind(locale,slug))return <LegalPage locale={locale} slug={slug}/>;
  return <LegalPage locale={locale} slug={slug}/>;
}
export const documentParams=(locale:InterfaceLocale)=>[...legalParams(locale),...helpParams(locale),...editorialDocumentParams(locale)];
