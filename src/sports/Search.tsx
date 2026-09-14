import Link from './SportsLink';
import {interfaceRoutes,teamPath,playerPath,type InterfaceLocale} from '@/localization/interface';
import {sportsCopy} from './copy';
import {competitionPath,sportsQuery} from './policy';
import {searchSports} from './runtime';
export async function SportsSearch({locale,query}:{locale:InterfaceLocale;query:unknown}){
  const t=sportsCopy[locale],q=sportsQuery(query);
  let rows:Awaited<ReturnType<typeof searchSports>>=[];let failed=false;
  if(q.length>=2){try{rows=await searchSports(q,locale);}catch{failed=true;}}
  return <section className="sports-search" id="sports-search" aria-label={t.search}>
    <form action={interfaceRoutes[locale].football} role="search"><label className="sr-only" htmlFor="football-search">{t.search}</label><input id="football-search" type="search" name="q" defaultValue={q} placeholder={t.searchHint} maxLength={80} autoComplete="off"/><button type="submit">{t.searchGo}</button></form>
    {query!==undefined?<div className="sports-search-results" aria-live="polite"><h2>{t.search}{q?`: ${q}`:''}</h2>{failed?<p>{t.unavailable}</p>:q.length<2?<p>{t.searchStart}</p>:!rows.length?<p>{t.searchEmpty}</p>:rows.map(r=><Link prefetch={false} key={`${r.kind}:${r.publicId}`} href={r.kind==='competition'?competitionPath(locale,r.slug!):r.kind==='team'?teamPath(locale,r.publicId,r.name):playerPath(locale,r.publicId,r.name)}><span>{r.name}</span><small>{t[r.kind]}</small></Link>)}</div>:null}
  </section>;
}
