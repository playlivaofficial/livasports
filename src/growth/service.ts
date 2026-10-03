import 'server-only';
import type {DatabaseClient} from '@/database/client';
import {createHash} from 'node:crypto';
import {CORE_GEOS,type CoreGeo} from '@/config/geo';
import {buildShortlist} from './shortlist';
import {scoreFixture} from './scoring';
import {seoPriority} from './strategy';
import {readGeoGrowthEvidence,persistGeoDemand} from './evidence-repository';
import {bettingEvidence,emptyWindow} from './demand';
import {socialExportReady} from './manual-publishing';
import type {GrowthVideoChannel} from './config';
import {readGrowthFixtures,readGrowthVideo,readLatestGrowthItems,upsertGrowthSeoPriorities,readGrowthSelectionHistory} from './repository';
import type {GrowthContentPack,GrowthDashboard,RankedGrowthFixture} from './types';
import {CREATIVE_VERSION} from './creative-version';
import type {RenderedGrowthVideo} from './video-renderer';
import {readPublishingOverview,readCurrentPostingReceipts} from './manual-repository';

export interface GrowthContentGenerator {kind:'DETERMINISTIC_TEMPLATE'|'OPTIONAL_AI_REWRITE';generate(fixture:RankedGrowthFixture):GrowthContentPack;}
export interface GrowthRunResult {state:'SUCCEEDED'|'PARTIAL'|'FAILED'|'ALREADY_RUNNING';jobId:string|null;considered:number;generated:number;skippedDuplicate:number;pending?:number;itemIds:string[];error?:string;providerRequests:0;selectionCount?:number;socialCount?:number;mediaGeneration?:'DISABLED';}
export interface GrowthRegenerationResult extends GrowthRunResult {eligibleDrafts:number;skippedMissingFixture:number;}
async function rankedState(db:DatabaseClient,now:Date,geo:CoreGeo){
  const fixtures=await readGrowthFixtures(db,now,geo),evidence=await readGeoGrowthEvidence(db,geo,fixtures.map(f=>f.destinationUrl),now);
  const ranked:RankedGrowthFixture[]=fixtures.map(fixture=>{
    const intent=evidence.fixtures.get(fixture.signals.fixtureId)??bettingEvidence(geo,[emptyWindow(7),emptyWindow(14),emptyWindow(28)]),search=evidence.search.get(fixture.destinationUrl);
    return {...fixture,geo,bettingEvidence:intent,searchEvidence:search,priority:scoreFixture(fixture.signals,now,{geo,demandAdjustment:evidence.adjustments.get(fixture.signals.competitionSlug)??0,
      intentStrength:intent.strength,intentReason:intent.reason,searchStrength:search?.strength??0})};
  });
  return {ranked,evidence};
}
export async function rankGrowthInventory(db:DatabaseClient,now=new Date(),geo:CoreGeo='MX'):Promise<RankedGrowthFixture[]>{
  return (await rankedState(db,now,geo)).ranked;
}
function rowsForPriorities(rows:RankedGrowthFixture[],priorities:ReturnType<typeof buildShortlist>['content']){
  const byId=new Map(rows.map(row=>[row.signals.fixtureId,row]));return priorities.flatMap(p=>byId.has(p.fixtureId)?[byId.get(p.fixtureId)!]:[]);
}
export async function readGrowthDashboard(db:DatabaseClient,now=new Date(),geo:CoreGeo='MX'):Promise<GrowthDashboard>{
  const {ranked,evidence}=await rankedState(db,now,geo),shortlist=buildShortlist(ranked.map(row=>row.priority),{size:5});
  let publishing:GrowthDashboard['publishing'];
  try{publishing=await readPublishingOverview(db);publishing.currentPosts=await readCurrentPostingReceipts(db,shortlist.content.map(row=>row.fixtureId));}
  catch(error){if((error as {code?:string}).code!=='42P01')throw error;}
  return {geo,demand:evidence.demand,selection:await readGrowthSelectionHistory(db,geo),generatedAt:now.toISOString(),social:rowsForPriorities(ranked,shortlist.social),content:rowsForPriorities(ranked,shortlist.content),
    publishing,items:await readLatestGrowthItems(db),considered:shortlist.considered,producible:shortlist.producible};
}
/** Daily intelligence stops at SEO metadata. No renderer/voice imports, media jobs,
 * leases, repairs, retries, or asset writes. Persistence uses a short shortlist transaction lock. */
export async function runGrowthSelection(db:DatabaseClient,_trigger:'AUTOMATIC'|'OWNER',options:{now?:Date;geo?:CoreGeo}={}):Promise<GrowthRunResult>{
  const now=options.now??new Date();
  let considered=0,selectionCount=0;
  for(const geo of options.geo?[options.geo]:CORE_GEOS){
    const {ranked:inventory,evidence}=await rankedState(db,now,geo);
    const committed=await persistGeoDemand(db,geo,evidence.demand,now);
    for(const row of inventory)row.priority=scoreFixture(row.signals,now,{geo,demandAdjustment:committed.get(row.signals.competitionSlug)??0,
      intentStrength:row.bettingEvidence?.strength??0,intentReason:row.bettingEvidence?.reason,searchStrength:row.searchEvidence?.strength??0});
    const shortlist=buildShortlist(inventory.map(row=>row.priority),{size:5});
    const materials=rowsForPriorities(inventory,shortlist.content).map((row,index)=>{
      const rank=index+1,seo=seoPriority(row,rank);
      const sourceHash=createHash('sha256').update(JSON.stringify({version:'GEO_GROWTH_1',geo,fixture:row.signals.fixtureId,kickoff:row.signals.kickoff,rank,score:row.priority.total,seo})).digest('hex');
      return {fixtureId:row.signals.fixtureId,rank,score:row.priority.total,topSocial:true,canonicalUrl:row.destinationUrl,seo,sourceHash,
        label:`${row.signals.home.name} × ${row.signals.away.name}`,breakdown:row.priority.lines,reasons:row.priority.reasons,evidence:{betting:row.bettingEvidence,search:row.searchEvidence}};
    });
    await upsertGrowthSeoPriorities(db,materials,now,geo);considered+=inventory.length;selectionCount+=materials.length;
  }
  return {state:'SUCCEEDED',jobId:null,considered,selectionCount,socialCount:selectionCount,
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
