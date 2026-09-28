import 'server-only';
import type {DatabaseClient} from '@/database/client';
import {buildShortlist} from './shortlist';
import {scoreFixture} from './scoring';
import {generatedContent} from './content';
import {renderSocialPackage} from './social-renderer';
import {renderCanonicalStatics} from './canonical-renderer';
import {exposeMaster} from './master-model';
import {socialExportReady} from './manual-publishing';
import {VIDEO_CHANNELS} from './config';
import {SHORTLIST,type GrowthVideoChannel} from './config';
import {acquireGrowthJob,enrichGrowthStorySignals,finishGrowthJob,persistGrowthItem,readGrowthFixtures,readGrowthItem,readGrowthVideo,readLatestGrowthItems,upsertGrowthSeoPriorities,rebuildCurrentGrowthQueue} from './repository';
import type {GrowthContentPack,GrowthDashboard,RankedGrowthFixture} from './types';
import {CREATIVE_VERSION} from './creative-version';
import {databaseVoiceStore} from './voice-store';
import type {RenderedGrowthVideo} from './video-renderer';
import {readPublishingOverview,readCurrentPostingReceipts} from './manual-repository';

export interface GrowthContentGenerator {kind:'DETERMINISTIC_TEMPLATE'|'OPTIONAL_AI_REWRITE';generate(fixture:RankedGrowthFixture):GrowthContentPack;}
export interface GrowthRunResult {state:'SUCCEEDED'|'PARTIAL'|'FAILED'|'ALREADY_RUNNING';jobId:string|null;considered:number;generated:number;skippedDuplicate:number;pending?:number;itemIds:string[];error?:string;providerRequests:0;}
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
/** A single lease covers selection, cache lookup, synthesis, rendering and commit. No duplicate work
 * is started by a concurrent scheduler/owner invocation. The DB uniqueness guard is the final backstop. */
