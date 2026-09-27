import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./repository',()=>({acquireGrowthJob:vi.fn(),finishGrowthJob:vi.fn(),readGrowthFixtures:vi.fn(),enrichGrowthStorySignals:vi.fn(),upsertGrowthSeoPriorities:vi.fn(),rebuildCurrentGrowthQueue:vi.fn(),readLatestGrowthItems:vi.fn(),persistGrowthItem:vi.fn(),readGrowthItem:vi.fn(),readGrowthVideo:vi.fn()}));
vi.mock('./canonical-renderer',()=>({renderCanonicalPackage:vi.fn(),renderCanonicalStatics:vi.fn()}));
vi.mock('./voice-store',()=>({databaseVoiceStore:()=>({})}));
import * as repo from './repository';
import {renderCanonicalPackage,renderCanonicalStatics} from './canonical-renderer';
import {runGrowthGeneration} from './service';
import {generatedContent} from './content';
import {rankedFixture,testNow} from './fixtures.test-support';
import {publishingItem} from './manual.test-support';
import {exposeMaster,platformViews} from './master-model';
import {postSnapshot,publicationIdentity,publishingState,currentVideoUrl} from './manual-publishing';
import {CREATIVE_VERSION} from './creative-version';
import {buildShortlist} from './shortlist';
import {planMasterMotion,alignTransitions,sceneTimeline} from './motion';
import type {DatabaseClient} from '@/database/client';
import type {GrowthContentItem} from './types';
const db={query:vi.fn(async()=>({rows:[],rowCount:0})),transaction:vi.fn(async fn=>fn(db)),close:vi.fn()} as unknown as DatabaseClient;
const rows=Array.from({length:10},(_,i)=>rankedFixture({fixtureId:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,publicId:String(i).padStart(16,'0')}));
function masterItem(index=0):GrowthContentItem{
 const g=generatedContent(rows[index],index+1,rows.slice(0,5));
 return exposeMaster({...publishingItem(),id:`item-${index}`,fixtureId:rows[index].signals.fixtureId,fixture:g.fixture,content:g.content,contentIdentity:g.contentIdentity,
  canonicalAssets:(['MASTER_VIDEO','STORY_IMAGE','FEED_IMAGE'] as const).map(kind=>({id:kind,kind,creativeVersion:CREATIVE_VERSION,mimeType:kind==='MASTER_VIDEO'?'video/mp4':'image/png',width:1080,height:kind==='FEED_IMAGE'?1350:1920,sha256:'a'.repeat(64),byteLength:100,generatedAt:testNow.toISOString()}))});
}
beforeEach(()=>{
 vi.clearAllMocks();vi.mocked(repo.acquireGrowthJob).mockResolvedValue('lease');vi.mocked(repo.readGrowthFixtures).mockResolvedValue(rows);
 vi.mocked(repo.finishGrowthJob).mockResolvedValue(undefined);
 vi.mocked(repo.enrichGrowthStorySignals).mockImplementation(async(_db,r)=>r);vi.mocked(repo.readLatestGrowthItems).mockResolvedValue([]);
 vi.mocked(repo.persistGrowthItem).mockResolvedValue({id:'new',revision:1});vi.mocked(renderCanonicalPackage).mockResolvedValue([]);
});
describe('canonical master model',()=>{
 it('persists one narrative, not three platform packages; one match even on a busy day',()=>{
  const material=generatedContent(rows[0],1,rows.slice(0,5));expect(material.content.platforms).toBeUndefined();
  expect(material.content.masterSocial?.scenes.map(s=>s.visual)).toEqual(['HOOK','CONTEXT','ODDS','CTA']);
  expect(material.content.story?.angle).not.toBe('TOP_MATCHES_TODAY');
  expect(material.content).toEqual(generatedContent(rows[0],1,rows.slice(0,5)).content);
 });
 it('keeps one video/hash/download with three independent publication states and sources',()=>{
  const item=masterItem();item.channels[0].status='PUBLISHED';
  expect(new Set(item.platformAssets!.map(a=>a.sha256)).size).toBe(1);
  expect(new Set(['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'].map(c=>currentVideoUrl(item,c as 'TIKTOK'))).size).toBe(1);
  expect(publishingState(item,'TIKTOK')).toBe('POSTED');expect(publishingState(item,'INSTAGRAM_REELS')).toBe('READY_TO_POST');
  const channels=['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'] as const;
  expect(new Set(channels.map(c=>postSnapshot(item,c).utmSource)).size).toBe(3);
  expect(new Set(channels.map(c=>publicationIdentity(item,c))).size).toBe(1);
  expect(platformViews(item.content)!.TIKTOK.script).toBe(platformViews(item.content)!.YOUTUBE_SHORTS.script);
 });
 it('preserves the ordered SEO Top 10 and makes exactly ranks 1–5 social',()=>{
  const shortlist=buildShortlist(rows.map(r=>r.priority));expect(shortlist.content).toHaveLength(10);expect(shortlist.social).toEqual(shortlist.content.slice(0,5));
 });
 it('recomputes SEO for all 10 but never renders ranks 6–10',async()=>{
  vi.mocked(repo.readLatestGrowthItems).mockResolvedValue(rows.slice(0,5).map((_,i)=>masterItem(i)));
  const result=await runGrowthGeneration(db,'AUTOMATIC',{now:testNow});
  expect(repo.upsertGrowthSeoPriorities).toHaveBeenCalledWith(db,expect.arrayContaining([expect.objectContaining({rank:10,topSocial:false})]),testNow);
  expect(repo.rebuildCurrentGrowthQueue).toHaveBeenCalledTimes(2);
  expect(result.skippedDuplicate).toBe(5);expect(renderCanonicalPackage).not.toHaveBeenCalled();
 });
 it('renders a bounded batch of master packages once; concurrent invocations do no work',async()=>{
  const result=await runGrowthGeneration(db,'AUTOMATIC',{now:testNow});expect(result.generated).toBe(5);
  expect(renderCanonicalPackage).toHaveBeenCalledTimes(5);expect(repo.persistGrowthItem).toHaveBeenCalledTimes(5);
  vi.mocked(repo.acquireGrowthJob).mockResolvedValue(null);
  expect((await runGrowthGeneration(db,'OWNER')).state).toBe('ALREADY_RUNNING');expect(renderCanonicalPackage).toHaveBeenCalledTimes(5);
 });
 it('repairs missing static images without any master render or narration',async()=>{
  const items=rows.slice(0,5).map((_,i)=>masterItem(i));items[0].canonicalAssets=items[0].canonicalAssets!.filter(a=>a.kind==='MASTER_VIDEO');
  vi.mocked(repo.readLatestGrowthItems).mockResolvedValue(items);vi.mocked(renderCanonicalStatics).mockResolvedValue([]);
  await runGrowthGeneration(db,'OWNER',{now:testNow});expect(renderCanonicalStatics).toHaveBeenCalledTimes(1);expect(renderCanonicalPackage).not.toHaveBeenCalled();
 });
 it('refuses forced generation outside Top 5 and retains predecessors on voice failure',async()=>{
  expect((await runGrowthGeneration(db,'OWNER',{now:testNow,forceFixtureId:rows[9].signals.fixtureId})).error).toBe('FIXTURE_NOT_SOCIAL_TOP_FIVE');
  expect(renderCanonicalPackage).not.toHaveBeenCalled();vi.mocked(renderCanonicalPackage).mockRejectedValue(Error('NARRATION_INCOMPLETE_KEEP_PREDECESSOR'));
  expect((await runGrowthGeneration(db,'OWNER',{now:testNow})).state).toBe('PARTIAL');expect(repo.persistGrowthItem).not.toHaveBeenCalled();expect(renderCanonicalPackage).toHaveBeenCalledTimes(1);
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
