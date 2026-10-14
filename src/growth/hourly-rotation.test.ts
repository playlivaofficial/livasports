import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./repository',()=>({readGrowthFixtures:vi.fn(),upsertGrowthSeoPriorities:vi.fn()}));
vi.mock('./evidence-repository',()=>({readGeoGrowthEvidence:vi.fn(),persistGeoDemand:vi.fn(async()=>new Map())}));
vi.mock('./country-demand-read',()=>({readCountryDemand:vi.fn()}));
vi.mock('./daily-repository',()=>({startDailyGeoRun:vi.fn(async()=> '1'),finishDailyGeoRun:vi.fn(async()=>{})}));
import {runGrowthSelection} from './service';
import {readGrowthFixtures,upsertGrowthSeoPriorities,type GrowthSeoUpsert} from './repository';
import {readGeoGrowthEvidence} from './evidence-repository';
import {readCountryDemand} from './country-demand-read';
import {buildCountryDemand,type CountrySearchRow} from './country-demand';
import {startDailyGeoRun} from './daily-repository';
import {rankedFixture} from './fixtures.test-support';
import type {CoreGeo} from '@/config/geo';
import type {DatabaseClient} from '@/database/client';

const now=new Date('2026-10-14T12:17:00Z'),hour=3600000,db={} as DatabaseClient;
const fixture=(i:number)=>rankedFixture({fixtureId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,publicId:String(i).padStart(16,'0'),
 kickoff:'2026-10-17T20:00:00Z',competitionSlug:'champions-league',
 home:{slug:'home',name:'Home',publicId:String(i+100).padStart(16,'0'),imageUrl:null,country:null},
 away:{slug:'away',name:'Away',publicId:String(i+200).padStart(16,'0'),imageUrl:null,country:null}});
