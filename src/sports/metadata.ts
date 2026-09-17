import type {Metadata} from 'next';
import {routeMetadata} from '@/config/metadata';
import {type InterfaceLocale} from '@/localization/interface';
import {competitionCanonical,competitionRequest,localizedAlternates,noindexRobots,openGraphLocale,type ResolvedCompetitionView} from '@/seo/policy';
import {competitionName} from './policy';
import {sportsCopy} from './copy';
import type {CompetitionHub} from './types';
import {loadCompetition} from './runtime';
import {openGraphImages} from '@/seo/open-graph';

/** Resolve the view the board will render for this hub, so canonical/title describe the actual season, tab and page. */
export function resolvedCompetitionView(hub:CompetitionHub,tab:ResolvedCompetitionView['tab'],page:number):ResolvedCompetitionView{
  const paginated=tab==='fixtures'||tab==='results';
  const total=tab==='results'?hub.counts.results:Math.max(hub.counts.upcoming,hub.pendingTotal);
  // The fixtures tab also shows up to five recent results, so an off-season hub with history stays useful.
  const rows={fixtures:hub.counts.upcoming+hub.pendingTotal+Math.min(hub.results.length,5),results:hub.counts.results,standings:hub.standings.length,scorers:hub.scorers.length,teams:hub.teams.length}[tab];
  return {slug:hub.slug,tab,seasonId:hub.season?.id??null,defaultSeasonId:hub.defaultSeasonId,page:paginated?page:1,pages:paginated?Math.max(1,Math.ceil(total/hub.pageSize)):1,rows};
}

const tabTitles={
  br:{fixtures:'próximos jogos e resultados',results:'resultados',standings:'classificação',scorers:'artilharia',teams:'times'},
  mx:{fixtures:'próximos partidos y resultados',results:'resultados',standings:'clasificación',scorers:'goleadores',teams:'equipos'},
  en:{fixtures:'fixtures and results',results:'results',standings:'standings',scorers:'top scorers',teams:'teams'},
} as const;
const pageWord={br:'página',mx:'página',en:'page'} as const;

export function competitionMetadata(locale:InterfaceLocale,hub:CompetitionHub,view:ResolvedCompetitionView,search:boolean):Metadata{
  const t=sportsCopy[locale],name=hub.name,canonical=competitionCanonical(view);
  // Only a non-default season is part of the title; the default season is the competition's current identity.
  const seasonLabel=canonical.season&&hub.season?` ${hub.season.name}`:'';
  const pageLabel=canonical.page>1?` · ${pageWord[locale]} ${canonical.page}`:'';
  const title=`${name}${seasonLabel}: ${tabTitles[locale][view.tab]}${pageLabel}`;
  const seasonSentence=hub.season?(locale==='br'?`Temporada ${hub.season.name}.`:locale==='mx'?`Temporada ${hub.season.name}.`:`${hub.season.name} season.`):'';
  const description=`${name} — ${t.fixtures.toLowerCase()}, ${t.results.toLowerCase()}, ${t.standings.toLowerCase()}, ${t.scorers.toLowerCase()}, ${t.teams.toLowerCase()}. ${seasonSentence} ${t.coverage}`.replace(/\s+/g,' ').trim();
  const indexable=canonical.indexable&&!search;
  return {title,description,
    robots:indexable?{index:true,follow:true}:noindexRobots,
    ...(indexable?{alternates:localizedAlternates(locale,canonical.paths)}:{alternates:{canonical:canonical.paths[locale]}}),
    openGraph:{type:'website',siteName:'LivaSports',title,description,url:canonical.paths[locale],locale:openGraphLocale(locale),images:openGraphImages()}};
}

export async function footballMetadata(locale:InterfaceLocale,searchParams:Promise<Record<string,string|string[]|undefined>>):Promise<Metadata>{
  const q=await searchParams,request=competitionRequest(q);
  const hubMetadata=request.known?await loadHubMetadata(locale,request):null;
  if(hubMetadata)return hubMetadata;
  if(request.slug&&!request.known)return {title:sportsCopy[locale].competition,robots:{index:false,follow:false}};
  return {...routeMetadata(locale,'football'),...(request.search?{robots:noindexRobots}:{})};
}

async function loadHubMetadata(locale:InterfaceLocale,request:ReturnType<typeof competitionRequest>):Promise<Metadata|null>{
  const name=competitionName(locale,request.slug)??request.slug;
  let hub:CompetitionHub|null;
  try{hub=await loadCompetition(request.slug,locale,request.season,request.page);}
  catch{
    // Transient data failure: keep the response out of the index for now without rewriting the entity's identity.
    return {title:name,robots:noindexRobots};
  }
  if(!hub)return {title:name,robots:noindexRobots};
  return competitionMetadata(locale,hub,resolvedCompetitionView(hub,request.tab,request.page),request.search);
}
