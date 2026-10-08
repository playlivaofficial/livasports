'use client';
import {useEffect,useState} from 'react';
import Link from '@/sports/SportsLink';
import {teamPath,translatedPath,type InterfaceLocale} from '@/localization/interface';
import {LocalizedTimeText} from '@/localization/LocalizedTime';
import {competitionName,competitionPath} from '@/sports/policy';
import {geoProfile,isCoreGeo,type Geo} from '@/config/geo';
import {usePublicProductGeo} from '@/localization/PublicPresentation';
import type {GrowthSurface,PriorityLink} from './prominence-types';

export function GrowthCards({locale,surface,geo,rows}:{locale:InterfaceLocale;surface:GrowthSurface;geo:Geo;rows:PriorityLink[]}){
  if(!isCoreGeo(geo)||!rows.length)return null;
  const profile=geoProfile(geo),current=rows.find(row=>row.current),links=rows.filter(row=>!row.current);
  const text=locale==='en'?{focus:'In focus',matches:'Matches to follow',context:'Context and next matches',competition:'Competition',explore:'Explore'}
    :locale==='br'?{focus:'Em foco',matches:'Jogos para acompanhar',context:'Contexto e próximos jogos',competition:'Competição',explore:'Explorar'}
    :{focus:'En foco',matches:'Partidos para seguir',context:'Contexto y próximos partidos',competition:'Competición',explore:'Explorar'};
  const country=locale==='en'?{MX:'Mexico',CO:'Colombia',PE:'Peru'}[geo]:locale==='br'?{MX:'México',CO:'Colômbia',PE:'Peru'}[geo]:profile.countryName;
  return <section className="growth-prominence" data-growth-geo={geo} aria-labelledby={`growth-priority-${surface.kind.toLowerCase()}`}>
    <header><span>{text.focus} · {country}</span><h2 id={`growth-priority-${surface.kind.toLowerCase()}`}>{surface.kind==='MATCH'?text.context:text.matches}</h2></header>
    {current?.context?<p className="growth-prominence-context">{locale==='br'||locale==='en'?`${current.home} × ${current.away} · ${competitionName(locale,current.competitionSlug)??current.competition}`:current.context}</p>:null}
    {links.length?<div className="growth-prominence-links">{links.map(row=><article className="growth-prominence-item" key={row.fixtureId} data-fixture-id={row.fixtureId} data-priority-rank={row.rank}>
      <Link className="growth-fixture-link" href={translatedPath(new URL(row.canonicalUrl).pathname,locale)}>
        <span>#{row.rank} · {competitionName(locale,row.competitionSlug)??row.competition}</span><strong>{row.home} × {row.away}</strong><time dateTime={row.kickoff}><LocalizedTimeText value={row.kickoff} locale={locale} fallbackTimeZone={profile.timeZone} options={{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}}/></time>
      </Link><nav className="growth-context-links" aria-label={`${text.explore} ${row.home} x ${row.away}`}>
        <Link href={competitionPath(locale,row.competitionSlug)}>{text.competition}</Link>
        <Link href={teamPath(locale,row.homePublicId,row.home)}>{row.home}</Link>
        <Link href={teamPath(locale,row.awayPublicId,row.away)}>{row.away}</Link>
      </nav></article>)}</div>:null}
  </section>;
}

/** Shared editorial HTML is independent of headers/cookies. Private reads never enter ISR. */
export function GrowthExperience({locale,surface,initialGeo,initialRows}:{locale:InterfaceLocale;surface:GrowthSurface;initialGeo:Geo;initialRows:PriorityLink[]}){
  const {geo,ready}=usePublicProductGeo(),signature=JSON.stringify(surface);
  const [privateRows,setPrivateRows]=useState<{key:string;rows:PriorityLink[]}|null>(null);
  const key=`${geo}:${locale}:${signature}`;
  useEffect(()=>{
    if(!ready||!isCoreGeo(geo)||geo===initialGeo)return;
    const controller=new AbortController(),params=new URLSearchParams({locale,...JSON.parse(signature)});
    void fetch('/api/growth/prominence?'+params,{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(r=>r.ok?r.json():null).then(body=>{if(!controller.signal.aborted&&body?.geo===geo&&Array.isArray(body.rows))setPrivateRows({key,rows:body.rows});}).catch(()=>{});
    return()=>controller.abort();
  },[geo,ready,initialGeo,locale,signature,key]);
  const displayedGeo=ready?geo:initialGeo;
  const rows=!ready||geo===initialGeo?initialRows:privateRows?.key===key?privateRows.rows:[];
  return <GrowthCards locale={locale} surface={surface} geo={displayedGeo} rows={rows}/>;
}
