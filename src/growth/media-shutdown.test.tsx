import {beforeEach,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('server-only',()=>({}));
vi.mock('./repository',()=>({readGrowthFixtures:vi.fn(),readGrowthSelectionHistory:vi.fn(async()=>null),upsertGrowthSeoPriorities:vi.fn(),readLatestGrowthItems:vi.fn(async()=>[])}));
vi.mock('./evidence-repository',()=>({readGeoGrowthEvidence:vi.fn(async()=>({fixtures:new Map(),demand:[],adjustments:new Map(),search:new Map()})),persistGeoDemand:vi.fn(async()=>new Map())}));
vi.mock('./manual-repository',()=>({readPublishingOverview:vi.fn(async()=>({posts:[]})),readCurrentPostingReceipts:vi.fn(async()=>[])}));
vi.mock('./daily-repository',()=>({dailyGeoNeedsRanking:vi.fn(async()=>true),startDailyGeoRun:vi.fn(async()=>null),finishDailyGeoRun:vi.fn(async()=>{}),readDailyGrowthReport:vi.fn(async()=>null),markDailyGrowthCheck:vi.fn(async()=>{})}));
vi.mock('./country-demand-read',()=>({readCountryDemand:vi.fn(async(_db:unknown,geo:'MX'|'CO'|'PE',now:Date)=>{
  const {buildCountryDemand}=await import('./country-demand');return buildCountryDemand(geo,[],{from:'2026-08-01',to:'2026-09-01',capturedAt:null},now);
})}));
import * as repository from './repository';
import {runGrowthSelection,readGrowthDashboard,regenerateGrowthPlatform,regenerateV1Drafts,regeneratePremiumDrafts,regenerateRightsFallbackDrafts} from './service';
import {rankedFixture,testNow} from './fixtures.test-support';
import {scoreFixture} from './scoring';
import {buildShortlist} from './shortlist';
import {GrowthQueue} from './GrowthQueue';
import type {DatabaseClient} from '@/database/client';

const db={query:vi.fn(),transaction:vi.fn(),close:vi.fn()} as unknown as DatabaseClient;
const candidates=Array.from({length:11},(_,i)=>rankedFixture({fixtureId:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,publicId:String(i).padStart(16,'0'),
  competitionSlug:['brasileirao-serie-a','copa-libertadores','premier-league'][i%3],standings:null,oddsBookmakers:1}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(repository.readGrowthFixtures).mockResolvedValue(candidates);});

describe('media shutdown preserves daily intelligence',()=>{
  it('uses shared GEO scoring/diversity and makes a new important fixture displace a weaker one',async()=>{
    await runGrowthSelection(db,'AUTOMATIC',{now:testNow});
    const first=vi.mocked(repository.upsertGrowthSeoPriorities).mock.calls[0][1];
    const expected=buildShortlist(candidates.map(row=>scoreFixture(row.signals,testNow,{geo:'MX'})),{size:5});
    expect(first.map(row=>row.fixtureId)).toEqual(expected.content.map(row=>row.fixtureId));
    expect(new Set(expected.content.map(row=>row.competitionSlug)).size).toBeGreaterThan(1);
    const important=rankedFixture({fixtureId:'22222222-2222-4222-8222-222222222222',publicId:'2222222222222222',competitionSlug:'copa-libertadores',
      home:{slug:'real-madrid',name:'Real Madrid',publicId:'a',imageUrl:null},away:{slug:'barcelona',name:'Barcelona',publicId:'b',imageUrl:null},stageName:'Final',oddsBookmakers:3});
    vi.mocked(repository.readGrowthFixtures).mockResolvedValue([...candidates,important]);
    const result=await runGrowthSelection(db,'AUTOMATIC',{now:new Date(testNow.getTime()+60_000)});
    const second=vi.mocked(repository.upsertGrowthSeoPriorities).mock.calls[3][1];
    expect(second).toHaveLength(5);expect(second[0].fixtureId).toBe(important.signals.fixtureId);
    expect(first.filter(row=>!second.some(next=>next.fixtureId===row.fixtureId))).toHaveLength(1);
    expect(second.filter(row=>row.topSocial)).toHaveLength(5);
    expect(result).toMatchObject({generated:0,jobId:null,pending:0,providerRequests:0,mediaGeneration:'DISABLED'});
    expect(db.query).not.toHaveBeenCalled();expect(repository.readLatestGrowthItems).not.toHaveBeenCalled();
  });
  it('allows eligible empty days without inventing opportunities or media',async()=>{
    vi.mocked(repository.readGrowthFixtures).mockResolvedValue([]);
    expect(await runGrowthSelection(db,'AUTOMATIC',{now:testNow})).toMatchObject({state:'SUCCEEDED',selectionCount:0,socialCount:0,generated:0});
    for(const geo of ['MX','CO','PE'])expect(repository.upsertGrowthSeoPriorities).toHaveBeenCalledWith(db,[],testNow,geo,expect.any(Function));
  });
  it('records a GEO failure, preserves its previous placements and lets the other GEOs succeed without media',async()=>{
    vi.mocked(repository.readGrowthFixtures).mockRejectedValueOnce(Error('DB_UNAVAILABLE'));
    const result=await runGrowthSelection(db,'AUTOMATIC',{now:testNow});
    expect(result.state).toBe('PARTIAL');expect(result.geoResults?.[0]).toMatchObject({geo:'MX',state:'FAILED',error:'GEO_SELECTION_FAILED'});
    expect(repository.readGrowthFixtures).toHaveBeenCalledTimes(3);expect(repository.upsertGrowthSeoPriorities).toHaveBeenCalledTimes(2);
    expect(repository.upsertGrowthSeoPriorities).not.toHaveBeenCalledWith(db,expect.anything(),testNow,'MX',expect.any(Function));
  });
  it('closes all legacy regeneration service paths without a DB wakeup',async()=>{
    for(const fn of [regenerateV1Drafts,regeneratePremiumDrafts,regenerateRightsFallbackDrafts])expect(await fn(db)).toMatchObject({error:'MEDIA_GENERATION_DISABLED',generated:0});
    expect(await regenerateGrowthPlatform(db,'any','TIKTOK')).toMatchObject({error:'MEDIA_GENERATION_DISABLED',generated:0});
    expect(repository.readGrowthFixtures).not.toHaveBeenCalled();expect(db.query).not.toHaveBeenCalled();
  });
  it('keeps independent owner Top 5 readable without any media and removes generation controls',async()=>{
    const dashboard=await readGrowthDashboard(db,testNow);delete dashboard.publishing;
    const html=renderToStaticMarkup(<GrowthQueue dashboard={dashboard}/>);
    expect(html).toContain('Top 5 actual');expect(html).toContain('Actualizar Top 5');expect(html).toContain('desactivada');
    expect(dashboard.content).toHaveLength(5);expect(dashboard.social).toHaveLength(5);
    expect(html).toContain('geo=MX');expect(html).toContain('geo=CO');expect(html).toContain('geo=PE');
    expect(html).not.toContain('Atualizar e gerar');expect(html).not.toContain('Regenerar plataforma');
    expect(repository.upsertGrowthSeoPriorities).not.toHaveBeenCalled();
  });
  it('keeps the shared cron and required schedules, with no media execution in its service',()=>{
    const cron=JSON.parse(readFileSync('vercel.json','utf8')).crons;
    expect(cron).toContainEqual({path:'/api/internal/growth-refresh',schedule:'17 * * * *'});
    expect(cron).toContainEqual({path:'/api/internal/seo-autopilot',schedule:'10 7 * * *'});
    expect(cron).toContainEqual({path:'/api/internal/odds-refresh',schedule:'*/5 * * * *'});
    const service=readFileSync(new URL('./service.ts',import.meta.url),'utf8');
    expect(service).not.toMatch(/renderSocialPackage|renderCanonicalStatics|databaseVoiceStore|acquireGrowthJob|finishGrowthJob|persistGrowthItem|rebuildCurrentGrowthQueue/);
    expect(readFileSync(new URL('./scheduler-server.ts',import.meta.url),'utf8')).toContain('runGrowthSelection');
  });
});
