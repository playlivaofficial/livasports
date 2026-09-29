import {matchSeoDescription,matchSeoTitle,sportsMatchSchema} from '@/sports/match-seo';
import {isFinishedMatchDecayed,noindexRobots} from '@/seo/policy';
import {readPublishedSeo} from '@/seo-autopilot/public';
import 'server-only';
import {JsonLd} from '@/seo/json-ld';
import {openGraphImages} from '@/seo/open-graph';
import {loadPendingFixture} from '@/sports/runtime';
import {PendingMatch,pendingMetadata} from '@/sports/PendingMatch';
import {cache} from 'react';
import type {Metadata} from 'next';
import {TeamHistoryPanel} from '@/sports/TeamHistoryPanel';
import {connection} from 'next/server';
import {notFound,permanentRedirect} from 'next/navigation';
import {loadMatchCenter} from '@/match-center/runtime';
import {parseMatchParam,slugifyMatch} from '@/match-center/routes';
import {loadTeamProfile,loadPlayerProfile} from '@/profiles/runtime';
import {parseProfileParam,slugifyProfileName} from '@/profiles/routes';
import {EnglishMatchCenter} from './EnglishMatchCenter';
import {EnglishTeamProfilePage,EnglishPlayerProfilePage} from './EnglishProfiles';
import {matchPath,teamPath,playerPath,languageAlternates} from './interface';
import {englishSportsData} from './sports-copy';
import {headers} from 'next/headers';
import {commercialLocale,requestCommercialGeo} from '@/odds/commercial-geo';

const matchData=cache((id:string)=>loadMatchCenter(id,'br'));
const teamData=cache((id:string)=>loadTeamProfile(id,'br'));
const playerData=cache((id:string)=>loadPlayerProfile(id,'br'));
function jsonLd(value:object){return <JsonLd data={value}/>;}
// Same breadcrumb hierarchy as the pt-BR/es-MX profile routes: home → profile.
const profileBreadcrumbs=(name:string,path:string)=>({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'LivaSports',item:'https://livasports.com/en'},{'@type':'ListItem',position:2,name,item:`https://livasports.com${path}`}]});
export async function englishMatchMetadata(params:Promise<{match:string}>):Promise<Metadata>{
  await connection();const parsed=parseMatchParam((await params).match);
  const result=parsed?await matchData(parsed.publicId):null;
  if(!result||result.kind==='not-found'){const pending=parsed?await loadPendingFixture(parsed.publicId):null;return pending?pendingMetadata('en',pending):{title:'Match not found',robots:{index:false,follow:false}};}
  const h=result.match.header,title=matchSeoTitle('en',h),description=matchSeoDescription('en',h);
  const paths=(['br','mx','en'] as const).map(locale=>matchPath(locale,h.publicId,h.home.name,h.away.name));
  // M1 decay: same boundary as the pt-BR/es-MX routes, so the three locales never disagree about indexability.
  const decayed=isFinishedMatchDecayed(h.status,h.kickoff)&&!(await readPublishedSeo(h.id))?.retain_indexable;
  return {title,description,...(decayed?{robots:noindexRobots}:{}),
    alternates:decayed?{canonical:paths[2]}:{canonical:paths[2],languages:languageAlternates(paths[0],paths[1],paths[2])},
    openGraph:{type:'website',siteName:'LivaSports',title,description,url:paths[2],locale:'en',images:openGraphImages()},other:{'content-language':'en'}};
}
export async function EnglishMatchRoute({params}:{params:Promise<{match:string}>}){
  await connection();const parsed=parseMatchParam((await params).match);if(!parsed)notFound();
  const result=await matchData(parsed.publicId);if(result.kind==='not-found'){const pending=await loadPendingFixture(parsed.publicId);if(pending)return <PendingMatch locale="en" row={pending}/>;notFound();}
  const h=result.match.header,path=matchPath('en',h.publicId,h.home.name,h.away.name);
  if(parsed.slug!==slugifyMatch(h.home.name,h.away.name))permanentRedirect(path);
  return <>{jsonLd(sportsMatchSchema('en',h))}<EnglishMatchCenter locale="en" commercialLocale={commercialLocale(requestCommercialGeo(await headers()))??'br'} match={englishSportsData(result.match)}/></>;
}
export async function englishProfileMetadata(params:Promise<{profile:string}>,entity:'team'|'player'):Promise<Metadata>{
  await connection();const parsed=parseProfileParam((await params).profile);
  const result=parsed?await (entity==='team'?teamData(parsed.publicId):playerData(parsed.publicId)):null;
  if(!result||result.kind==='not-found')return {title:'Profile not found',robots:{index:false,follow:false}};
  const p=result.profile,route=entity==='team'?teamPath:playerPath;
  const paths=(['br','mx','en'] as const).map(locale=>route(locale,p.publicId,p.name));
  const title=`${p.name}: ${entity==='team'?'matches, squad and statistics':'statistics, matches and profile'}`;
  const description=`${title}. Football profiles on LivaSports.`;
  return {title,description,robots:{index:p.indexable,follow:true},alternates:p.indexable?{canonical:paths[2],languages:languageAlternates(paths[0],paths[1],paths[2])}:{canonical:paths[2]},
    openGraph:{type:'website',siteName:'LivaSports',title,description,url:paths[2],locale:'en',images:openGraphImages(p.imageUrl?{url:p.imageUrl,alt:p.name}:null)},other:{'content-language':'en'}};
}
export async function EnglishProfileRoute({params,entity,searchParams}:{params:Promise<{profile:string}>;entity:'team'|'player';searchParams?:Promise<Record<string,string|string[]|undefined>>}){
  await connection();const parsed=parseProfileParam((await params).profile);if(!parsed)notFound();
  if(entity==='team'){
    const result=await teamData(parsed.publicId);if(result.kind==='not-found')notFound();const p=result.profile,path=teamPath('en',p.publicId,p.name);
    if(parsed.slug!==slugifyProfileName(p.name))permanentRedirect(path);
    return <>{jsonLd([{'@context':'https://schema.org','@type':'SportsTeam',name:p.name,url:`https://livasports.com${path}`,logo:p.imageUrl??undefined},profileBreadcrumbs(p.name,path)])}<EnglishTeamProfilePage locale="en" profile={englishSportsData(p)} history={<TeamHistoryPanel locale="en" profile={englishSportsData(p)} query={await searchParams??{}}/>}/></>;
  }
  const result=await playerData(parsed.publicId);if(result.kind==='not-found')notFound();const p=result.profile,path=playerPath('en',p.publicId,p.name);
  if(parsed.slug!==slugifyProfileName(p.name))permanentRedirect(path);
  return <>{jsonLd([{'@context':'https://schema.org','@type':'Person',name:p.name,url:`https://livasports.com${path}`,image:p.imageUrl??undefined,birthDate:p.dateOfBirth??undefined,nationality:p.nationality??undefined},profileBreadcrumbs(p.name,path)])}<EnglishPlayerProfilePage locale="en" profile={englishSportsData(p)}/></>;
}
