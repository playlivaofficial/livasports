import type {Metadata} from 'next';
import type {InterfaceLocale} from './interface';
import {LegalPage,legalMetadata,legalParams} from './LegalPage';
import {HelpPage,helpMetadata,helpParams} from './HelpPage';
import {helpKind} from './help-routes';
import {legalKind} from './legal-routes';

/** `/{locale}/{document}` serves legal documents and P2 evergreen help topics from one static route. */
export function documentMetadata(locale:InterfaceLocale,slug:string):Metadata{
  if(helpKind(locale,slug))return helpMetadata(locale,slug);
  return legalMetadata(locale,slug);
}
export function DocumentPage({locale,slug}:{locale:InterfaceLocale;slug:string}){
  if(helpKind(locale,slug))return <HelpPage locale={locale} slug={slug}/>;
  if(legalKind(locale,slug))return <LegalPage locale={locale} slug={slug}/>;
  return <LegalPage locale={locale} slug={slug}/>;
}
export const documentParams=(locale:InterfaceLocale)=>[...legalParams(locale),...helpParams(locale)];
