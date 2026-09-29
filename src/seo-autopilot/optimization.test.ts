import {beforeEach,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({evidence:vi.fn(),measure:vi.fn(),crawl:vi.fn()}));
vi.mock('./optimization-data',()=>({readGrowthEvidence:mocks.evidence}));
vi.mock('@/seo/page-breakdowns',()=>({measurePage:mocks.measure}));
vi.mock('./crawl',()=>({crawlSeoUrl:mocks.crawl}));
import {proposedMetadata,runGrowthOptimization} from './optimization';
import {experimentArm,type GrowthPage,type Metric} from './optimization-policy';
import {metadataSourceSignature,optimizationMetadata} from './optimization-metadata';
import {focusFactualParagraphs} from './public';
import type {DatabaseClient} from '@/database/client';
const now=new Date('2026-09-29T12:00:00Z'),kickoff='2026-10-01T20:00:00.000Z';
const metric:Metric={impressions:600,clicks:20,ctr:1/30,position:12,positionSpread:1,days:28};
const page=(url:string):GrowthPage=>({url,type:'FIXTURE',locale:'br',entityId:url.slice(-16),label:'Santos x Flamengo',cluster:null,current:metric,previous:metric,queries:[{query:'santos flamengo',impressions:400,clicks:10,position:12,days:28}],countries:[],devices:[],publishedAt:'2026-07-01',firstObserved:'2026-07-01',lastChangedAt:null,managed:true,status:'SCHEDULED',technicalHealthy:true,fresh:true,activeExperiment:false,title:'Original title',description:'Original description',linkBoost:0,kickoff});
const cohort='TITLE_PATTERN:FIXTURE:br:GENERAL:2:2026-09';
const urls=Array.from({length:50},(_,i)=>`https://livasports.com/br/jogo/santos-flamengo-${i.toString(16).padStart(16,'0')}`);
const variant=page(urls.find(u=>experimentArm(`${cohort}:${u}`)==='VARIANT')!),control=page(urls.find(u=>experimentArm(`${cohort}:${u}`)==='CONTROL')!);
const opportunity={url:variant.url,detector:'LOW_CTR',confidence:'HIGH',reason:'Real comparable CTR evidence',proposedAction:'TITLE_PATTERN',benchmark:.06,cohortSize:5,query:'santos flamengo',evidence:variant};
function database(options:{used?:number;duplicate?:boolean}={}){
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('SELECT action,count')?[{action:'TITLE_PATTERN',n:options.used??0}]:
    sql.includes('SELECT 1 FROM seo_autopilot_pages')&&options.duplicate?[{exists:1}]:sql.includes('INSERT INTO seo_growth_experiments')?[{id:'experiment'}]:[]}));
  const db={query,transaction:async<T>(fn:(tx:unknown)=>Promise<T>)=>fn({query}),close:async()=>undefined} as unknown as DatabaseClient;
  return {db,query};
}
beforeEach(()=>{
  vi.clearAllMocks();mocks.evidence.mockResolvedValue({migrationReady:true,mode:'ACTIVE',reasons:[],from:'2026-08-30',to:'2026-09-26',observedDays:28,metrics7:metric,metrics28:metric,pages:[variant,control],opportunities:[opportunity]});
  mocks.measure.mockResolvedValue({complete:true,breakdownsComplete:true,from:'2026-08-30',to:'2026-09-26',totals:metric});
  const proposed=proposedMetadata(variant,'Original title','Original description')!;
  mocks.crawl.mockImplementation(async(url:string)=>({url,title:proposed.title,description:proposed.description,indexFollow:true,problems:[]}));
  // First inspection is the prior production HTML; final inspection is the applied override.
  mocks.crawl.mockResolvedValueOnce({url:variant.url,title:'Original title',description:'Original description',indexFollow:true,problems:[]});
});
describe('bounded optimizer integration',()=>{
  it('applies one audited paired experiment and verifies real HTML',async()=>{const {db,query}=database();const r=await runGrowthOptimization(db,now);expect(r.applied).toBe(1);expect(mocks.crawl).toHaveBeenCalledTimes(3);
    const calls=query.mock.calls as unknown as [string,unknown[]][];expect(calls.find(([q])=>q.includes('INSERT INTO seo_growth_experiments'))).toBeTruthy();
    expect(calls.find(([q])=>q.includes('INSERT INTO seo_growth_actions'))?.[1]).toEqual(expect.arrayContaining(['HIGH','LOW_CTR','APPLIED']));expect(r.providerRequests).toBe(0);
  });
  it('restores exact prior metadata and freezes if rendered HTML mismatches',async()=>{mocks.crawl.mockResolvedValue({title:'Incorrect',description:'Incorrect',indexFollow:true,problems:[]});const {db,query}=database();await runGrowthOptimization(db,now);expect(query.mock.calls.some(([q])=>q.includes("state='FROZEN'"))).toBe(true);expect(query.mock.calls.some(([q])=>q.includes('AND optimization_metadata=$6'))).toBe(true);});
  it('daily persisted caps prevent another change on rerun',async()=>{const {db,query}=database({used:1});expect((await runGrowthOptimization(db,now)).applied).toBe(0);expect(query.mock.calls.some(([q])=>q.includes('INSERT INTO seo_growth_experiments'))).toBe(false);expect(mocks.crawl).not.toHaveBeenCalled();});
  it('duplicate proposed titles never apply',async()=>{const {db}=database({duplicate:true});expect((await runGrowthOptimization(db,now)).applied).toBe(0);});
  it('incomplete baseline never applies',async()=>{mocks.measure.mockResolvedValue({complete:false,breakdownsComplete:false,totals:null,from:'2026-08-30',to:'2026-09-26'});expect((await runGrowthOptimization(database().db,now)).applied).toBe(0);expect(mocks.crawl).not.toHaveBeenCalled();});
  it('actual canonical/robots/HTML failure blocks change',async()=>{mocks.crawl.mockReset();mocks.crawl.mockResolvedValue({problems:['CANONICAL_MISMATCH'],indexFollow:false});expect((await runGrowthOptimization(database().db,now)).applied).toBe(0);});
  it('GSC failure records observation only with no public or cluster mutation',async()=>{const e=await mocks.evidence();mocks.evidence.mockResolvedValue({...e,mode:'OBSERVE_ONLY',reasons:['GSC_SYNC_FAILED_OR_STALE']});const {db,query}=database();const r=await runGrowthOptimization(db,now);expect(r.applied).toBe(0);expect(query.mock.calls.some(([q])=>q.startsWith('UPDATE seo_autopilot_pages')||q.includes('INSERT INTO seo_growth_cluster_weights'))).toBe(false);expect(mocks.crawl).not.toHaveBeenCalled();});
  it('rolling deployment without migration is fail-safe',async()=>{mocks.evidence.mockResolvedValue({migrationReady:false,reasons:['MIGRATION_NOT_READY']});const {db,query}=database();expect((await runGrowthOptimization(db,now)).mode).toBe('OBSERVE_ONLY');expect(query).not.toHaveBeenCalled();});
  it('no matched control means no experiment',async()=>{const e=await mocks.evidence();mocks.evidence.mockResolvedValue({...e,pages:[variant]});expect((await runGrowthOptimization(database().db,now)).applied).toBe(0);});
});
describe('rendered metadata and factual safety',()=>{
  it('honors unchanged source but expires on reschedule, status or participant changes',()=>{
    const value={title:'Verified',description:'Verified facts',sourceSignature:metadataSourceSignature(variant.label,variant.status,kickoff)};
    expect(optimizationMetadata(value,variant.label,'SCHEDULED',kickoff)?.title).toBe('Verified');
    expect(optimizationMetadata(value,variant.label,'FINISHED',kickoff)).toBeNull();
    expect(optimizationMetadata(value,variant.label,'SCHEDULED','2026-10-02T20:00:00Z')).toBeNull();
    expect(optimizationMetadata(value,'Other teams','SCHEDULED',kickoff)).toBeNull();
  });
  it('does not interpolate query instructions or fabricate broadcast/betting claims',()=>{const p={...variant,queries:[{...variant.queries[0],query:'guaranteed bet watch free streaming'}]};const meta=proposedMetadata(p,'Current','Current')!;expect(meta.title).not.toMatch(/guaranteed|streaming|bet/);expect(meta.description).toContain('Santos x Flamengo');});
  it('does not generate metadata for unresolved or live states',()=>{expect(proposedMetadata({...variant,status:'LIVE'},'x','x')).toBeNull();expect(proposedMetadata({...variant,kickoff:null},'x','x')).toBeNull();});
  it('only reorders verified text, retains fixture first and does not invent a missing module',()=>{const paragraphs=['Fixture facts','Venue','Santos: resultados anteriores disponíveis','O retrospecto real'];expect(focusFactualParagraphs(paragraphs,'H2H')).toEqual(['Fixture facts','O retrospecto real','Venue','Santos: resultados anteriores disponíveis']);expect(focusFactualParagraphs(paragraphs,'STANDINGS')).toEqual(paragraphs);});
  it('contains no provider, affiliate, social-generation or credential entry points',()=>{for(const f of ['optimization.ts','optimization-data.ts','optimization-report.ts','optimization-policy.ts'])expect(readFileSync(new URL(f,import.meta.url),'utf8')).not.toMatch(/SportmonksAdapter|OddsPapiAdapter|runGrowthGeneration|CRON_SECRET|GSC_REFRESH_TOKEN|Authorization|process\.env\.(?:DATABASE|OWNER|ODDS)/);});
  it('additive migration neither deletes product data nor changes robots',()=>{const sql=readFileSync(new URL('../../db/migrations/052_seo_growth_optimization.sql',import.meta.url),'utf8');expect(sql).not.toMatch(/DROP\s|TRUNCATE\s|DELETE FROM|ALTER TABLE (fixtures|users|odds)/i);expect(sql.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(6);expect(sql).toContain('ADD COLUMN IF NOT EXISTS');});
});
