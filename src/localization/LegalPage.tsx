import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {SiteHeader} from '@/components/sports/SiteHeader';
import {interfaceRoutes,languageTags,type InterfaceLocale} from './interface';
import {legalKind,legalKinds,legalPath,type LegalKind} from './legal-routes';
import {legalContent,legalReviewedAt,officialSafetySources,safetyCopy} from './legal-content';
import {helpKinds,helpPath} from './help-routes';
import {helpContent,helpCopy} from './help-content';
import {legalPaths,localizedAlternates,openGraphLocale} from '@/seo/policy';
import {openGraphImages} from '@/seo/open-graph';

export function legalMetadata(locale:InterfaceLocale,slug:string):Metadata{
  const kind=legalKind(locale,slug);if(!kind)return {title:'LivaSports',robots:{index:false,follow:false}};
  const content=legalContent[locale][kind],paths=legalPaths(kind);
  return {title:content.title,description:content.intro,alternates:localizedAlternates(locale,paths),
    openGraph:{type:'article',siteName:'LivaSports',title:content.title,description:content.intro,url:paths[locale],locale:openGraphLocale(locale),modifiedTime:legalReviewedAt,images:openGraphImages()},
    other:{'content-language':languageTags[locale]}};
}
export function SafetyNotice({locale}:{locale:InterfaceLocale}){return <p className="sports-safety-note"><b>18+</b><span>{safetyCopy[locale].warning}</span></p>;}
export function SiteFooter({locale}:{locale:InterfaceLocale}){
  const text=safetyCopy[locale];
  return <footer className="sports-site-footer" lang={languageTags[locale]}><div><strong>LivaSports</strong><p>{text.footer}</p>
    <nav aria-label={text.navigation}>{legalKinds.map(kind=><Link prefetch={false} key={kind} href={legalPath(locale,kind)}>{legalContent[locale][kind].title}</Link>)}</nav>
    <nav aria-label={helpCopy[locale].navigation}>{helpKinds.map(kind=><Link prefetch={false} key={kind} href={helpPath(locale,kind)}>{helpContent[locale][kind].title}</Link>)}</nav><SafetyNotice locale={locale}/>
  </div></footer>;
}
export function LegalPage({locale,slug}:{locale:InterfaceLocale;slug:string}){
  const kind=legalKind(locale,slug);if(!kind)notFound();
  const content=legalContent[locale][kind],text=safetyCopy[locale];
  return <div className="app-shell" lang={languageTags[locale]}><SiteHeader locale={locale} activePage="home" contentId="legal-content"/>
    <main className="sports-legal-page" id="legal-content"><nav aria-label={text.navigation}><Link href={interfaceRoutes[locale].home}>LivaSports</Link><span aria-hidden="true"> / </span>{content.title}</nav>
      <h1>{content.title}</h1><p className="sports-legal-intro">{content.intro}</p><small>{text.reviewed} <time dateTime={legalReviewedAt}>{new Intl.DateTimeFormat(languageTags[locale],{dateStyle:'long',timeZone:'UTC'}).format(new Date(legalReviewedAt+'T12:00:00Z'))}</time></small>
      {content.sections.map(section=><section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}
      {kind==='responsible'&&locale==='br'?<><SafetyNotice locale={locale}/><section><h2>{text.sources}</h2><ul>{(['prevention','exclusion','rules'] as const).map(key=><li key={key}><a href={officialSafetySources[key]} rel="noreferrer">{key==='prevention'?text.health:key==='exclusion'?text.exclusion:text.rules}</a></li>)}</ul></section></>:null}
    </main>
  </div>;
}
export const legalParams=(locale:InterfaceLocale)=>legalKinds.map((kind:LegalKind)=>({document:legalPath(locale,kind).split('/')[2]}));
