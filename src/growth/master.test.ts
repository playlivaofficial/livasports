import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./repository',()=>({acquireGrowthJob:vi.fn(),finishGrowthJob:vi.fn(),readGrowthFixtures:vi.fn(),enrichGrowthStorySignals:vi.fn(),upsertGrowthSeoPriorities:vi.fn(),rebuildCurrentGrowthQueue:vi.fn(),readLatestGrowthItems:vi.fn(),persistGrowthItem:vi.fn(),readGrowthItem:vi.fn(),readGrowthVideo:vi.fn()}));
vi.mock('./social-renderer',()=>({renderSocialPackage:vi.fn()}));
vi.mock('./voice-store',()=>({databaseVoiceStore:()=>({})}));
import * as repo from './repository';
import {renderSocialPackage} from './social-renderer';
import {socialDraftIdentity} from './socialCompliance';
import {runGrowthGeneration} from './service';
import {generatedContent} from './content';
import {rankedFixture,testNow} from './fixtures.test-support';
import {publishingItem} from './manual.test-support';
import {exposeMaster,platformViews} from './master-model';
import {postSnapshot,publicationIdentity,publishingState,currentVideoUrl} from './manual-publishing';
import {buildShortlist} from './shortlist';
import {planMasterMotion,alignTransitions,sceneTimeline} from './motion';
import type {DatabaseClient} from '@/database/client';
import type {GrowthContentItem} from './types';
const db={query:vi.fn(async()=>({rows:[],rowCount:0})),transaction:vi.fn(async fn=>fn(db)),close:vi.fn()} as unknown as DatabaseClient;
const rows=Array.from({length:10},(_,i)=>rankedFixture({fixtureId:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,publicId:String(i).padStart(16,'0')}));
function masterItem(index=0):GrowthContentItem{
 const g=generatedContent(rows[index],index+1,rows.slice(0,5),testNow),item=publishingItem();
 item.platformAssets!.forEach(a=>{a.socialProof!.draftIdentity=socialDraftIdentity(g.content.platforms![a.channel]);});
 return exposeMaster({...item,id:`item-${index}`,fixtureId:rows[index].signals.fixtureId,fixture:g.fixture,content:g.content,contentIdentity:g.contentIdentity,
  canonicalAssets:item.canonicalAssets});
}
beforeEach(()=>{
 vi.clearAllMocks();vi.mocked(repo.acquireGrowthJob).mockResolvedValue('lease');vi.mocked(repo.readGrowthFixtures).mockResolvedValue(rows);
 vi.mocked(repo.finishGrowthJob).mockResolvedValue(undefined);
 vi.mocked(repo.enrichGrowthStorySignals).mockImplementation(async(_db,r)=>r);vi.mocked(repo.readLatestGrowthItems).mockResolvedValue([]);
 vi.mocked(repo.persistGrowthItem).mockResolvedValue({id:'new',revision:1});vi.mocked(renderSocialPackage).mockResolvedValue([]);
});
describe('canonical master model',()=>{
 it('derives three editorial exports from one canonical source',()=>{
  const material=generatedContent(rows[0],1,rows.slice(0,5),testNow);expect(Object.keys(material.content.platforms!)).toHaveLength(3);
  expect(material.content.masterSocial?.scenes.map(s=>s.visual)).toEqual(['HOOK','CONTEXT','EDITORIAL_DATA','CTA']);
  expect(material.content.story?.angle).not.toBe('TOP_MATCHES_TODAY');
  expect(material.content).toEqual(generatedContent(rows[0],1,rows.slice(0,5),testNow).content);
 });
 it('keeps one shared verified download with three posting states and sources',()=>{
  const item=masterItem();item.channels[0].status='PUBLISHED';
  expect(new Set(item.platformAssets!.map(a=>a.sha256)).size).toBe(1);
  expect(new Set(['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'].map(c=>currentVideoUrl(item,c as 'TIKTOK'))).size).toBe(1);
  expect(publishingState(item,'TIKTOK')).toBe('POSTED');expect(publishingState(item,'INSTAGRAM_REELS')).toBe('READY_TO_POST');
  const channels=['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'] as const;
  expect(new Set(channels.map(c=>postSnapshot(item,c).utmSource)).size).toBe(3);
  expect(new Set(channels.map(c=>publicationIdentity(item,c))).size).toBe(1);
  expect(platformViews(item.content)!.TIKTOK.script).toBe(platformViews(item.content)!.YOUTUBE_SHORTS.script);
  expect(new Set(channels.map(c=>postSnapshot(item,c).caption)).size).toBe(3);
 });
 it('preserves the ordered SEO Top 10 and makes exactly ranks 1–5 social',()=>{
  const shortlist=buildShortlist(rows.map(r=>r.priority));expect(shortlist.content).toHaveLength(10);expect(shortlist.social).toEqual(shortlist.content.slice(0,5));
 });
 it('refreshes five SEO priorities per GEO but creates no media job, lease, assets or media history writes',async()=>{
  const result=await runGrowthGeneration(db,'AUTOMATIC',{now:testNow});
  for(const geo of ['MX','CO','PE'])expect(repo.upsertGrowthSeoPriorities).toHaveBeenCalledWith(db,expect.arrayContaining([expect.objectContaining({rank:5,topSocial:true})]),testNow,geo);
  expect(result).toMatchObject({state:'SUCCEEDED',selectionCount:15,socialCount:15,generated:0,jobId:null,pending:0,mediaGeneration:'DISABLED',providerRequests:0});
  for(const fn of [repo.acquireGrowthJob,repo.finishGrowthJob,repo.persistGrowthItem,repo.rebuildCurrentGrowthQueue,repo.readLatestGrowthItems,renderSocialPackage])expect(fn).not.toHaveBeenCalled();
 });
 it('refreshes again without repairing missing media or retrying a failed render',async()=>{
  vi.mocked(renderSocialPackage).mockRejectedValue(Error('VOICE_HTTP_500'));
  const items=rows.slice(0,5).map((_,i)=>masterItem(i));items.forEach(item=>{item.canonicalAssets=[];});
  vi.mocked(repo.readLatestGrowthItems).mockResolvedValue(items);
  for(let i=0;i<2;i++)expect(await runGrowthGeneration(db,'OWNER',{now:testNow})).toMatchObject({state:'SUCCEEDED',generated:0});
  expect(repo.upsertGrowthSeoPriorities).toHaveBeenCalledTimes(6);expect(repo.readLatestGrowthItems).not.toHaveBeenCalled();
  expect(renderSocialPackage).not.toHaveBeenCalled();expect(repo.persistGrowthItem).not.toHaveBeenCalled();
 });
 it('rejects forced generation even for a Top 5 fixture before DB or rendering work',async()=>{
  expect(await runGrowthGeneration(db,'OWNER',{now:testNow,forceFixtureId:rows[0].signals.fixtureId})).toMatchObject({state:'FAILED',error:'MEDIA_GENERATION_DISABLED'});
  expect(repo.readGrowthFixtures).not.toHaveBeenCalled();expect(repo.acquireGrowthJob).not.toHaveBeenCalled();expect(renderSocialPackage).not.toHaveBeenCalled();
 });
 it('stabilizes geometry and quantizes joins at either benchmark frame rate',()=>{
  const draft=generatedContent(rows[0]).content.masterSocial!;
  const motion=planMasterMotion(draft.scenes,'stable',[]);expect(motion).toEqual(planMasterMotion(draft.scenes,'stable',[]));
  for(const scene of motion.scenes){expect(scene.camera).toMatchObject({fromScale:1,toScale:1,panX:0,panY:0,punch:0});expect(scene.heroDrift).toEqual({dx:0,dy:0});}
  for(const fps of [15,18]){const aligned=alignTransitions(motion,fps),timeline=sceneTimeline(draft.scenes,aligned.transitions,new Map(),{fps,lead:.2,tail:.3});
   for(const scene of timeline.scenes)expect(scene.startSeconds*fps).toBeCloseTo(Math.round(scene.startSeconds*fps),6);
  }
 });
});
