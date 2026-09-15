'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import type {InterfaceLocale} from '@/localization/interface';
import {interfaceRoutes,playerPath,teamPath} from '@/localization/interface';
import {competitionPath} from '@/sports/policy';
import {sportsCopy} from '@/sports/copy';
import {countryMarkForSlug,countryMarkFromIso} from '@/sports/country-mark';
import {moveSearchActive,SEARCH_SUGGESTION_LIMIT} from '@/sports/search-rank';
import type {SportsSearchResult} from '@/sports/types';
import {TeamMark} from '@/components/sports/TeamMark';

const DEBOUNCE_MS=200;

function resultHref(locale:InterfaceLocale,row:SportsSearchResult):string {
  if(row.kind==='competition'&&row.slug)return competitionPath(locale,row.slug);
  if(row.kind==='team')return teamPath(locale,row.publicId,row.name);
  return playerPath(locale,row.publicId,row.name);
}

function resultMark(row:SportsSearchResult){
  if(row.kind==='competition'&&row.slug)return countryMarkForSlug(row.slug);
  return countryMarkFromIso(row.countryCode,row.context);
}

export function SportsSearchBox({locale,query}:{locale:InterfaceLocale;query:string}){
  const t=sportsCopy[locale];
  const listId=useId();
  const inputRef=useRef<HTMLInputElement>(null);
  const [value,setValue]=useState(query);
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(0);
  const [result,setResult]=useState<{q:string;rows:SportsSearchResult[];failed:boolean}|null>(null);
  const q=value.trim();
  useEffect(()=>{
    if(!q)return;
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      try{
        const response=await fetch(`/api/sports/search?locale=${locale}&q=${encodeURIComponent(q.slice(0,80))}`,{signal:controller.signal,headers:{Accept:'application/json'}});
        const body=await response.json() as {suggestions?:SportsSearchResult[];providerRequests?:number};
        if(!response.ok||body.providerRequests!==0||!Array.isArray(body.suggestions)||body.suggestions.length>SEARCH_SUGGESTION_LIMIT)throw new Error('SEARCH_UNAVAILABLE');
        setResult({q,rows:body.suggestions,failed:false});setActive(0);
      }catch(error){
        if((error as {name?:string}).name==='AbortError')return;
        setResult({q,rows:[],failed:true});
      }
    },DEBOUNCE_MS);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[locale,q]);
  const current=result?.q===q?result:null;
  const suggestions=current?.rows??[];
  const failed=current?.failed===true;
  const showList=open&&q.length>0;
  function go(row:SportsSearchResult){window.location.assign(resultHref(locale,row));}
  function onKeyDown(event:KeyboardEvent<HTMLInputElement>){
    if(!showList){if(event.key==='Escape'){(event.target as HTMLInputElement).blur();}return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){const key=event.key;event.preventDefault();setActive(i=>moveSearchActive(key,i,suggestions.length));}
    else if(event.key==='Enter'&&suggestions[active]){event.preventDefault();go(suggestions[active]);}
    else if(event.key==='Escape'){event.preventDefault();setOpen(false);}
  }
  return <form className="sports-search-form" action={interfaceRoutes[locale].football} role="search" onSubmit={event=>{if(suggestions[active]&&open){event.preventDefault();go(suggestions[active]);}}}>
    <label className="sr-only" htmlFor="football-search">{t.search}</label>
    <input id="football-search" ref={inputRef} type="search" name="q" value={value} placeholder={t.searchHint} maxLength={80} autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls={listId} aria-activedescendant={showList&&suggestions[active]?`${listId}-${active}`:undefined}
      onChange={event=>{setValue(event.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onKeyDown={onKeyDown}
      onBlur={()=>window.setTimeout(()=>setOpen(false),120)}/>
    <button type="submit">{t.searchGo}</button>
    {showList?<ul id={listId} className="sports-search-suggest" role="listbox" aria-label={t.search}>
      {failed?<li className="sports-search-empty" role="status">{t.unavailable}</li>
        :!current?<li className="sports-search-empty" role="status">{t.searchLoading}</li>
          :!suggestions.length?<li className="sports-search-empty" role="status">{t.searchEmpty}</li>
            :suggestions.map((row,index)=>{
              const mark=resultMark(row);
              return <li key={`${row.kind}:${row.publicId}`} id={`${listId}-${index}`} role="option" aria-selected={index===active}>
                <a className={index===active?'is-active':undefined} href={resultHref(locale,row)} onMouseDown={event=>event.preventDefault()} onClick={event=>{event.preventDefault();go(row);}}>
                  {row.kind==='team'?<TeamMark initials={row.name.slice(0,2)} imageUrl={row.imageUrl} size={26}/>:<span className="competition-nav-flag" aria-hidden="true">{mark.emoji}</span>}
                  <span className="sports-search-suggest-name">{row.name}</span>
                  <small>{t[row.kind]}</small>
                </a>
              </li>;
            })}
    </ul>:null}
  </form>;
}
