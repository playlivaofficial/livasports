import 'server-only';
import {createHash} from 'node:crypto';
import {cache} from 'react';
import {PostgresDatabaseClient,databaseUrl} from '@/database/client';
import {NextServerCache} from '@/cache/next-server-cache';
import {SportsRepository} from './repository';
import {standingsRevision} from './standings-read';
import type {InterfaceLocale} from '@/localization/interface';
import type {CommercialGeo} from '@/odds/commercial-geo';
import {readListingOddsSnapshots,type InternalOddsRead} from '@/odds/read-repository';
let repository:SportsRepository|undefined;
let dbClient:PostgresDatabaseClient|undefined;
const serverCache=new NextServerCache();
function sportsDb(){const url=databaseUrl();if(!url)throw new Error('Sports database is not configured');return dbClient??=new PostgresDatabaseClient(url);}
function sportsRepository(){return repository??=new SportsRepository(sportsDb());}
export const loadCompetition=cache(async(slug:string,locale:InterfaceLocale,season:string|undefined,page:number)=>{
  // A DB revision prevents other warm instances' memory caches serving a replaced table.
  const revision=await standingsRevision(sportsDb(),slug);
  return (await serverCache.getOrSet(`sports:v8:competition:${slug}:${locale}:${season??'current'}:${page}:${revision}`,{ttlSeconds:60,staleIfErrorSeconds:0,tags:[`standings-slug:${slug}`,'livasports:v1:fixtures:br','livasports:v1:fixtures:mx']},()=>sportsRepository().competition(slug,locale,season,page))).value;
});
export const loadPendingFixture=cache((id:string)=>sportsRepository().pending(id));
export const loadRedCards=cache(async(ids:string[])=>(await serverCache.getOrSet(`sports:v1:cards:${createHash('sha256').update([...ids].sort().join(',')).digest('hex')}`,{ttlSeconds:60,staleIfErrorSeconds:300,tags:['livasports:v1:fixtures:br','livasports:v1:fixtures:mx']},()=>sportsRepository().redCards(ids))).value);
export const loadSportsCalendar=cache(async(locale:InterfaceLocale,timeZone?:string)=>(await serverCache.getOrSet(`sports:v2:calendar:${locale}:${timeZone??'default'}`,{ttlSeconds:300,staleIfErrorSeconds:300,tags:['livasports:v1:fixtures:br','livasports:v1:fixtures:mx']},()=>sportsRepository().calendar(locale,timeZone))).value);
export const loadCompetitionNav=cache(async(locale:InterfaceLocale,timeZone?:string)=>
  (await serverCache.getOrSet(`sports:v1:nav:${locale}:${timeZone??'default'}`,{ttlSeconds:60,staleIfErrorSeconds:300,tags:['livasports:v1:fixtures:br','livasports:v1:fixtures:mx']},()=>sportsRepository().boardNav(locale,timeZone))).value);
export const searchSports=cache(async(query:string,locale:InterfaceLocale)=>
  (await serverCache.getOrSet(`sports:v3:search:${locale}:${encodeURIComponent(query)}`,{ttlSeconds:300,staleIfErrorSeconds:0},()=>sportsRepository().search(query,locale))).value);
export const loadListingMatchOdds=cache(async(ids:readonly string[],geo:CommercialGeo|null)=>{
  // Next's persistent cache serializes values; cache entries rather than a Map, then restore the read model.
  const result=await serverCache.getOrSet<Array<[string,InternalOddsRead]>>(`sports:v2:listing-odds:${geo??'none'}:${createHash('sha256').update([...ids].sort().join(',')).digest('hex')}`,{ttlSeconds:30,staleIfErrorSeconds:0,tags:['livasports:v1:fixtures:br','livasports:v1:fixtures:mx']},async()=>[...(await readListingOddsSnapshots(sportsDb(),ids,geo))]);
  return new Map(result.value);
});
export const loadTeamHistory=cache(async(id:string,locale:InterfaceLocale,view:'fixtures'|'results',page:number,season?:string,ttlSeconds=60)=>
  (await serverCache.getOrSet(`sports:v2:team:${id}:${locale}:${view}:${page}:${season??'all'}:${ttlSeconds}`,{ttlSeconds,staleIfErrorSeconds:300,tags:ttlSeconds>=3600?[`livasports:v1:profile:team:${id}`]:['livasports:v1:fixtures:br','livasports:v1:fixtures:mx']},()=>sportsRepository().teamHistory(id,locale,view,page,season))).value);
