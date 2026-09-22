import 'server-only';
import type {DatabaseClient} from '@/database/client';
import {buildShortlist} from './shortlist';
import {scoreFixture,isProducible} from './scoring';
import {generatedContent} from './content';
import {renderGrowthVideo,renderGrowthVideos,type GrowthVideoRenderResult} from './video-renderer';
import {SHORTLIST,VIDEO_CHANNELS,type GrowthVideoChannel} from './config';
import {acquireGrowthJob,enrichGrowthStorySignals,finishGrowthJob,persistGrowthItem,readGrowthFixtures,readGrowthItem,readGrowthVideo,readLatestGrowthItems,readV1DraftsForRegeneration,recentGrowthFixtureIds,upsertGrowthSeoPriorities} from './repository';
import type {GrowthContentPack,GrowthDashboard,RankedGrowthFixture} from './types';

/** Optional future rewrite boundary. V1 intentionally ships only the deterministic implementation. */
export interface GrowthContentGenerator {
  kind:'DETERMINISTIC_TEMPLATE'|'OPTIONAL_AI_REWRITE';
  generate(fixture:RankedGrowthFixture):GrowthContentPack;
}
export interface GrowthRunResult {
  state:'SUCCEEDED'|'PARTIAL'|'FAILED'|'ALREADY_RUNNING';
  jobId:string|null;
  considered:number;
  generated:number;
  skippedDuplicate:number;
  itemIds:string[];
  error?:string;
  providerRequests:0;
}
export interface GrowthRegenerationResult extends GrowthRunResult {eligibleDrafts:number;skippedMissingFixture:number;}

export async function rankGrowthInventory(db:DatabaseClient,now=new Date()):Promise<RankedGrowthFixture[]>{
  const fixtures=await readGrowthFixtures(db,now);
  return fixtures.map(fixture=>({...fixture,priority:scoreFixture(fixture.signals,now)}));
}

function rowsForPriorities(rows:RankedGrowthFixture[],priorities:ReturnType<typeof buildShortlist>['content']){
  const byId=new Map(rows.map(row=>[row.signals.fixtureId,row]));
  return priorities.flatMap(priority=>{const row=byId.get(priority.fixtureId);return row?[row]:[];});
}

export async function readGrowthDashboard(db:DatabaseClient,now=new Date()):Promise<GrowthDashboard>{
  const ranked=await rankGrowthInventory(db,now);
  const shortlist=buildShortlist(ranked.map(row=>row.priority));
  const byId=new Map(ranked.map(row=>[row.signals.fixtureId,row]));
  return {generatedAt:now.toISOString(),social:shortlist.social.flatMap(priority=>{const row=byId.get(priority.fixtureId);return row?[row]:[];}),
    content:rowsForPriorities(ranked,shortlist.content),items:await readLatestGrowthItems(db),
    considered:shortlist.considered,producible:shortlist.producible};
}

