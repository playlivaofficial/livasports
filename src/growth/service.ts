import 'server-only';
import type {DatabaseClient} from '@/database/client';
import {buildShortlist} from './shortlist';
import {scoreFixture} from './scoring';
import {generatedContent} from './content';
import {socialExportReady} from './manual-publishing';
import type {GrowthVideoChannel} from './config';
import {enrichGrowthStorySignals,readGrowthFixtures,readGrowthVideo,readLatestGrowthItems,upsertGrowthSeoPriorities} from './repository';
import type {GrowthContentPack,GrowthDashboard,RankedGrowthFixture} from './types';
import {CREATIVE_VERSION} from './creative-version';
import type {RenderedGrowthVideo} from './video-renderer';
import {readPublishingOverview,readCurrentPostingReceipts} from './manual-repository';

export interface GrowthContentGenerator {kind:'DETERMINISTIC_TEMPLATE'|'OPTIONAL_AI_REWRITE';generate(fixture:RankedGrowthFixture):GrowthContentPack;}
export interface GrowthRunResult {state:'SUCCEEDED'|'PARTIAL'|'FAILED'|'ALREADY_RUNNING';jobId:string|null;considered:number;generated:number;skippedDuplicate:number;pending?:number;itemIds:string[];error?:string;providerRequests:0;selectionCount?:number;socialCount?:number;mediaGeneration?:'DISABLED';}
export interface GrowthRegenerationResult extends GrowthRunResult {eligibleDrafts:number;skippedMissingFixture:number;}
export async function rankGrowthInventory(db:DatabaseClient,now=new Date()):Promise<RankedGrowthFixture[]>{
  return (await readGrowthFixtures(db,now)).map(fixture=>({...fixture,priority:scoreFixture(fixture.signals,now)}));
}
function rowsForPriorities(rows:RankedGrowthFixture[],priorities:ReturnType<typeof buildShortlist>['content']){
  const byId=new Map(rows.map(row=>[row.signals.fixtureId,row]));return priorities.flatMap(p=>byId.has(p.fixtureId)?[byId.get(p.fixtureId)!]:[]);
}
export async function readGrowthDashboard(db:DatabaseClient,now=new Date()):Promise<GrowthDashboard>{
  const ranked=await rankGrowthInventory(db,now),shortlist=buildShortlist(ranked.map(row=>row.priority));
  let publishing:GrowthDashboard['publishing'];
  try{publishing=await readPublishingOverview(db);publishing.currentPosts=await readCurrentPostingReceipts(db,shortlist.content.map(row=>row.fixtureId));}
  catch(error){if((error as {code?:string}).code!=='42P01')throw error;}
  return {generatedAt:now.toISOString(),social:rowsForPriorities(ranked,shortlist.social),content:rowsForPriorities(ranked,shortlist.content),
    publishing,items:await readLatestGrowthItems(db),considered:shortlist.considered,producible:shortlist.producible};
}
/** Daily intelligence stops at SEO metadata. No renderer/voice imports, media jobs,
 * leases, repairs, retries, or asset writes. Persistence uses a short shortlist transaction lock. */
export async function runGrowthSelection(db:DatabaseClient,_trigger:'AUTOMATIC'|'OWNER',options:{now?:Date}={}):Promise<GrowthRunResult>{
  const now=options.now??new Date();
  const inventory=await rankGrowthInventory(db,now),shortlist=buildShortlist(inventory.map(row=>row.priority));
  const topTen=await enrichGrowthStorySignals(db,rowsForPriorities(inventory,shortlist.content)),topFive=topTen.slice(0,5);
  const materials=topTen.map((row,index)=>({row,rank:index+1,material:generatedContent(row,index+1,topFive,now)}));
  await upsertGrowthSeoPriorities(db,materials.map(({row,rank,material})=>({fixtureId:row.signals.fixtureId,rank,score:row.priority.total,
    topSocial:rank<=5,canonicalUrl:row.destinationUrl,seo:material.content.seo!,sourceHash:material.sourceHash})),now);
  return {state:'SUCCEEDED',jobId:null,considered:inventory.length,selectionCount:topTen.length,socialCount:topFive.length,
    generated:0,skippedDuplicate:0,pending:0,itemIds:[],mediaGeneration:'DISABLED',providerRequests:0};
}
function disabledGeneration():GrowthRunResult{
  return {state:'FAILED',jobId:null,considered:0,generated:0,skippedDuplicate:0,pending:0,itemIds:[],error:'MEDIA_GENERATION_DISABLED',mediaGeneration:'DISABLED',providerRequests:0};
}
/** Compatibility for old callers: refresh intelligence only; forced media requests fail closed. */
export async function runGrowthGeneration(db:DatabaseClient,trigger:'AUTOMATIC'|'OWNER',options:{now?:Date;forceFixtureId?:string}={}):Promise<GrowthRunResult>{
  return options.forceFixtureId?disabledGeneration():runGrowthSelection(db,trigger,options);
}
/** Legacy regeneration controls do not read/write the database or invoke a renderer. */
export async function regenerateGrowthPlatform(_db:DatabaseClient,_itemId:string,_channel:GrowthVideoChannel,_now?:Date):Promise<GrowthRunResult>{
  void [_db,_itemId,_channel,_now];return disabledGeneration();
}
async function regenerateCurrent(_db:DatabaseClient,_options?:{now?:Date}):Promise<GrowthRegenerationResult>{
  void [_db,_options];return {...disabledGeneration(),eligibleDrafts:0,skippedMissingFixture:0};
}
export const regenerateV1Drafts=regenerateCurrent;
export const regeneratePremiumDrafts=regenerateCurrent;
export const regenerateRightsFallbackDrafts=regenerateCurrent;
/** Preview is a read of committed bytes, never an implicit paid synthesis endpoint. */
export async function previewGrowthVideo(db:DatabaseClient,fixtureId:string,channel:GrowthVideoChannel):Promise<RenderedGrowthVideo>{
  const dashboard=await readGrowthDashboard(db);
  if(!dashboard.social.some(row=>row.signals.fixtureId===fixtureId))throw Error('FIXTURE_NOT_SOCIAL_TOP_FIVE');
  const item=dashboard.items.find(i=>i.fixtureId===fixtureId&&!i.supersededAt&&i.creativeVersion===CREATIVE_VERSION);
  if(!item||!socialExportReady(item,channel))throw Error('SOCIAL_BLOCKED_FOR_REVIEW');
  const video=await readGrowthVideo(db,item.id,channel);if(!video)throw Error('MASTER_NOT_READY');
  return {...video,channel,status:'READY',mimeType:'video/mp4',voice:video.renderMetadata?.voice};
}
