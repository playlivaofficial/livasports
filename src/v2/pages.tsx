import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import Link from 'next/link';
import {notFound,permanentRedirect} from 'next/navigation';
import {interfaceLocales,languageTags,type InterfaceLocale} from '@/localization/interface';
import {serializeJsonLd} from '@/seo/json-ld';
import {localizedAlternates,siteOrigin} from '@/seo/policy';
import {legalPath} from '@/localization/legal-routes';
import {articles,findArticle,readingMinutes,translated,type Article} from './content';
import {leagues} from './leagues';
import {reviewSections} from './review-sections';
import {v2Copy} from './copy';
import {v2Path,toolIds,sectionFromSlug,namespaces,editorialLanguage,type Section} from './routes';
import {V2Header} from './Header';
import {EditorialArt} from './Art';
import {Icon} from './Icon';
import {LeagueRail} from './LeagueRail';
import {GeoCommercialSection,OperatorLogoSlot} from './CommercialSection';
import {reviewIdentities} from './commercial';
import {FootballBoard} from './tools/FootballBoard';
import {OddsCalculator} from './tools/OddsCalculator';
import {FootballQuiz} from './tools/FootballQuiz';
import {EditorialSearch} from './Search';
import {ToolPreview} from './tools/ToolPreview';
import {publishedNews} from '@/editorial/server';
import {FeaturedNews,FeaturedStoryHero,selectFeaturedStory} from '@/editorial/NewsCards';
import {NewsFeed} from '@/editorial/NewsFeed';
import {newsCopy} from '@/editorial/copy';
import {EditorialPolicy} from '@/editorial/EditorialPolicy';
import {SportsNav} from '@/multisport/components';
import {StandingsHighlights} from '@/multisport/HomeModules';
import {RegionalNews} from '@/multisport/RegionalNews';
import {localDataPreviewEnabled} from '@/multisport/local-preview';
import {sportsCopy} from '@/multisport/copy';

import {competitionById,competitionPath,sportsPath} from '@/multisport/catalog';

