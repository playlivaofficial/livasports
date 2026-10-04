'use client';
import {useEffect,useState,useSyncExternalStore} from 'react';
import type {InterfaceLocale} from '@/localization/interface';
import {teamPath} from '@/localization/interface';
import {useTimeZone} from '@/localization/LocalizedTime';
import {teamHistoryKey,teamHistorySelection,type TeamHistoryProfile,type TeamHistorySelection} from '@/profiles/history-policy';
import {sportsCopy} from './copy';
import {competitionPath} from './policy';
import {MatchRowsView} from './MatchRowsView';
import type {SportsFixture} from './types';
import Link from './SportsLink';

export interface TeamHistoryData {rows:SportsFixture[];hasNext:boolean;}
const defaultKey='results:1:all';
const subscribe=(listener:()=>void)=>{window.addEventListener('popstate',listener);return()=>window.removeEventListener('popstate',listener);};
const querySnapshot=()=>window.location.search;
const serverSnapshot=()=>'';

/** The canonical HTML contains default history; filters hydrate without making the shell request-specific. */
export function TeamHistoryBrowser({profile,locale,initial,failed=false}:{profile:TeamHistoryProfile;locale:InterfaceLocale;initial:TeamHistoryData;failed?:boolean}){
  const query=useSyncExternalStore(subscribe,querySnapshot,serverSnapshot);
  const selection=teamHistorySelection(profile,new URLSearchParams(query));
  const key=teamHistoryKey(selection),{view,page,season}=selection;
  const [loaded,setLoaded]=useState<{key:string;data:TeamHistoryData;failed:boolean}>({key:defaultKey,data:initial,failed});
  const timeZone=useTimeZone(locale),t=sportsCopy[locale],path=teamPath(locale,profile.publicId,profile.name);
  useEffect(()=>{
    if(key===defaultKey)return;
    const controller=new AbortController();
    const params=new URLSearchParams({id:profile.publicId,locale,matches:view,p:String(page)});
    if(season)params.set('season',season);
    void fetch(`/api/profiles/team-history?${params}`,{signal:controller.signal,credentials:'omit'}).then(async response=>{
      if(!response.ok)throw new Error('HISTORY_UNAVAILABLE');
      const data=await response.json() as TeamHistoryData;
      if(!controller.signal.aborted)setLoaded({key,data,failed:false});
    }).catch(()=>{if(!controller.signal.aborted)setLoaded({key,data:{rows:[],hasNext:false},failed:true});});
    return()=>controller.abort();
  },[key,locale,page,profile.publicId,season,view]);
  const current=key===defaultKey?{data:initial,failed}:loaded;
  const pending=key!==defaultKey&&loaded.key!==key;
  const href=(next:TeamHistorySelection)=>{
    const params=new URLSearchParams(query);params.set('matches',next.view);params.delete('p');params.delete('season');
    if(next.page>1)params.set('p',String(next.page));if(next.season)params.set('season',next.season);
    return `${path}?${params}#matches`;
  };
  const navigate=(next:TeamHistorySelection)=>{window.history.pushState(null,'',href(next));window.dispatchEvent(new PopStateEvent('popstate'));};
  return <section id="matches" className="profile-panel sports-profile-history" aria-busy={pending||undefined}><h2>{t.history}</h2>
    <nav className="sports-section-tabs" aria-label={t.history}>{(['fixtures','results'] as const).map(next=><a key={next} href={href({view:next,page:1,season})} aria-current={view===next?'page':undefined} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate({view:next,page:1,season});}}}>{t[next]}</a>)}</nav>
    <form className="sports-season" action={path+'#matches'} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);navigate(teamHistorySelection(profile,new URLSearchParams({matches:view,season:String(form.get('season')??'')})));}}>
      <input type="hidden" name="matches" value={view}/><label htmlFor="team-history-season">{t.season}</label><select name="season" id="team-history-season" key={season??''} defaultValue={season??''}><option value="">{t.allSeasons}</option>{profile.competitions.map(c=><option key={c.seasonId} value={c.seasonId}>{c.competition} · {c.season}</option>)}</select><button type="submit">{t.apply}</button>
    </form>
    {pending?<p className="sports-empty" role="status">…</p>:current.failed?<p className="sports-empty">{t.unavailable}</p>:<MatchRowsView locale={locale} timeZone={timeZone} rows={current.data.rows} showCompetition empty={view==='results'?t.noResults:t.noFixtures}/>}
    <nav className="sports-pagination" aria-label={t.page}>{page>1?<a href={href({view,page:page-1,season})} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate({view,page:page-1,season});}}}>← {t.previous}</a>:<span/>}<span>{t.page} {page}</span>{!pending&&current.data.hasNext?<a href={href({view,page:page+1,season})} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate({view,page:page+1,season});}}}>{t.next} →</a>:<span/>}</nav>
    <div className="sports-profile-contexts">{profile.competitions.filter(c=>c.isCurrent).map(c=><Link prefetch={false} key={c.seasonId} href={competitionPath(locale,c.competitionSlug,{season:c.seasonId,tab:'standings'})}>{c.competition} · {t.standings}</Link>)}</div>
  </section>;
}
