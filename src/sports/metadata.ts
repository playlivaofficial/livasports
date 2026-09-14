import type {Metadata} from 'next';
import {routeMetadata} from '@/config/metadata';
import {languageAlternates,type InterfaceLocale} from '@/localization/interface';
import {competitionName,competitionPath,sportsSeason} from './policy';
import {sportsCopy} from './copy';
export async function footballMetadata(locale:InterfaceLocale,searchParams:Promise<Record<string,string|string[]|undefined>>):Promise<Metadata>{
  const q=await searchParams,slug=typeof q.competition==='string'?q.competition:'',name=competitionName(locale,slug);
  if(!name)return {...routeMetadata(locale,'football'),...(q.q!==undefined?{robots:{index:false,follow:true}}:{})};
  const season=sportsSeason(q.season),path=(l:InterfaceLocale)=>competitionPath(l,slug,{season});
  const t=sportsCopy[locale],title=`${name}: ${t.fixtures.toLowerCase()}, ${t.results.toLowerCase()}`;
  return {title,description:`${name} — ${t.standings.toLowerCase()}, ${t.scorers.toLowerCase()}, ${t.teams.toLowerCase()}. ${t.coverage}`,
    ...(q.q!==undefined?{robots:{index:false,follow:true}}:{}),
    alternates:{canonical:path(locale),languages:languageAlternates(path('br'),path('mx'),path('en'))},
    openGraph:{type:'website',siteName:'LivaSports',title,url:path(locale)}};
}