export function V2Shell({locale,children}:{locale:InterfaceLocale;children:ReactNode}){return <div className="v2-shell"><V2Header locale={locale}/>{localDataPreviewEnabled()?<aside className="ms-local-preview" role="note">{locale==='en'?'Local data review · Unpublished source snapshots. No production data or publishing changes.':locale==='br'?'Revisão local · Registros de fontes não publicados. Sem alterações nos dados de produção ou na publicação.':'Revisión local · Registros de fuentes sin publicar. Sin cambios en datos de producción ni en la publicación.'}</aside>:null}<main id="main-content" className="v2-main">{children}</main></div>;}
function Heading({title,lead,eyebrow}:{title:string;lead?:string;eyebrow?:string}){return <div className="v2-page-heading">{eyebrow?<span className="v2-eyebrow">{eyebrow}</span>:null}<h1>{title}</h1>{lead?<p>{lead}</p>:null}</div>;}
export function ArticleCard({article,locale,featured=false}:{article:Article;locale:InterfaceLocale;featured?:boolean}){const text=v2Copy(locale);return <Link className={`v2-article-card ${featured?'v2-featured-card':''}`} href={v2Path(locale,article.category,article.id)}><EditorialArt kind={article.art}/><div className="v2-article-card-body"><span className="v2-eyebrow">{text[article.category]}</span><h3>{translated(article.title,locale)}</h3>{featured?<p>{translated(article.summary,locale)}</p>:null}<span className="v2-reading">{text.editorial} <b>·</b> {readingMinutes(article,locale)} {text.minutes}</span></div></Link>;}
function SectionHeading({locale,title,section}:{locale:InterfaceLocale;title:string;section:Section}){return <div className="v2-section-heading"><h2>{title}</h2><Link className="v2-text-link" href={v2Path(locale,section)}>{v2Copy(locale).viewAll}<Icon name="arrow"/></Link></div>;}
export function ToolCards({locale}:{locale:InterfaceLocale}){const text=v2Copy(locale);const cards=[{id:toolIds[0],title:text.lineup,lead:text.lineupLead,art:'pitch'},{id:toolIds[1],title:text.tactics,lead:text.tacticsLead,art:'pitch'},{id:toolIds[2],title:text.calculator,lead:text.calculatorLead,art:'numbers'},{id:toolIds[3],title:text.quiz,lead:text.quizLead,art:'ball'}] as const;return <div className="v2-tool-grid">{cards.map(card=><Link className="v2-tool-card" href={v2Path(locale,'tools',card.id)} key={card.id}><ToolPreview id={card.id}/><div><h3>{card.title}<span aria-hidden="true">↗</span></h3><p>{card.lead}</p></div></Link>)}</div>;}
function ReviewCards({locale}:{locale:InterfaceLocale}){const text=v2Copy(locale);return <div className="v2-review-grid">{reviewIdentities.map(book=><Link key={book.id} className="v2-review-card" href={v2Path(locale,'bookmakers',book.id)}><OperatorLogoSlot name={book.name} asset={book.logo}/><strong>{book.name}</strong><span>{text.review}<span aria-hidden="true"> ↗</span></span></Link>)}</div>;}
export async function V2Home({locale}:{locale:InterfaceLocale}){const text=v2Copy(locale),copy=newsCopy(locale),news=await publishedNews(),lead=selectFeaturedStory(news,locale);return <V2Shell locale={locale}>
  <SportsNav locale={locale}/>
  {lead?<FeaturedStoryHero items={news} locale={locale}/>:<Heading title={locale==='en'?'Your world of sport':locale==='br'?'Seu mundo de esporte':'Tu mundo del deporte'} lead={copy.lead}/>}
  <FeaturedNews items={news.filter(item=>item.slug!==lead?.slug)} locale={locale}/>
  <section className="v2-section"><div className="v2-section-heading"><h2>{locale==='en'?'Popular competitions':locale==='br'?'Competições populares':'Competiciones populares'}</h2><Link className="v2-text-link" href={sportsPath(locale)}>{text.viewAll} ↗</Link></div><LeagueRail locale={locale}/></section>
  <StandingsHighlights locale={locale}/>
  <NewsFeed items={news} locale={locale} initialTime={new Date().toISOString()}/>
  <RegionalNews items={news} locale={locale}/>
  <section className="v2-section ed-analysis"><SectionHeading locale={locale} title={copy.analysis} section="analysis"/><div className="v2-story-grid">{articles.filter(article=>article.category==='analysis').slice(0,3).map(article=><ArticleCard key={article.id} article={article} locale={locale}/>)}</div></section>
  <section className="v2-section"><SectionHeading locale={locale} title={text.fanTools} section="tools"/><p className="v2-section-lead">{text.toolsLead}</p><ToolCards locale={locale}/></section>
  <GeoCommercialSection locale={locale}/>
  <JsonLd value={{'@context':'https://schema.org','@type':'WebSite',name:'LivaSports',url:siteOrigin+v2Path(locale),inLanguage:languageTags[locale],description:sportsCopy(locale).lead}}/>
  </V2Shell>;}
