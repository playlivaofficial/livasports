'use client';
import {useState} from 'react';
import Link from 'next/link';
import {publicLanguage,type InterfaceLocale} from '@/localization/interface';
import {articles,translated} from './content';
import {competitions,competitionPath,sportName,type CatalogSport} from '@/multisport/catalog';
import {v2Copy} from './copy';
import {v2Path,toolIds} from './routes';
import {resolveNewsTranslation,type PublishedNews,type ResolvedNewsTranslation,type NewsLanguage} from '@/editorial/model';
import {newsPath} from '@/editorial/copy';
import {NewsLanguageNotice} from '@/editorial/NewsCards';
import {usablePublishedNews} from '@/editorial/presentation';
interface SearchItem {title:string;detail:string;path:string;searchTerms?:string;language?:NewsLanguage;translation?:ResolvedNewsTranslation}
export function EditorialSearch({locale,news=[],initialTime}:{locale:InterfaceLocale;news?:PublishedNews[];initialTime:string}){
  const text=v2Copy(locale),[query,setQuery]=useState('');
  const inventory:SearchItem[]=[...articles.map(article=>({title:translated(article.title,locale),detail:translated(article.summary,locale),path:v2Path(locale,article.category,article.id)})),...competitions.map(competition=>({title:competition.officialName,detail:`${sportName(competition.sport as CatalogSport,locale)} · ${competition.region}`,path:competitionPath(locale,competition.id),searchTerms:`${competition.id} ${competition.id.replaceAll('-',' ')}`})),...toolIds.map((id,i)=>({title:[text.lineup,text.tactics,text.calculator,text.quiz][i],detail:text.tools,path:v2Path(locale,'tools',id)}))];
  const normalize=(value:string)=>value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  const results:SearchItem[]=[...news.flatMap<SearchItem>(item=>{if(!usablePublishedNews(item,new Date(initialTime)))return [];const translation=resolveNewsTranslation(item,publicLanguage(locale));return translation?[{title:translation.title,detail:translation.summary,path:newsPath(locale,item.slug),language:translation.language,translation}]:[];}),...inventory].filter(item=>normalize(`${item.title} ${item.detail} ${item.searchTerms??''}`).includes(normalize(query.trim())));
  return <div className="v2-search"><label className="sr-only" htmlFor="editorial-search">{text.searchLabel}</label><input id="editorial-search" type="search" maxLength={100} value={query} placeholder={text.searchLabel} onChange={event=>setQuery(event.target.value)}/><p role="status">{query?`${results.length} · ${text.results}`:text.searchPrompt}</p><div className="v2-search-results">{results.map(item=><Link key={item.path} href={item.path}>{item.translation?<NewsLanguageNotice translation={item.translation} locale={locale}/>:null}<strong lang={item.language}>{item.title}</strong><span lang={item.language}>{item.detail}</span><b aria-hidden="true">↗</b></Link>)}</div>{!results.length?<p>{text.searchEmpty}</p>:null}</div>;
}
