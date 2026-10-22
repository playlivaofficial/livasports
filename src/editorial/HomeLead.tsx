import Link from 'next/link';
import {publicLanguage,type InterfaceLocale} from '@/localization/interface';
import {competitionById,competitionPath,sportsPath} from '@/multisport/catalog';
import {newsSport,resolveNewsTranslation,type PublishedNews} from './model';
import {newsCopy,newsDate,newsPath,sportName,topicName} from './copy';
import {NewsLanguageNotice} from './NewsCards';
import {usablePublishedNews} from './presentation';
import {ContextScene,contextScene} from './ContextScene';

export function selectTextLead(items:readonly PublishedNews[],locale:InterfaceLocale,now=new Date()){
 return items.filter(item=>usablePublishedNews(item,now)&&resolveNewsTranslation(item,publicLanguage(locale)))
  .sort((a,b)=>b.sourcePublishedOn.localeCompare(a.sourcePublishedOn)||b.publishedAt.localeCompare(a.publishedAt)||a.slug.localeCompare(b.slug))[0]??null;
}
/** A real published headline, not generic marketing copy or a pretend event photograph. */
export function HomeTextLead({item,locale}:{item:PublishedNews;locale:InterfaceLocale}){
 const translation=resolveNewsTranslation(item,publicLanguage(locale));if(!translation)return null;
 const sport=newsSport(item),competition=competitionById(item.competition),text=newsCopy(locale);
 return <section className={`ed-home-lead${contextScene(item)?' v3-visual-lead':''}`} aria-labelledby="home-lead-title">
  <ContextScene item={item} locale={locale}/>
  <div className="v3-lead-copy">
  <div className="ed-home-lead-meta"><Link href={sportsPath(locale,sport)}>{sportName(sport,locale)}</Link><span>{topicName(item.competition,locale)}</span><time dateTime={item.sourcePublishedOn}>{newsDate(item.sourcePublishedOn,locale)}</time></div>
  <NewsLanguageNotice translation={translation} locale={locale}/>
  <h1 id="home-lead-title" lang={translation.language}><Link href={newsPath(locale,item.slug)}>{translation.title}</Link></h1>
  <p lang={translation.language}>{translation.summary}</p>
  <div className="ed-home-lead-actions"><Link className="v2-button" href={newsPath(locale,item.slug)}>{text.read} <span aria-hidden="true">↗</span></Link>{competition?<Link className="ed-lead-competition" href={competitionPath(locale,competition.id)}>{topicName(item.competition,locale)} →</Link>:null}</div>
  <div className="ed-home-lead-source"><span>{text.source}</span><a href={item.sourceUrl} rel="noopener noreferrer">{item.sourceName} ↗</a></div>
  </div>
 </section>;
}
