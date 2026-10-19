'use client';
import {useState} from 'react';
import type {InterfaceLocale} from '@/localization/interface';
import {isRecentNews,newsCountries,newsCompetitions,type PublishedNews} from './model';
import {countryName,newsCopy,topicName} from './copy';
import {NewsCard} from './NewsCards';

export function NewsFeed({items,locale,initialTime}:{items:PublishedNews[];locale:InterfaceLocale;initialTime:string}){
  const [country,setCountry]=useState('all'),[topic,setTopic]=useState('all'),[limit,setLimit]=useState(6);
  const text=newsCopy(locale),filtered=items.filter(item=>(country==='all'||country===item.country)&&(topic==='all'||topic===item.competition));
  const recent=filtered.some(item=>isRecentNews(item,new Date(initialTime)));
  return <section className="v2-section ed-feed" aria-labelledby="news-feed-heading"><div className="v2-section-heading"><h2 id="news-feed-heading">{recent?text.latest:text.archive}</h2><span className="ed-feed-count" aria-live="polite">{filtered.length}</span></div>
    <div className="ed-filters"><div className="ed-country-filters" aria-label={text.all}>{['all',...newsCountries].map(value=><button type="button" key={value} aria-pressed={country===value} onClick={()=>{setCountry(value);setLimit(6);}}>{value==='all'?text.all:countryName(value as typeof newsCountries[number],locale)}</button>)}</div><label><span className="sr-only">{text.competition}</span><select value={topic} onChange={event=>{setTopic(event.target.value);setLimit(6);}}><option value="all">{text.allTopics}</option>{newsCompetitions.map(value=><option key={value} value={value}>{topicName(value,locale)}</option>)}</select></label></div>
    {filtered.length?<div className="ed-feed-grid">{filtered.map((item,index)=><div key={item.slug} hidden={index>=limit}><NewsCard item={item} locale={locale}/></div>)}</div>:<p className="ed-empty">{text.empty}</p>}
    {filtered.length>limit?<button className="v2-button v2-button-outline ed-load-more" type="button" onClick={()=>setLimit(value=>value+6)}>{text.more} ↓</button>:null}
  </section>;
}
