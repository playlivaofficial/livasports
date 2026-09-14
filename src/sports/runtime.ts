import 'server-only';
import {createHash} from 'node:crypto';
import {cache} from 'react';
import {PostgresDatabaseClient,databaseUrl} from '@/database/client';
import {NextServerCache} from '@/cache/next-server-cache';
import {SportsRepository} from './repository';
import type {InterfaceLocale} from '@/localization/interface';
let repository:SportsRepository|undefined;
const serverCache=new NextServerCache();
function sportsRepository(){const url=databaseUrl();if(!url)throw new Error('Sports database is not configured');return repository??=new SportsRepository(new PostgresDatabaseClient(url));}
export const loadCompetition=cache(async(slug:string,locale:InterfaceLocale,season:string|undefined,page:number)=>
  (await serverCache.getOrSet(`sports:v7:competition:${slug}:${locale}:${season??'current'}:${page}`,{ttlSeconds:60,staleIfErrorSeconds:300,tags:['livasports:v1:fixtures:br','livasports:v1:fixtures:mx']},()=>sportsRepository().competition(slug,locale,season,page))).value);
export const loadPendingFixture=cache((id:string)=>sportsRepository().pending(id));
export const loadRedCards=cache(async(ids:string[])=>(await serverCache.getOrSet(`sports:v1:cards:${createHash('sha256').update([...ids].sort().join(',')).digest('hex')}`,{ttlSeconds:60,staleIfErrorSeconds:300,tags:['livasports:v1:fixtures:br','livasports:v1:fixtures:mx']},()=>sportsRepository().redCards(ids))).value);
export const loadSportsCalendar=cache(async(locale:InterfaceLocale,timeZone?:string)=>(await serverCache.getOrSet(`sports:v2:calendar:${locale}:${timeZone??'default'}`,{ttlSeconds:300,staleIfErrorSeconds:300,tags:['livasports:v1:fixtures:br','livasports:v1:fixtures:mx']},()=>sportsRepository().calendar(locale,timeZone))).value);
export const searchSports=cache(async(query:string,locale:InterfaceLocale)=>
  (await serverCache.getOrSet(`sports:v1:search:${locale}:${encodeURIComponent(query)}`,{ttlSeconds:300,staleIfErrorSeconds:0},()=>sportsRepository().search(query,locale))).value);
export const loadTeamHistory=cache(async(id:string,locale:InterfaceLocale,view:'fixtures'|'results',page:number,season?:string)=>
  (await serverCache.getOrSet(`sports:v1:team:${id}:${locale}:${view}:${page}:${season??'all'}`,{ttlSeconds:60,staleIfErrorSeconds:300,tags:['livasports:v1:fixtures:br','livasports:v1:fixtures:mx']},()=>sportsRepository().teamHistory(id,locale,view,page,season))).value);
