'use client';
import {useState} from 'react';
import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {articles,translated} from './content';
import {leagues,leagueCountry} from './leagues';
import {v2Copy} from './copy';
import {v2Path,toolIds} from './routes';
export function EditorialSearch({locale}:{locale:InterfaceLocale}){
  const text=v2Copy(locale),[query,setQuery]=useState('');
  const inventory=[...articles.map(article=>({title:translated(article.title,locale),detail:translated(article.summary,locale),path:v2Path(locale,article.category,article.id)})),...leagues.map(league=>({title:league.name,detail:leagueCountry(league,locale),path:v2Path(locale,'leagues',league.id)})),...toolIds.map((id,i)=>({title:[text.lineup,text.tactics,text.calculator,text.quiz][i],detail:text.tools,path:v2Path(locale,'tools',id)}))];
  const normalize=(value:string)=>value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  const results=inventory.filter(item=>normalize(`${item.title} ${item.detail}`).includes(normalize(query.trim())));
  return <div className="v2-search"><label className="sr-only" htmlFor="editorial-search">{text.searchLabel}</label><input id="editorial-search" type="search" maxLength={100} value={query} placeholder={text.searchLabel} onChange={event=>setQuery(event.target.value)}/><p role="status">{query?`${results.length} · ${text.results}`:text.searchPrompt}</p><div className="v2-search-results">{results.map(item=><Link key={item.path} href={item.path}><strong>{item.title}</strong><span>{item.detail}</span><b aria-hidden="true">↗</b></Link>)}</div>{!results.length?<p>{text.searchEmpty}</p>:null}</div>;
}