export async function runGrowthGeneration(db:DatabaseClient,trigger:'AUTOMATIC'|'OWNER',options:{now?:Date;forceFixtureId?:string}={}):Promise<GrowthRunResult>{
  const deadline=Date.now()+250_000,now=options.now??new Date(),jobId=await acquireGrowthJob(db,trigger,now);
  if(!jobId)return {state:'ALREADY_RUNNING',jobId:null,considered:0,generated:0,skippedDuplicate:0,itemIds:[],providerRequests:0};
  let considered=0,generated=0,skippedDuplicate=0,failed=0;const itemIds:string[]=[];
  try{
    const inventory=await rankGrowthInventory(db,now);considered=inventory.length;
    const shortlist=buildShortlist(inventory.map(row=>row.priority));
    const topTen=await enrichGrowthStorySignals(db,rowsForPriorities(inventory,shortlist.content)),topFive=topTen.slice(0,5);
    if(options.forceFixtureId&&!topFive.some(row=>row.signals.fixtureId===options.forceFixtureId))throw Error('FIXTURE_NOT_SOCIAL_TOP_FIVE');
    const materials=topTen.map((row,index)=>({row,rank:index+1,material:generatedContent(row,index+1,topFive,now)}));
    await upsertGrowthSeoPriorities(db,materials.map(({row,rank,material})=>({fixtureId:row.signals.fixtureId,rank,score:row.priority.total,
      topSocial:rank<=5,canonicalUrl:row.destinationUrl,seo:material.content.seo!,sourceHash:material.sourceHash})),now);
    const entries=materials.map(({row,rank})=>({fixtureId:row.signals.fixtureId,rank,topSocial:rank<=5}));
    await rebuildCurrentGrowthQueue(db,entries,now);
    const items=await readLatestGrowthItems(db,1000);
    let attempted=0;
    for(const {row,rank,material} of materials){
      if(rank>5)continue; // Absolute cost boundary, including forced/manual runs.
      if(options.forceFixtureId&&row.signals.fixtureId!==options.forceFixtureId)continue;
      let previous=items.filter(item=>item.fixtureId===row.signals.fixtureId&&!item.supersededAt).sort((a,b)=>b.revision-a.revision)[0];
      const same=previous?.creativeVersion===CREATIVE_VERSION&&previous.contentIdentity===material.contentIdentity&&previous.content.assetModel==='SOCIAL_V2';
      if(same){
        // Repair missing statics without another video encode or narration purchase.
        const master=previous.canonicalAssets?.find(a=>a.kind==='MASTER_VIDEO');
        const missing=(['STORY_IMAGE','FEED_IMAGE'] as const).filter(kind=>!previous.canonicalAssets?.some(a=>a.kind===kind));
        if(master?.renderMetadata?.socialProofs&&missing.length){
          const images=(await renderCanonicalStatics(previous.content.masterSocial!,previous.fixture)).filter(a=>missing.includes(a.kind as 'STORY_IMAGE'|'FEED_IMAGE'));
          if(images.every(a=>VIDEO_CHANNELS.every(c=>master.renderMetadata!.socialProofs![c]?.[a.kind==='STORY_IMAGE'?'coverSha256':'feedSha256']===a.sha256))){
            await db.transaction(async tx=>{for(const a of images)await tx.query(
              'INSERT INTO growth_canonical_assets(content_item_id,kind,creative_version,mime_type,width,height,sha256,byte_length,asset_data,generated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(content_item_id,kind) DO NOTHING',
              [previous.id,a.kind,CREATIVE_VERSION,a.mimeType,a.width,a.height,a.sha256,a.byteLength,a.data,now]);});
            previous=exposeMaster({...previous,canonicalAssets:[...previous.canonicalAssets!,...images.map(a=>({id:'repaired',kind:a.kind,creativeVersion:CREATIVE_VERSION,mimeType:a.mimeType,width:a.width,height:a.height,sha256:a.sha256,byteLength:a.byteLength,generatedAt:now.toISOString()}))]});
          }
        }
        if(VIDEO_CHANNELS.every(channel=>socialExportReady(previous,channel)))skippedDuplicate++;
        else failed++; // Invalid same-identity data requires review, never a recurring paid retry.
        continue;
      }
      if(attempted>=SHORTLIST.generationBatchSize||Date.now()+65_000>deadline)continue;
      attempted++;
      try{
        const canonicalAssets=await renderSocialPackage(material.content.platforms!,material.fixture,{deadlineMs:deadline,voiceStore:databaseVoiceStore(db)});
        const stored=await persistGrowthItem(db,{fixtureId:row.signals.fixtureId,sourceHash:material.sourceHash,contentIdentity:material.contentIdentity,trigger,
          priorityScore:row.priority.total,scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,fixture:material.fixture,content:material.content,
          canonicalUrl:row.destinationUrl,tracking:material.tracking,now,force:false,canonicalAssets,supersedesItemId:previous?.id});
        if(stored){generated++;itemIds.push(stored.id);}else skippedDuplicate++;
      }catch(error){
        failed++;const code=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'MASTER_GENERATION_FAILED';
        console.error(JSON.stringify({event:'growth-master-failed',fixtureId:row.signals.fixtureId,code}));
        // Do not spend more narration credits after a voice failure or create degraded replacements.
        if(code.includes('VOICE')||code.includes('NARRATION'))break;
      }
    }
    await rebuildCurrentGrowthQueue(db,entries,now);
    const pending=Math.max(0,(options.forceFixtureId?1:topFive.length)-generated-skippedDuplicate);
    const state=failed||pending?'PARTIAL':'SUCCEEDED';
    await finishGrowthJob(db,jobId,state,{considered,generated,skippedDuplicate,pending,...(failed?{error:'MASTER_GENERATION_FAILED'}:{})});
    return {state,jobId,considered,generated,skippedDuplicate,pending,itemIds,...(failed?{error:'MASTER_GENERATION_FAILED'}:{}),providerRequests:0};
  }catch(error){
    const code=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'GROWTH_GENERATION_FAILED';
    await finishGrowthJob(db,jobId,'FAILED',{considered,generated,skippedDuplicate,error:code}).catch(()=>undefined);
    return {state:'FAILED',jobId,considered,generated,skippedDuplicate,itemIds,error:code,providerRequests:0};
  }
}
/** Old controls remain API-compatible; regenerate a complete platform package within the Top 5 only. */
export async function regenerateGrowthPlatform(db:DatabaseClient,itemId:string,_channel:GrowthVideoChannel,now=new Date()):Promise<GrowthRunResult>{
  const item=await readGrowthItem(db,itemId);if(!item||item.supersededAt)throw Error('PLATFORM_REGENERATION_NOT_ALLOWED');
  return runGrowthGeneration(db,'OWNER',{now,forceFixtureId:item.fixtureId});
}
async function regenerateCurrent(db:DatabaseClient,options:{now?:Date}={}):Promise<GrowthRegenerationResult>{
  const result=await runGrowthGeneration(db,'OWNER',options);return {...result,eligibleDrafts:result.generated,skippedMissingFixture:0};
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