export async function runGrowthGeneration(db:DatabaseClient,trigger:'AUTOMATIC'|'OWNER',options:{now?:Date;forceFixtureId?:string}={}):Promise<GrowthRunResult>{
  const now=options.now??new Date(),jobId=await acquireGrowthJob(db,trigger,now);
  if(!jobId)return {state:'ALREADY_RUNNING',jobId:null,considered:0,generated:0,skippedDuplicate:0,itemIds:[],providerRequests:0};
  let considered=0,generated=0,skippedDuplicate=0;
  const itemIds:string[]=[];
  try{
    const ranked=await rankGrowthInventory(db,now);considered=ranked.length;
    const sharedShortlist=buildShortlist(ranked.map(row=>row.priority));
    const sharedTopSocial=rowsForPriorities(ranked,sharedShortlist.social);
    const sharedTopTen=await enrichGrowthStorySignals(db,rowsForPriorities(ranked,sharedShortlist.content));
    const sharedById=new Map(sharedTopTen.map(row=>[row.signals.fixtureId,row]));
    const sharedMaterials=sharedTopTen.map((row,index)=>({row,rank:index+1,material:generatedContent(row,index+1,sharedTopSocial)}));
    await upsertGrowthSeoPriorities(db,sharedMaterials.map(({row,rank,material})=>({fixtureId:row.signals.fixtureId,rank,score:row.priority.total,
      topSocial:sharedShortlist.social.some(item=>item.fixtureId===row.signals.fixtureId),canonicalUrl:row.destinationUrl,seo:material.content.seo!,sourceHash:material.sourceHash})),now);
    let selected:RankedGrowthFixture[];
    if(options.forceFixtureId){
      const row=ranked.find(candidate=>candidate.signals.fixtureId===options.forceFixtureId&&isProducible(candidate.priority));
      if(!row)throw new Error('FIXTURE_NOT_PRODUCIBLE');
      selected=[row];
    }else{
      const recent=await recentGrowthFixtureIds(db,now);
      const shortlist=buildShortlist(ranked.map(row=>row.priority),{excludeFixtureIds:recent});
      skippedDuplicate=shortlist.suppressedAsDuplicate;
      selected=rowsForPriorities(ranked,shortlist.content).slice(0,SHORTLIST.generationBatchSize);
    }
    const enrichedSelected=await enrichGrowthStorySignals(db,selected.filter(row=>!sharedById.has(row.signals.fixtureId)));
    selected=selected.map(row=>sharedById.get(row.signals.fixtureId)??enrichedSelected.find(item=>item.signals.fixtureId===row.signals.fixtureId)??row);
    const priorityRank=new Map(ranked.slice().sort((a,b)=>b.priority.total-a.priority.total||Date.parse(a.signals.kickoff)-Date.parse(b.signals.kickoff)||a.signals.publicId.localeCompare(b.signals.publicId))
      .map((row,index)=>[row.signals.fixtureId,index+1]));
    let failed=0;
    for(const row of selected){
      try{
        const rank=priorityRank.get(row.signals.fixtureId)??sharedTopTen.length+1;
        const material=generatedContent(row,rank,sharedTopSocial);
        const videos=material.content.platforms?await renderGrowthVideos(material.content.platforms,material.fixture):[];
        const stored=await persistGrowthItem(db,{fixtureId:row.signals.fixtureId,sourceHash:material.sourceHash,trigger,
          priorityScore:row.priority.total,scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,
          fixture:material.fixture,content:material.content,canonicalUrl:row.destinationUrl,tracking:material.tracking,now,
          force:!!options.forceFixtureId,videos});
        if(stored){generated++;itemIds.push(stored.id);if(videos.some(video=>video.status==='FAILED'))failed++;}else skippedDuplicate++;
      }catch{failed++;}
    }
    const state=failed?'PARTIAL':'SUCCEEDED';
    await finishGrowthJob(db,jobId,state,{considered,generated,skippedDuplicate,...(failed?{error:'ITEM_GENERATION_FAILED'}:{})},new Date());
    return {state,jobId,considered,generated,skippedDuplicate,itemIds,...(failed?{error:'ITEM_GENERATION_FAILED'}:{}),providerRequests:0};
  }catch(error){
    const code=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'GROWTH_GENERATION_FAILED';
    await finishGrowthJob(db,jobId,'FAILED',{considered,generated,skippedDuplicate,error:code},new Date()).catch(()=>undefined);
    return {state:'FAILED',jobId,considered,generated,skippedDuplicate,itemIds,error:code,providerRequests:0};
  }
}

/** One-time production-safe V1 migration: only unsuperseded items whose every channel is still DRAFT. */
export async function regenerateV1Drafts(db:DatabaseClient,options:{now?:Date}={}):Promise<GrowthRegenerationResult>{
  const now=options.now??new Date(),drafts=await readV1DraftsForRegeneration(db),jobId=await acquireGrowthJob(db,'OWNER',now);
  if(!jobId)return {state:'ALREADY_RUNNING',jobId:null,considered:0,generated:0,skippedDuplicate:0,itemIds:[],providerRequests:0,eligibleDrafts:drafts.length,skippedMissingFixture:0};
  let considered=0,generated=0,failed=0,skippedMissingFixture=0;const itemIds:string[]=[];
  try{
    const ranked=await rankGrowthInventory(db,now),shared=buildShortlist(ranked.map(row=>row.priority));
    const topSocial=rowsForPriorities(ranked,shared.social),byId=new Map(ranked.map(row=>[row.signals.fixtureId,row]));
    const candidates=drafts.flatMap(draft=>{const row=byId.get(String(draft.fixture_id));if(!row){skippedMissingFixture++;return [];}return [{draft,row}];});
    considered=candidates.length;const enriched=await enrichGrowthStorySignals(db,candidates.map(item=>item.row));
    const rankMap=new Map(ranked.slice().sort((a,b)=>b.priority.total-a.priority.total||Date.parse(a.signals.kickoff)-Date.parse(b.signals.kickoff)||a.signals.publicId.localeCompare(b.signals.publicId)).map((row,index)=>[row.signals.fixtureId,index+1]));
    for(const candidate of candidates){
      const row=enriched.find(item=>item.signals.fixtureId===candidate.row.signals.fixtureId)!;
      try{const material=generatedContent(row,rankMap.get(row.signals.fixtureId)??1,topSocial),videos=await renderGrowthVideos(material.content.platforms!,material.fixture);
        const stored=await persistGrowthItem(db,{fixtureId:row.signals.fixtureId,sourceHash:material.sourceHash,trigger:'OWNER',priorityScore:row.priority.total,
          scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,fixture:material.fixture,content:material.content,canonicalUrl:row.destinationUrl,
          tracking:material.tracking,now,force:true,videos,supersedesItemId:String(candidate.draft.id)});
        if(stored){generated++;itemIds.push(stored.id);if(videos.some(video=>video.status==='FAILED'))failed++;}
      }catch{failed++;}
    }
    const state=failed||skippedMissingFixture?'PARTIAL':'SUCCEEDED';const error=failed?'DRAFT_REGENERATION_ITEM_FAILED':skippedMissingFixture?'DRAFT_FIXTURE_OUTSIDE_ACTIVE_WINDOW':undefined;
    await finishGrowthJob(db,jobId,state,{considered,generated,skippedDuplicate:0,...(error?{error}:{})},new Date());
    return {state,jobId,considered,generated,skippedDuplicate:0,itemIds,...(error?{error}:{}),providerRequests:0,eligibleDrafts:drafts.length,skippedMissingFixture};
  }catch(error){const code=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'DRAFT_REGENERATION_FAILED';
    await finishGrowthJob(db,jobId,'FAILED',{considered,generated,skippedDuplicate:0,error:code},new Date()).catch(()=>undefined);
    return {state:'FAILED',jobId,considered,generated,skippedDuplicate:0,itemIds,error:code,providerRequests:0,eligibleDrafts:drafts.length,skippedMissingFixture};}
}

