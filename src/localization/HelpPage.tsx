import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {SiteHeader} from '@/components/sports/SiteHeader';
import {JsonLd} from '@/seo/json-ld';
import {organizationId} from '@/seo/structured-data';
import {competitionPath} from '@/sports/policy';
import {absoluteUrl,helpPaths,localizedAlternates,openGraphLocale} from '@/seo/policy';
import {openGraphImages} from '@/seo/open-graph';
import {interfaceRoutes,languageTags,type InterfaceLocale} from './interface';
import {helpKind,helpKinds,helpPath,type HelpKind} from './help-routes';
import {helpContent,helpCopy,helpReviewDate} from './help-content';
import {SafetyNotice} from './LegalPage';

const helpCompetitions={mx:{slug:'liga-mx',name:'Liga MX'},co:{slug:'colombia-primera-a',name:'Liga BetPlay / Primera A'},pe:{slug:'peru-liga-1',name:'Liga 1 de Perú'},br:{slug:'brasileirao-serie-a',name:'Brasileirão Série A'},en:{slug:'premier-league',name:'Premier League'}} as const;
const discoveryCopy={br:{heading:'Consulte jogos e mercados',fixtures:'Próximos jogos',results:'Resultados',standings:'Classificação',today:'Jogos de hoje'},en:{heading:'Browse matches and markets',fixtures:'Upcoming matches',results:'Results',standings:'Standings',today:'Today’s matches'},mx:{heading:'Consulta partidos y mercados',fixtures:'Próximos partidos',results:'Resultados',standings:'Tabla de posiciones',today:'Partidos de hoy'}};

export function helpArticleSchema(locale:InterfaceLocale,kind:HelpKind){
 const article=helpContent[locale][kind],url=absoluteUrl(helpPath(locale,kind));
 return {'@context':'https://schema.org','@type':'Article','@id':`${url}#article`,url,mainEntityOfPage:url,
  headline:article.title,description:article.intro,inLanguage:languageTags[locale],dateModified:helpReviewDate(locale,kind),
  author:{'@type':'Organization',name:'LivaSports',url:'https://livasports.com/'},publisher:{'@type':'Organization','@id':organizationId,name:'LivaSports',url:'https://livasports.com/'},
  image:openGraphImages().map(image=>image.url.startsWith('/')?absoluteUrl(image.url):image.url)};
}

export function helpMetadata(locale:InterfaceLocale,slug:string):Metadata{
  const kind=helpKind(locale,slug);if(!kind)return {title:'LivaSports',robots:{index:false,follow:false}};
  const content=helpContent[locale][kind],paths=helpPaths(kind),helpReviewedAt=helpReviewDate(locale,kind);
  return {title:content.title,description:content.intro,alternates:localizedAlternates(locale,paths),
    openGraph:{type:'article',siteName:'LivaSports',title:content.title,description:content.intro,url:paths[locale],locale:openGraphLocale(locale),modifiedTime:helpReviewedAt,images:openGraphImages()},
    other:{'content-language':languageTags[locale]}};
}
export function HelpPage({locale,slug}:{locale:InterfaceLocale;slug:string}){
  const kind=helpKind(locale,slug);if(!kind)notFound();
  const content=helpContent[locale][kind],text=helpCopy[locale],canonical=absoluteUrl(helpPath(locale,kind)),helpReviewedAt=helpReviewDate(locale,kind);
  const breadcrumbs={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:'LivaSports',item:absoluteUrl(interfaceRoutes[locale].home)},
    {'@type':'ListItem',position:2,name:content.title,item:canonical}]};
  const discovery=discoveryCopy[locale==='br'?'br':locale==='en'?'en':'mx'],competition=helpCompetitions[locale];
  return <div className="app-shell" lang={languageTags[locale]}><JsonLd data={[breadcrumbs,helpArticleSchema(locale,kind)]}/><SiteHeader locale={locale} activePage="home" contentId="help-content"/>
    <main className="sports-legal-page" id="help-content"><nav aria-label={text.navigation}><Link href={interfaceRoutes[locale].home}>LivaSports</Link><span aria-hidden="true"> / </span>{content.title}</nav>
      <span className="board-eyebrow">{text.eyebrow}</span>
      <h1>{content.title}</h1><p className="sports-legal-intro">{content.intro}</p><small>{text.reviewed} <time dateTime={helpReviewedAt}>{new Intl.DateTimeFormat(languageTags[locale],{dateStyle:'long',timeZone:'UTC'}).format(new Date(helpReviewedAt+'T12:00:00Z'))}</time></small>
      {content.sections.map(section=><section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}
      {kind!=='favorites'?<SafetyNotice locale={locale}/>:null}
      {kind!=='favorites'?<section><h2>{discovery.heading}</h2><ul>
        <li><Link prefetch={false} href={competitionPath(locale,competition.slug)}>{competition.name}: {discovery.fixtures}</Link></li>
        <li><Link prefetch={false} href={competitionPath(locale,competition.slug,{tab:'results'})}>{competition.name}: {discovery.results}</Link></li>
        <li><Link prefetch={false} href={competitionPath(locale,competition.slug,{tab:'standings'})}>{competition.name}: {discovery.standings}</Link></li>
        <li><Link prefetch={false} href={interfaceRoutes[locale].today}>{discovery.today}</Link></li>
      </ul></section>:null}
      <section><h2>{text.related}</h2><ul>{content.related.map(related=><li key={related}><Link prefetch={false} href={helpPath(locale,related)}>{helpContent[locale][related].title}</Link></li>)}<li><Link prefetch={false} href={interfaceRoutes[locale].football}>{text.football}</Link></li></ul></section>
    </main>
  </div>;
}
export const helpParams=(locale:InterfaceLocale)=>helpKinds.map((kind:HelpKind)=>({document:helpPath(locale,kind).split('/')[2]}));
