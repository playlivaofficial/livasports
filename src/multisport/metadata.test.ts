import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {interfaceLocales} from '@/localization/interface';
import {sportIds,sportsPath} from './catalog';
import type {SportsSnapshot} from './model';

const state=vi.hoisted(()=>({snapshots:[] as SportsSnapshot[]}));
vi.mock('./server',()=>({publishedSnapshots:async()=>state.snapshots}));
vi.mock('./local-preview',()=>({localDataPreviewEnabled:()=>false}));
vi.mock('@/editorial/server',()=>({publishedNews:async()=>[]}));
vi.mock('@/v2/pages',()=>({V2Shell:()=>null}));
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('TEST_NOT_FOUND');}}));
import {sportsMetadata} from './pages';

/** Synthetic metadata-only fixture, never ingested or presented as source evidence. */
function fixture():SportsSnapshot{return {schemaVersion:1,competitionId:'bundesliga',sport:'football',season:'2026/27',stage:'TEST stage',sourceId:'openligadb',sourceUrl:'https://api.openligadb.de/getbltable/bl1/2026',mode:'manual',observedAt:'2026-10-18T16:00:00Z',retrievedAt:'2026-10-19T10:00:00Z',entities:[{id:'test-alpha',name:'Synthetic TEST Alpha',kind:'club'},{id:'test-beta',name:'Synthetic TEST Beta',kind:'club'}],tables:[],events:[{id:'test-event',stage:'TEST stage',homeId:'test-alpha',awayId:'test-beta',start:'2026-10-18T14:00:00Z',status:'completed',scores:{home:1,away:0}}]};}
beforeEach(()=>{state.snapshots=[];vi.resetModules();vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-19T12:00:00Z'));});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('sports metadata cannot reopen preview indexing',()=>{
 it.each(['preview','development',undefined,'production'])('inherits the root robots policy in deployment=%s for all 40 directory routes',async environment=>{
  vi.stubEnv('VERCEL_ENV',environment);const {siteMetadata}=await import('@/localization/site-metadata');
  for(const locale of interfaceLocales)for(const parts of [[],...sportIds.map(sport=>[sport])]){
   const metadata=await sportsMetadata(locale,parts);
   // Next shallow-merges metadata: an index:true child would erase the preview restriction.
   expect(metadata.robots).toBeUndefined();expect({...siteMetadata,...metadata}.robots).toEqual({index:environment==='production',follow:environment==='production'});
   expect(metadata.alternates?.canonical).toBe(sportsPath(locale,parts[0]));expect(metadata.metadataBase?.toString()).toBe('https://livasports.com/');
  }
 });
 it.each(['preview','production'])('preserves deployment=%s restrictions for substantive competition, season and entity records',async environment=>{
  vi.stubEnv('VERCEL_ENV',environment);const {siteMetadata}=await import('@/localization/site-metadata');state.snapshots=[fixture()];
  for(const parts of [['football','bundesliga'],['football','bundesliga','season','2026-27'],['football','bundesliga','season','2026-27','entities','test-alpha']]){
   const metadata=await sportsMetadata('en',parts);expect(metadata.robots).toBeUndefined();expect({...siteMetadata,...metadata}.robots).toEqual({index:environment==='production',follow:environment==='production'});
  }
 });
 it.each(['preview','production'])('keeps unsupported or thin competition records noindex in deployment=%s',async environment=>{
  vi.stubEnv('VERCEL_ENV',environment);const {siteMetadata}=await import('@/localization/site-metadata');
  for(const snapshots of [[],[fixture()]]){
   state.snapshots=snapshots;if(snapshots[0])Object.assign(snapshots[0].events[0],{start:null,status:'scheduled',scores:null});
   const metadata=await sportsMetadata('en',['football','bundesliga']);expect({...siteMetadata,...metadata}.robots).toEqual({index:false,follow:true});
  }
 });
});