let candidates=Array.from({length:6},(_,i)=>fixture(i)),committed=new Map<CoreGeo,GrowthSeoUpsert[]>();
const run=(date=now,geo:CoreGeo='CO')=>runGrowthSelection(db,'AUTOMATIC',{now:date,geo});
const picks=(geo:CoreGeo='CO')=>committed.get(geo)!;
beforeEach(()=>{
 vi.clearAllMocks();committed=new Map();candidates=Array.from({length:6},(_,i)=>fixture(i));
 vi.mocked(readGrowthFixtures).mockImplementation(async(_db,_now,geo)=>candidates.map(r=>({...r,geo,destinationUrl:`https://livasports.com/${geo!.toLowerCase()}/partido/${r.signals.publicId}`})));
 vi.mocked(readGeoGrowthEvidence).mockResolvedValue({fixtures:new Map(),demand:[],adjustments:new Map(),search:new Map()});
 vi.mocked(readCountryDemand).mockImplementation(async(_db,geo,date)=>buildCountryDemand(geo,[],{from:'2026-09-14',to:'2026-10-11',capturedAt:null},date));
 vi.mocked(upsertGrowthSeoPriorities).mockImplementation(async(_db,rows,_now,geo='MX',finish)=>{
  const changed=JSON.stringify(committed.get(geo)?.map(r=>r.sourceHash))!==JSON.stringify(rows.map(r=>r.sourceHash));
  committed.set(geo,rows);const result={applied:true,changed};await finish?.(db,result);return result;
 });
});
describe('full unattended hourly GEO ranking (no same-day validity shortcut)',()=>{
 it('fully reranks on the next local day and also on an unchanged same-day run',async()=>{
  await run();const again=await run(new Date(now.getTime()+hour));
  expect(again.geoResults?.[0]).toMatchObject({state:'SUCCEEDED',changed:false,selected:5});
  await run(new Date(now.getTime()+24*hour));
  expect(readGrowthFixtures).toHaveBeenCalledTimes(3);expect(readGeoGrowthEvidence).toHaveBeenCalledTimes(3);expect(startDailyGeoRun).toHaveBeenCalledTimes(3);
 });
 it('replaces a valid same-day incumbent with a newly discovered higher-priority fixture',async()=>{
  await run();const before=picks().map(r=>r.fixtureId),newcomer=fixture(9);newcomer.signals.stageName='Final';candidates.push(newcomer);
  const result=await run(new Date(now.getTime()+hour));
  expect(picks()[0].fixtureId).toBe(newcomer.signals.fixtureId);expect(picks()).toHaveLength(5);
  expect(before.filter(id=>!picks().some(r=>r.fixtureId===id))).toHaveLength(1);expect(result.geoResults?.[0].changed).toBe(true);
 });
 it.each(['LIVE','FINISHED','POSTPONED','CANCELLED','KICKOFF_PASSED'])('replaces an expired %s selection without requiring owner approval',async status=>{
  await run();const id=picks()[0].fixtureId,old=candidates.find(r=>r.signals.fixtureId===id)!;
  if(status==='KICKOFF_PASSED')old.signals.kickoff=now.toISOString();else old.signals.status=status;
  await run(new Date(now.getTime()+hour));expect(picks()).toHaveLength(5);expect(picks().some(r=>r.fixtureId===id)).toBe(false);
 });
 it('consumes newly qualified country evidence during the same day, independently per GEO',async()=>{
  await run();const last=candidates[5],rows:CountrySearchRow[]=Array.from({length:8},(_,i)=>({day:`2026-10-0${i+1}`,page:'https://livasports.com/en/team/example',impressions:10,clicks:1,competition:null,homePublicId:null,awayPublicId:null,teamPublicId:last.signals.home.publicId}));
  vi.mocked(readCountryDemand).mockImplementation(async(_db,geo,date)=>buildCountryDemand(geo,geo==='CO'?rows:[],{from:'2026-09-14',to:'2026-10-11',capturedAt:now.toISOString()},date));
  await run(new Date(now.getTime()+hour));await run(new Date(now.getTime()+hour),'PE');
  expect(picks()[0].fixtureId).toBe(last.signals.fixtureId);expect(picks('PE').some(r=>r.fixtureId===last.signals.fixtureId)).toBe(false);
 });
 it('reads changed qualified engagement evidence even without a new Google capture',async()=>{
  await run();const last=candidates[5],{bettingEvidence,emptyWindow}=await import('./demand');
  const demand=bettingEvidence('CO',([7,14,28] as const).map(days=>({...emptyWindow(days),sessions:200,observedDays:8,fixtures:8,views:120,markets:90,selections:80,slipAdds:60,comparisons:50,bookmakerInteractions:40,outbound:30})));
  expect(demand.strength).toBeGreaterThan(0);
  vi.mocked(readGeoGrowthEvidence).mockResolvedValue({fixtures:new Map([[last.signals.fixtureId,demand]]),demand:[],adjustments:new Map(),search:new Map()});
  await run(new Date(now.getTime()+hour));expect(picks()[0].fixtureId).toBe(last.signals.fixtureId);
 });
 it('does not rewrite priorities just because countdown prose changed; numeric score changes still apply',async()=>{
  await run();const hashes=picks().map(r=>r.sourceHash);const result=await run(new Date(now.getTime()+hour));
  expect(picks().map(r=>r.sourceHash)).toEqual(hashes);expect(result.geoResults?.[0].changed).toBe(false);
  candidates[5].signals.stageName='Final';await run(new Date(now.getTime()+2*hour));expect(picks().map(r=>r.sourceHash)).not.toEqual(hashes);
 });
 it('keeps last successful data on a read failure and recovers automatically next hour',async()=>{
  await run();const original=picks();vi.mocked(readGrowthFixtures).mockRejectedValueOnce(Error('DB_UNAVAILABLE'));
  expect((await run(new Date(now.getTime()+hour))).state).toBe('FAILED');expect(picks()).toBe(original);
  expect(await run(new Date(now.getTime()+2*hour))).toMatchObject({state:'SUCCEEDED',selectionCount:5,providerRequests:0,mediaGeneration:'DISABLED'});
 });
 it('keeps exactly five on a single-league day but never invents missing candidates',async()=>{
  await run();expect(picks()).toHaveLength(5);candidates=candidates.slice(0,3);await run(new Date(now.getTime()+hour));expect(picks()).toHaveLength(3);
 });
});
