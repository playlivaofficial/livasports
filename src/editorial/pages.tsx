import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {interfaceLocales,type InterfaceLocale} from '@/localization/interface';
import {localizedAlternates,siteOrigin} from '@/seo/policy';
import {serializeJsonLd} from '@/seo/json-ld';
import {V2Shell} from '@/v2/pages';
import {v2Path} from '@/v2/routes';
import {publishedNews,publishedStory} from './server';
import {newsCopy,newsDate,newsPath} from './copy';
import {NewsFeed} from './NewsFeed';
import {NewsPhoto,PhotoCredit} from './NewsCards';
import {ArticleHeader,RelatedStories} from './ArticleHeader';
import {editorialAssets} from './assets';
import {newsTranslationRoutes,usablePublishedNews} from './presentation';
import {publishedSnapshots} from '@/multisport/server';
import {StoryContext} from './StoryContext';
import {AutomatedBriefDisclosure} from './automation/Disclosure';
import {ContextScene} from './ContextScene';
import {FootballReading} from './FootballReading';
import {SourceAttachment} from './SourceAttachment';

export async function NewsIndexPage({locale}:{locale:InterfaceLocale}){const text=newsCopy(locale),items=await publishedNews();return <V2Shell locale={locale}><div className="v2-page-heading ed-index-heading"><span className="v2-eyebrow">LIVASPORTS EDITORIAL</span><h1>{text.news}<em>.</em></h1><p>{text.lead}</p></div><NewsFeed items={items} locale={locale} initialTime={new Date().toISOString()}/></V2Shell>;}
export async function NewsArticlePage({locale,slug}:{locale:InterfaceLocale;slug:string}){
  const item=await publishedStory(slug);if(!item||!usablePublishedNews(item,new Date()))notFound();
  const presentation=newsTranslationRoutes(item,locale);if(!presentation)notFound();
  const {translation}=presentation;
  const snapshots=await publishedSnapshots().catch(()=>[]);
  const text=newsCopy(locale),image=item.image==='none'?null:editorialAssets[item.image];
  return <V2Shell locale={locale}><nav className="v2-breadcrumb" aria-label={text.back}><Link href={newsPath(locale)}>← {text.back}</Link></nav>
    <article className="ed-article"><ArticleHeader item={item} locale={locale}/>
    {item.image==='none'?<ContextScene item={item} locale={locale}/>:null}
    {image&&item.image!=='none'?<figure><NewsPhoto id={item.image} locale={locale} priority/><figcaption><span lang={translation.language}>{translation.imageCaption}</span><PhotoCredit id={item.image} locale={locale}/></figcaption></figure>:null}
    <StoryContext story={item} snapshots={snapshots} locale={locale}/>
    <div className="ed-article-body"><span className="ed-kicker">{text.brief}</span><div className="ed-story-text" lang={translation.language}>{translation.body.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div><aside className="ed-source" id="article-source"><strong>{text.source}</strong><a href={item.sourceUrl} rel="noopener noreferrer">{item.sourceName} ↗</a><SourceAttachment sourceUrl={item.sourceUrl} locale={locale}/><p>{text.original}</p><AutomatedBriefDisclosure item={item} locale={locale}/><dl><div><dt>{text.published}</dt><dd><time dateTime={item.publishedAt}>{newsDate(item.publishedAt,locale)}</time></dd></div>{item.updatedAt!==item.publishedAt?<div><dt>{text.updated}</dt><dd><time dateTime={item.updatedAt}>{newsDate(item.updatedAt,locale)}</time></dd></div>:null}<div><dt>{text.verified}</dt><dd><time dateTime={item.verifiedAt}>{newsDate(item.verifiedAt,locale)}</time></dd></div></dl></aside><Link className="v2-button v2-button-outline" href={newsPath(locale)}>{text.back} →</Link></div><RelatedStories item={item} items={await publishedNews()} locale={locale}/>{(item.sport??'football')==='football'?<FootballReading locale={locale}/>:null}</article>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd({'@context':'https://schema.org','@type':'NewsArticle',headline:translation.title,description:translation.summary,datePublished:item.publishedAt,dateModified:item.updatedAt,inLanguage:presentation.contentLanguage,mainEntityOfPage:siteOrigin+presentation.canonical,citation:item.sourceUrl,author:{'@type':'Organization',name:'LivaSports editorial',url:siteOrigin+v2Path(locale,'about')},publisher:{'@type':'Organization',name:'LivaSports'},...(image?{image:siteOrigin+image.base+'-1280.webp'}:{})})}}/>
  </V2Shell>;
}
export async function newsMetadata(locale:InterfaceLocale,slug?:string):Promise<Metadata>{
  const text=newsCopy(locale),item=slug?await publishedStory(slug):null;if(slug&&(!item||!usablePublishedNews(item,new Date())))notFound();
  const presentation=item?newsTranslationRoutes(item,locale):null;if(item&&!presentation)notFound();
  const title=presentation?.translation.title??text.news,description=presentation?.translation.summary??text.lead;
  const paths=Object.fromEntries(interfaceLocales.map(value=>[value,newsPath(value,slug)])) as Record<InterfaceLocale,string>;
  return {metadataBase:new URL(siteOrigin),title,description,alternates:presentation?{canonical:presentation.canonical,languages:presentation.languages}:localizedAlternates(locale,paths),...(presentation&&!presentation.indexable?{robots:{index:false,follow:true}}:{}),...(presentation?{other:{'content-language':presentation.contentLanguage}}:{}),openGraph:{title,description,type:item?'article':'website',siteName:'LivaSports',url:presentation?.canonical??paths[locale],images:[{url:item&&item.image!=='none'?editorialAssets[item.image].base+'-1280.webp':'/opengraph-image.png',alt:item&&item.image!=='none'?presentation!.translation.imageCaption:'LivaSports — sports editorial'}]}};
}
