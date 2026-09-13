import 'server-only';
import {cache} from 'react';
import type {Metadata} from 'next';
import {connection} from 'next/server';
import {notFound,permanentRedirect} from 'next/navigation';
import {loadMatchCenter} from '@/match-center/runtime';
import {parseMatchParam,slugifyMatch} from '@/match-center/routes';
import {loadTeamProfile,loadPlayerProfile} from '@/profiles/runtime';
import {parseProfileParam,slugifyProfileName} from '@/profiles/routes';
import {EnglishMatchCenter} from './EnglishMatchCenter';
import {EnglishTeamProfilePage,EnglishPlayerProfilePage} from './EnglishProfiles';
import {matchPath,teamPath,playerPath,languageAlternates} from './interface';
import {englishSportsData,englishCompetition} from './sports-copy';

const matchData=cache((id:string)=>loadMatchCenter(id,'br'));
const teamData=cache((id:string)=>loadTeamProfile(id,'br'));
const playerData=cache((id:string)=>loadPlayerProfile(id,'br'));
function jsonLd(value:object){return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(value).replace(/</g,'\\u003c')}}/>;}
export async function englishMatchMetadata(params:Promise<{match:string}>):Promise<Metadata>{
  await connection();const parsed=parseMatchParam((await params).match);
  const result=parsed?await matchData(parsed.publicId):null;
  if(!result||result.kind==='not-found')return {title:'Match not found',robots:{index:false,follow:false}};
  const h=result.match.header,title=`${h.home.name} x ${h.away.name}`;
  const paths=(['br','mx','en'] as const).map(locale=>matchPath(locale,h.publicId,h.home.name,h.away.name));
  const description=`${title} in ${englishCompetition(h.competition)}. Scores, lineups, statistics and match events.`;
  return {title,description,alternates:{canonical:paths[2],languages:languageAlternates(paths[0],paths[1],paths[2])},
    openGraph:{type:'website',siteName:'LivaSports',title,description,url:paths[2],locale:'en'},other:{'content-language':'en'}};
}
export async function EnglishMatchRoute({params}:{params:Promise<{match:string}>}){
  await connection();const parsed=parseMatchParam((await params).match);if(!parsed)notFound();
  const result=await matchData(parsed.publicId);if(result.kind==='not-found')notFound();
  const h=result.match.header,path=matchPath('en',h.publicId,h.home.name,h.away.name);
  if(parsed.slug!==slugifyMatch(h.home.name,h.away.name))permanentRedirect(path);
  return <>{jsonLd({'@context':'https://schema.org','@type':'SportsEvent',name:`${h.home.name} x ${h.away.name}`,startDate:h.kickoff,url:`https://livasports.com${path}`,
    homeTeam:{'@type':'SportsTeam',name:h.home.name,url:`https://livasports.com${teamPath('en',h.home.publicId,h.home.name)}`},
    awayTeam:{'@type':'SportsTeam',name:h.away.name,url:`https://livasports.com${teamPath('en',h.away.publicId,h.away.name)}`},
    location:h.venue?{'@type':'Place',name:h.venue,address:h.venueCity??undefined}:undefined})}<EnglishMatchCenter locale="en" match={englishSportsData(result.match)}/></>;
}
export async function englishProfileMetadata(params:Promise<{profile:string}>,entity:'team'|'player'):Promise<Metadata>{
  await connection();const parsed=parseProfileParam((await params).profile);
  const result=parsed?await (entity==='team'?teamData(parsed.publicId):playerData(parsed.publicId)):null;
  if(!result||result.kind==='not-found')return {title:'Profile not found',robots:{index:false,follow:false}};
  const p=result.profile,route=entity==='team'?teamPath:playerPath;
  const paths=(['br','mx','en'] as const).map(locale=>route(locale,p.publicId,p.name));
  const title=`${p.name}: ${entity==='team'?'matches, squad and statistics':'statistics, matches and profile'}`;
  const description=`${title}. Football profiles on LivaSports.`;
  return {title,description,robots:{index:p.indexable,follow:true},alternates:{canonical:paths[2],languages:languageAlternates(paths[0],paths[1],paths[2])},
    openGraph:{type:'website',siteName:'LivaSports',title,description,url:paths[2],locale:'en',images:p.imageUrl?[{url:p.imageUrl,alt:p.name}]:undefined},other:{'content-language':'en'}};
}
export async function EnglishProfileRoute({params,entity}:{params:Promise<{profile:string}>;entity:'team'|'player'}){
  await connection();const parsed=parseProfileParam((await params).profile);if(!parsed)notFound();
  if(entity==='team'){
    const result=await teamData(parsed.publicId);if(result.kind==='not-found')notFound();const p=result.profile,path=teamPath('en',p.publicId,p.name);
    if(parsed.slug!==slugifyProfileName(p.name))permanentRedirect(path);
    return <>{jsonLd({'@context':'https://schema.org','@type':'SportsTeam',name:p.name,url:`https://livasports.com${path}`,logo:p.imageUrl??undefined})}<EnglishTeamProfilePage locale="en" profile={englishSportsData(p)}/></>;
  }
  const result=await playerData(parsed.publicId);if(result.kind==='not-found')notFound();const p=result.profile,path=playerPath('en',p.publicId,p.name);
  if(parsed.slug!==slugifyProfileName(p.name))permanentRedirect(path);
  return <>{jsonLd({'@context':'https://schema.org','@type':'Person',name:p.name,url:`https://livasports.com${path}`,image:p.imageUrl??undefined,birthDate:p.dateOfBirth??undefined,nationality:p.nationality??undefined})}<EnglishPlayerProfilePage locale="en" profile={englishSportsData(p)}/></>;
}