/** Rebuilds one platform plan/video while carrying the other platforms and their review states forward unchanged. */
export async function regenerateGrowthPlatform(db:DatabaseClient,itemId:string,channel:GrowthVideoChannel,now=new Date()):Promise<GrowthRunResult>{
  const jobId=await acquireGrowthJob(db,'OWNER',now);if(!jobId)return {state:'ALREADY_RUNNING',jobId:null,considered:0,generated:0,skippedDuplicate:0,itemIds:[],providerRequests:0};
  try{
    const item=await readGrowthItem(db,itemId),record=item?.channels.find(row=>row.channel===channel);
    if(!item||item.supersededAt||!item.content.platforms||!record||!['DRAFT','REJECTED'].includes(record.status))throw new Error('PLATFORM_REGENERATION_NOT_ALLOWED');
    const ranked=await rankGrowthInventory(db,now),row=ranked.find(candidate=>candidate.signals.fixtureId===item.fixtureId);if(!row)throw new Error('FIXTURE_NOT_PRODUCIBLE');
    const shared=buildShortlist(ranked.map(candidate=>candidate.priority)),topSocial=rowsForPriorities(ranked,shared.social);
    const [enriched]=await enrichGrowthStorySignals(db,[row]);const rank=ranked.slice().sort((a,b)=>b.priority.total-a.priority.total||Date.parse(a.signals.kickoff)-Date.parse(b.signals.kickoff)||a.signals.publicId.localeCompare(b.signals.publicId)).findIndex(candidate=>candidate.signals.fixtureId===row.signals.fixtureId)+1;
    const fresh=generatedContent(enriched,Math.max(1,rank),topSocial),freshDraft=fresh.content.platforms![channel];
    const content={...fresh.content,platforms:{...fresh.content.platforms,...item.content.platforms,[channel]:freshDraft},
      captions:{...fresh.content.captions,...item.content.captions,[channel]:freshDraft.caption}};
    const videos:GrowthVideoRenderResult[]=[];
    for(const videoChannel of VIDEO_CHANNELS){if(videoChannel===channel){try{videos.push(await renderGrowthVideo(freshDraft,fresh.fixture));}catch{videos.push({channel,status:'FAILED',mimeType:null,sha256:null,byteLength:null,data:null,errorCode:'VIDEO_RENDER_FAILED'});}continue;}
      const existing=await readGrowthVideo(db,item.id,videoChannel);if(existing)videos.push({channel:videoChannel,status:'READY',mimeType:'video/mp4',sha256:existing.sha256,byteLength:existing.byteLength,data:existing.data});
      else try{videos.push(await renderGrowthVideo(content.platforms![videoChannel],fresh.fixture));}catch{videos.push({channel:videoChannel,status:'FAILED',mimeType:null,sha256:null,byteLength:null,data:null,errorCode:'VIDEO_RENDER_FAILED'});}
    }
    const stored=await persistGrowthItem(db,{fixtureId:row.signals.fixtureId,sourceHash:fresh.sourceHash,trigger:'OWNER',priorityScore:row.priority.total,
      scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,fixture:fresh.fixture,content,canonicalUrl:row.destinationUrl,tracking:fresh.tracking,now,force:true,
      videos,supersedesItemId:item.id,regeneratedChannel:channel,channelRecords:item.channels});
    const state=videos.some(video=>video.status==='FAILED')?'PARTIAL':'SUCCEEDED';await finishGrowthJob(db,jobId,state,{considered:1,generated:stored?1:0,skippedDuplicate:0,...(state==='PARTIAL'?{error:'VIDEO_RENDER_FAILED'}:{})},new Date());
    return {state,jobId,considered:1,generated:stored?1:0,skippedDuplicate:0,itemIds:stored?[stored.id]:[],...(state==='PARTIAL'?{error:'VIDEO_RENDER_FAILED'}:{}),providerRequests:0};
  }catch(error){const code=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'PLATFORM_REGENERATION_FAILED';
    await finishGrowthJob(db,jobId,'FAILED',{considered:1,generated:0,skippedDuplicate:0,error:code},new Date()).catch(()=>undefined);
    return {state:'FAILED',jobId,considered:1,generated:0,skippedDuplicate:0,itemIds:[],error:code,providerRequests:0};}
}
