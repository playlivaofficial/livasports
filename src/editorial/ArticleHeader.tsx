import Link from 'next/link';
import {publicLanguage,type InterfaceLocale} from '@/localization/interface';
import {competitionById,competitionPath,sportsPath} from '@/multisport/catalog';
import {newsSport,resolveNewsTranslation,type PublishedNews} from './model';
import {countryName,newsCopy,newsDate,newsPath,sportName,topicName} from './copy';
import {NewsCard,NewsLanguageNotice} from './NewsCards';
import {usablePublishedNews} from './presentation';

/** Links describe the verified taxonomy, never a guessed matchup or a decorative crest. */
export function ArticleHeader({item,locale}:{item:PublishedNews;locale:InterfaceLocale}){
 const translation=resolveNewsTranslation(item,publicLanguage(locale));if(!translation)return null;
 const text=newsCopy(locale),sport=newsSport(item),competition=competitionById(item.competition);
 return <header className="ed-article-header ed-premium-header">
  <nav className="ed-article-topics" aria-label={sportName(sport,locale)}>
   <Link href={sportsPath(locale,sport)}>{sportName(sport,locale)}</Link>
   {competition?<Link href={competitionPath(locale,competition.id)}>{topicName(item.competition,locale)} <span aria-hidden="true">↗</span></Link>:<span>{topicName(item.competition,locale)}</span>}
   <span>{countryName(item.country,locale)}</span>
  </nav>
  <NewsLanguageNotice translation={translation} locale={locale}/>
  <h1 lang={translation.language}>{translation.title}</h1>
  <p className="ed-standfirst" lang={translation.language}>{translation.summary}</p>
  <div className="ed-article-byline"><span className="ed-editorial-signature"><span aria-hidden="true">L</span>{text.editorial}</span><span>{text.sourceDate}<time dateTime={item.sourcePublishedOn}>{newsDate(item.sourcePublishedOn,locale)}</time></span><a href="#article-source">{text.source} <span aria-hidden="true">↘</span></a></div>
 </header>;
}

export function relatedStories(item:PublishedNews,items:readonly PublishedNews[],locale:InterfaceLocale,now=new Date()){
 const seen=new Set([item.slug]);
 return items.filter(candidate=>{
  if(seen.has(candidate.slug)||newsSport(candidate)!==newsSport(item)||!usablePublishedNews(candidate,now)||!resolveNewsTranslation(candidate,publicLanguage(locale)))return false;
  seen.add(candidate.slug);return true;
 }).sort((a,b)=>Number(b.competition===item.competition)-Number(a.competition===item.competition)||b.sourcePublishedOn.localeCompare(a.sourcePublishedOn)||a.slug.localeCompare(b.slug)).slice(0,3);
}
export function RelatedStories({item,items,locale,now=new Date()}:{item:PublishedNews;items:readonly PublishedNews[];locale:InterfaceLocale;now?:Date}){
 const related=relatedStories(item,items,locale,now);if(!related.length)return null;
 const heading={en:'More on this sport',es:'Más sobre este deporte',pt:'Mais sobre este esporte'}[publicLanguage(locale)];
 return <section className="ed-article-related" aria-label={heading}><div className="v2-section-heading"><h2>{heading}</h2><Link href={newsPath(locale)}>{newsCopy(locale).view} ↗</Link></div><div>{related.map(story=><NewsCard item={story} locale={locale} now={now} key={story.slug}/>)}</div></section>;
}