export async function EditorialIndex({locale,section}:{locale:InterfaceLocale;section:Section}){
  if(section==='football'||section==='leagues')permanentRedirect(sportsPath(locale,'football'));
  const text=v2Copy(locale);
  const title=section==='tools'?text.fanTools:section==='bookmakers'?text.neutralBooks:section==='about'?text.aboutTitle:section==='search'?text.searchPrompt:text[section];
  return <V2Shell locale={locale}><Heading title={title} lead={section==='tools'?text.toolsLead:section==='bookmakers'?text.neutralBooksText:undefined}/>
    {section==='analysis'||section==='guides'?<div className="v2-story-grid">{articles.filter(article=>article.category===section).map(article=><ArticleCard key={article.id} article={article} locale={locale} featured/>)}</div>:null}
    {section==='tools'?<ToolCards locale={locale}/>:null}
    {section==='search'?<EditorialSearch locale={locale} news={await publishedNews()} initialTime={new Date().toISOString()}/>:null}
    {section==='bookmakers'?<><GeoCommercialSection locale={locale} placementId="v2-directory"/><ReviewCards locale={locale}/><div className="v2-prose v2-section"><h2>{text.verify}</h2><p>{text.reviewBody}</p><ul>{[text.checkLicense,text.checkWithdraw,text.checkBonus,text.checkSafety].map(item=><li key={item}>{item}</li>)}</ul><p>{text.notOffer}</p><Link href={legalPath(locale,'responsible')}>{text.responsible}</Link></div></>:null}
    {section==='about'?<article className="v2-prose"><p className="v2-lead">{text.aboutLead}</p><p>{text.aboutBody}</p><h2>{text.methodology}</h2><p>{text.methodologyBody}</p><a href="mailto:playliva.official@gmail.com">playliva.official@gmail.com</a></article>:null}
    {section==='about'?<EditorialPolicy locale={locale}/>:null}
  </V2Shell>;
}
function JsonLd({value}:{value:object}){return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(value)}}/>;}
export function ArticlePage({locale,article}:{locale:InterfaceLocale;article:Article}){const text=v2Copy(locale),title=translated(article.title,locale);return <V2Shell locale={locale}><nav className="v2-breadcrumb" aria-label={text.back}><Link href={v2Path(locale)}>{text.home}</Link><span>/</span><Link href={v2Path(locale,article.category)}>{text[article.category]}</Link></nav><article className="v2-longread"><Heading title={title} lead={translated(article.summary,locale)} eyebrow={text[article.category]}/><div className="v2-byline"><span>{text.editorial}</span><span>{readingMinutes(article,locale)} {text.minutes}</span><span>{text.evergreen}</span></div><EditorialArt kind={article.art}/><div className="v2-article-layout"><nav className="v2-contents" aria-label={text.contents}><strong>{text.contents}</strong>{article.sections.map((section,index)=><a key={index} href={`#section-${index+1}`}>{translated(section.heading,locale)}</a>)}</nav><div className="v2-prose">{article.sections.map((section,index)=><section id={`section-${index+1}`} key={index}><h2>{translated(section.heading,locale)}</h2><p>{translated(section.body,locale)}</p></section>)}{article.sources?.length?<section><h2>{text.sources}</h2><ul>{article.sources.map(source=><li key={source.url}><a href={source.url} rel="noopener noreferrer">{source.label} ↗</a></li>)}</ul></section>:null}<Link className="v2-button" href={v2Path(locale,'tools',article.art==='numbers'?'odds-calculator':'tactical-board')}>{article.art==='numbers'?text.calculator:text.tactics}<Icon name="arrow"/></Link></div></div></article><section className="v2-section"><h2>{text.related}</h2><div className="v2-story-grid">{articles.filter(item=>item.id!==article.id).slice(0,3).map(item=><ArticleCard key={item.id} article={item} locale={locale}/>)}</div></section><JsonLd value={{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{name:text.home,item:siteOrigin+v2Path(locale)},{name:text[article.category],item:siteOrigin+v2Path(locale,article.category)},{name:title,item:siteOrigin+v2Path(locale,article.category,article.id)}].map((item,index)=>({'@type':'ListItem',position:index+1,...item}))}}/><JsonLd value={{'@context':'https://schema.org','@type':'Article',headline:title,description:translated(article.summary,locale),author:{'@type':'Organization',name:'LivaSports',url:siteOrigin+v2Path(locale,'about')},publisher:{'@type':'Organization',name:'LivaSports'},inLanguage:languageTags[locale],mainEntityOfPage:siteOrigin+v2Path(locale,article.category,article.id)}}/></V2Shell>;}
export function EditorialDetail({locale,section,slug}:{locale:InterfaceLocale;section:Section;slug:string}){
  if(section==='leagues'&&competitionById(slug))permanentRedirect(competitionPath(locale,slug));
  const text=v2Copy(locale);
  if(section==='analysis'||section==='guides'){const article=findArticle(slug);if(!article||article.category!==section)notFound();return <ArticlePage locale={locale} article={article}/>;}
  if(section==='tools'){
    const index=toolIds.findIndex(id=>id===slug);if(index<0)notFound();const title=[text.lineup,text.tactics,text.calculator,text.quiz][index],lead=[text.lineupLead,text.tacticsLead,text.calculatorLead,text.quizLead][index];
    return <V2Shell locale={locale}><nav className="v2-breadcrumb"><Link href={v2Path(locale,'tools')}>← {text.tools}</Link></nav><Heading title={title} lead={lead} eyebrow="LIVASPORTS LAB"/>{index<2?<FootballBoard locale={locale} tactical={index===1}/>:index===2?<OddsCalculator locale={locale}/>:<FootballQuiz locale={locale}/>}<section className="v2-section"><h2>{text.related}</h2><div className="v2-story-grid">{articles.filter(article=>index===2?article.art==='numbers':article.category==='analysis').slice(0,2).map(article=><ArticleCard key={article.id} article={article} locale={locale}/>)}</div></section></V2Shell>;
  }
  if(section==='leagues')notFound();
  if(section==='bookmakers'){
    const book=reviewIdentities.find(item=>item.id===slug);if(!book)notFound();return <V2Shell locale={locale}><nav className="v2-breadcrumb"><Link href={v2Path(locale,'bookmakers')}>← {text.bookmakers}</Link></nav><div className="v2-review-heading"><OperatorLogoSlot name={book.name} asset={book.logo}/><Heading title={book.name} lead={text.notOffer}/></div><article className="v2-prose"><h2>{text.reviewTitle}</h2><p>{text.reviewBody}</p>{reviewSections.map(section=><section key={section.title.en}><h2>{translated(section.title,locale)}</h2><p>{translated(section.body,locale)}</p></section>)}<h2>{text.verify}</h2><ul>{[text.checkLicense,text.checkWithdraw,text.checkBonus,text.checkSafety].map(item=><li key={item}>{item}</li>)}</ul><h2>{text.methodology}</h2><p>{text.methodologyBody}</p><Link href={legalPath(locale,'disclosure')}>{text.disclosure}</Link><p><Link href={legalPath(locale,'responsible')}>{text.responsible}</Link></p></article><GeoCommercialSection locale={locale} placementId="v2-review" operatorId={book.id}/></V2Shell>;
  }
  notFound();
}
export function editorialDocumentParams(locale:InterfaceLocale){return (Object.keys(namespaces.en) as Section[]).filter(section=>section!=='football').map(section=>({document:namespaces[editorialLanguage(locale)][section]}));}
export function editorialDetailParams(locale:InterfaceLocale){return [...articles.map(article=>({editorial:[namespaces[editorialLanguage(locale)][article.category],article.id]})),...leagues.map(league=>({editorial:[namespaces[editorialLanguage(locale)].leagues,league.id]})),...toolIds.map(id=>({editorial:[namespaces[editorialLanguage(locale)].tools,id]})),...reviewIdentities.map(book=>({editorial:[namespaces[editorialLanguage(locale)].bookmakers,book.id]}))];}
export function resolveEditorialDetail(locale:InterfaceLocale,parts:string[]){if(parts.length!==2)notFound();const section=sectionFromSlug(locale,parts[0]);if(!section)notFound();return {section,slug:parts[1]};}
export function v2Metadata(locale:InterfaceLocale,section?:Section,slug?:string):Metadata{
  const text=v2Copy(locale),article=slug?findArticle(slug):undefined,league=leagues.find(item=>item.id===slug),book=reviewIdentities.find(item=>item.id===slug),toolIndex=toolIds.findIndex(id=>id===slug);
  const title=article?translated(article.title,locale):league?.name??book?.name??(toolIndex>=0?[text.lineup,text.tactics,text.calculator,text.quiz][toolIndex]:section?text[section]:locale==='en'?'Your world of sport':locale==='br'?'Seu mundo de esporte':'Tu mundo del deporte');
  const description=article?translated(article.summary,locale):league?translated(league.intro,locale):section==='tools'?text.toolsLead:section==='bookmakers'?text.neutralBooksText:sportsCopy(locale).lead;
  const paths=Object.fromEntries(interfaceLocales.map(value=>[value,v2Path(value,section,slug)])) as Record<InterfaceLocale,string>;
  return {metadataBase:new URL(siteOrigin),title,description,alternates:localizedAlternates(locale,paths),...(section==='search'||(section==='bookmakers'&&slug)?{robots:{index:false,follow:true}}:{}),openGraph:{title,description,type:article?'article':'website',siteName:'LivaSports',url:paths[locale],locale:languageTags[locale].replace('-','_'),images:[{url:'/opengraph-image.png',width:1200,height:630,alt:'LivaSports — sports stories, guides and tools'}]},other:{'content-language':languageTags[locale]}};
}
