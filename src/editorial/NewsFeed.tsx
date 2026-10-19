'use client';
import {useState,useSyncExternalStore} from 'react';
import {publicLanguage,type InterfaceLocale} from '@/localization/interface';
import {isRecentNews,newsCountries,newsCompetitions,newsSports,topicsForSport,resolveNewsTranslation,type NewsCompetition,type NewsSport,type PublishedNews} from './model';
import {countryName,newsCopy,topicName,sportName} from './copy';
import {publicNewsFeed} from './coverage';
import {NewsCard} from './NewsCards';
import {newsFeedFilters,newsFeedSearch,type NewsFeedFilters} from './feed-query';

const filterEvent='livasports:news-filters';
function subscribeFilters(notify:()=>void){window.addEventListener('popstate',notify);window.addEventListener(filterEvent,notify);return()=>{window.removeEventListener('popstate',notify);window.removeEventListener(filterEvent,notify);};}
const currentSearch=()=>window.location.search,serverSearch=()=>'';

export function NewsFeed({items,locale,initialTime,initialSport='all'}:{items:PublishedNews[];locale:InterfaceLocale;initialTime:string;initialSport?:NewsSport|'all'}){
  const search=useSyncExternalStore(subscribeFilters,currentSearch,serverSearch),{country,topic,sport}=newsFeedFilters(search,initialSport),[limit,setLimit]=useState(6);
  const selectFilters=(patch:Partial<NewsFeedFilters>)=>{
    const filters={country,topic,sport,...patch},query=newsFeedSearch(window.location.search,filters);
    window.history.replaceState(window.history.state,'',window.location.pathname+query+window.location.hash);
    window.dispatchEvent(new Event(filterEvent));setLimit(6);
  };
  const now=new Date(initialTime),text=newsCopy(locale),filtered=publicNewsFeed(items,{country,topic,sport},now).filter(item=>resolveNewsTranslation(item,publicLanguage(locale))),topics=sport==='all'?newsCompetitions:topicsForSport(sport);
  const recent=filtered.some(item=>isRecentNews(item,new Date(initialTime)));
  return <section className="v2-section ed-feed" aria-labelledby="news-feed-heading"><div className="v2-section-heading"><h2 id="news-feed-heading">{recent?text.latest:text.archive}</h2><span className="ed-feed-count" aria-live="polite">{filtered.length}</span></div>
    <div className="ed-filters"><div className="ed-country-filters" aria-label={locale==='en'?'News regions':locale==='br'?'Regiões das notícias':'Regiones de noticias'}>{(['all',...newsCountries] as const).map(value=><button type="button" key={value} aria-pressed={country===value} onClick={()=>selectFilters({country:value})}>{value==='all'?text.all:countryName(value,locale)}</button>)}</div><label><span className="sr-only">{text.sport}</span><select value={sport} onChange={event=>selectFilters({sport:event.target.value as NewsSport|'all',topic:'all'})}><option value="all">{text.allSports}</option>{newsSports.map(value=><option key={value} value={value}>{sportName(value,locale)}</option>)}</select></label><label><span className="sr-only">{text.competition}</span><select value={topic} onChange={event=>selectFilters({topic:event.target.value as NewsCompetition|'all'})}><option value="all">{text.allTopics}</option>{topics.map(value=><option key={value} value={value}>{topicName(value,locale)}</option>)}</select></label></div>
    {filtered.length?<div className="ed-feed-grid">{filtered.map((item,index)=><div key={item.slug} hidden={index>=limit}><NewsCard item={item} locale={locale} now={now}/></div>)}</div>:<p className="ed-empty">{text.empty}</p>}
    {filtered.length>limit?<button className="v2-button v2-button-outline ed-load-more" type="button" onClick={()=>setLimit(value=>value+6)}>{text.more} ↓</button>:null}
  </section>;
}
