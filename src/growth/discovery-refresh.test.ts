import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {refreshGrowthDiscovery} from './discovery-refresh';
import {finishDailyGeoRun,startDailyGeoRun} from './daily-repository';
import type {QueryExecutor} from '@/database/client';
const db=(query:unknown)=>({query}) as QueryExecutor;
describe('durable priority discovery refresh',()=>{
 it('queues old and new home/daily/competition/team pages in the ranking transaction',async()=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT selection')?[{selection:[{discoveryPaths:['/co','/co/equipo/old-team']}]}]:[]}));
  await finishDailyGeoRun(db(query),'1',{state:'SUCCEEDED',changed:true,selection:[{fixtureId:'new',rank:1,score:90,label:'New',kickoff:'2026-10-15',competition:'league',canonicalUrl:'https://livasports.com/co/partido/new',discoveryPaths:['/co','/co/partidos/hoy','/co/futbol?competition=league','/co/equipo/new-team']}]},new Date());
  const calls=query.mock.calls as unknown as Array<[string,unknown[]]>;
  expect(JSON.parse(calls.at(-1)![1][10] as string)).toEqual(['/co','/co/equipo/old-team','/co/partidos/hoy','/co/futbol?competition=league','/co/equipo/new-team']);
 });
 it('invalidates only affected route paths, including exited teams, and acknowledges after success',async()=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT')?[{id:'1',geo:'PE',discovery_paths:['/pe','/pe/partidos/hoy','/pe/futbol?competition=peru-liga-1','/pe/futbol?competition=la-liga','/pe/equipo/old-team','/pe/equipo/new-team']}]:[]})),invalidate=vi.fn();
  expect(await refreshGrowthDiscovery(db(query),invalidate)).toEqual({runs:1,paths:5});
  expect(invalidate.mock.calls.flat()).toEqual(['/pe','/pe/partidos/hoy','/pe/futbol','/pe/equipo/old-team','/pe/equipo/new-team']);
  expect(query.mock.calls.at(-1)?.[0]).toContain('discovery_revalidated_at=now()');
 });
 it('preserves pending receipts on failure and drains them even when the next ranking is unchanged',async()=>{
  let pending=true;const query=vi.fn(async(sql:string)=>{if(sql.startsWith('UPDATE'))pending=false;return {rows:sql.startsWith('SELECT')&&pending?[{id:'1',geo:'MX',discovery_paths:['/mx']}]:[]};});
  await expect(refreshGrowthDiscovery(db(query),()=>{throw Error('CACHE_UNAVAILABLE');})).rejects.toThrow('CACHE_UNAVAILABLE');expect(pending).toBe(true);
  const invalidate=vi.fn();expect(await refreshGrowthDiscovery(db(query),invalidate)).toEqual({runs:1,paths:1});
  expect(await refreshGrowthDiscovery(db(query),invalidate)).toEqual({runs:0,paths:0});expect(invalidate).toHaveBeenCalledTimes(1);
 });
 it('does not allow a foreign GEO or arbitrary route to be invalidated',async()=>{
  const query=vi.fn(async()=>({rows:[{id:'1',geo:'CO',discovery_paths:['/pe']}]})),invalidate=vi.fn();
  await expect(refreshGrowthDiscovery(db(query),invalidate)).rejects.toThrow('INVALID_DISCOVERY_PATH');expect(invalidate).not.toHaveBeenCalled();expect(query).toHaveBeenCalledTimes(1);
 });
 it('automatically retires interrupted executions before starting the next attempt',async()=>{
  const query=vi.fn(async()=>({rows:[{id:'2'}]}));await startDailyGeoRun(db(query),'MX','AUTOMATIC',new Date());
  expect(query.mock.calls[0]?.length).toBeGreaterThan(0);const calls=query.mock.calls as unknown as Array<[string,unknown[]]>;
  expect(calls[0][0]).toContain("error_code='INTERRUPTED'");expect(calls[0][0]).toContain("interval '10 minutes'");expect(calls[1][1][2]).toBe('AUTOMATIC');
 });
});
