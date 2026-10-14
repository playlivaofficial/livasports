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
import {readCountryDemand} from './country-demand-read';
import {buildCountryDemand,fixtureCountryDemand} from './country-demand';
import {gscWindows} from '@/seo/gsc-ingest';
import {DAILY_GROWTH_VERSION} from './daily-policy';
import {dailyGeoNeedsRanking,startDailyGeoRun,finishDailyGeoRun,readDailyGrowthReport,markDailyGrowthCheck} from './daily-repository';
import {competitionPath} from '@/sports/policy';
import {geoProfile} from '@/config/geo';
import {interfaceRoutes,teamPath} from '@/localization/interface';
import {readPublishingOverview,readCurrentPostingReceipts} from './manual-repository';

export interface GrowthContentGenerator {kind:'DETERMINISTIC_TEMPLATE'|'OPTIONAL_AI_REWRITE';generate(fixture:RankedGrowthFixture):GrowthContentPack;}
export interface GrowthRunResult {state:'SUCCEEDED'|'PARTIAL'|'FAILED'|'ALREADY_RUNNING';jobId:string|null;considered:number;generated:number;skippedDuplicate:number;pending?:number;itemIds:string[];error?:string;providerRequests:0;selectionCount?:number;socialCount?:number;mediaGeneration?:'DISABLED';geoResults?:Array<{geo:CoreGeo;state:'SUCCEEDED'|'FAILED'|'SUPERSEDED'|'FRESH';selected:number;changed:boolean;runId:string|null;error?:string}>;}
export interface GrowthRegenerationResult extends GrowthRunResult {eligibleDrafts:number;skippedMissingFixture:number;}
async function rankedState(db:DatabaseClient,now:Date,geo:CoreGeo){
  const [fixtures,country]=await Promise.all([readGrowthFixtures(db,now,geo),readCountryDemand(db,geo,now).catch(()=>buildCountryDemand(geo,[],{...gscWindows(now).current28,capturedAt:null},now))]);
  const evidence=await readGeoGrowthEvidence(db,geo,fixtures.map(f=>f.destinationUrl),now);
  const ranked:RankedGrowthFixture[]=fixtures.map(fixture=>{
    const intent=evidence.fixtures.get(fixture.signals.fixtureId)??bettingEvidence(geo,[emptyWindow(7),emptyWindow(14),emptyWindow(28)]),search=evidence.search.get(fixture.destinationUrl);
    const countrySearch=fixtureCountryDemand(fixture.signals,country);
    return {...fixture,geo,bettingEvidence:intent,searchEvidence:search,countrySearchEvidence:countrySearch,priority:scoreFixture(fixture.signals,now,{geo,demandAdjustment:evidence.adjustments.get(fixture.signals.competitionSlug)??0,
      intentStrength:intent.strength,intentReason:intent.reason,searchStrength:search?.strength??0,countrySearchStrength:countrySearch.strength,countrySearchReason:countrySearch.reason})};
  });
  return {ranked,evidence,country};
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
  return {geo,demand:evidence.demand,selection:await readGrowthSelectionHistory(db,geo),daily:await readDailyGrowthReport(db,geo,now),generatedAt:now.toISOString(),social:rowsForPriorities(ranked,shortlist.social),content:rowsForPriorities(ranked,shortlist.content),
    publishing,items:await readLatestGrowthItems(db),considered:shortlist.considered,producible:shortlist.producible};
}
/** Daily intelligence stops at SEO metadata. No renderer/voice imports, media jobs,
 * leases, repairs, retries, or asset writes. Persistence uses a short shortlist transaction lock. */
export async function runGrowthSelection(db:DatabaseClient,trigger:'AUTOMATIC'|'OWNER',options:{now?:Date;geo?:CoreGeo}={}):Promise<GrowthRunResult>{
  const now=options.now??new Date();
  let considered=0,selectionCount=0;
  const geoResults:NonNullable<GrowthRunResult['geoResults']>=[];
  for(const geo of options.geo?[options.geo]:CORE_GEOS){
   let runId:string|null=null;
   try{
    if(trigger==='AUTOMATIC'&&!await dailyGeoNeedsRanking(db,geo,now)){await markDailyGrowthCheck(db,geo,now);selectionCount+=5;geoResults.push({geo,state:'FRESH',selected:5,changed:false,runId:null});continue;}
    runId=await startDailyGeoRun(db,geo,trigger,now);
    const {ranked:inventory,evidence,country}=await rankedState(db,now,geo);
    const committed=await persistGeoDemand(db,geo,evidence.demand,now);
    for(const row of inventory)row.priority=scoreFixture(row.signals,now,{geo,demandAdjustment:committed.get(row.signals.competitionSlug)??0,
      intentStrength:row.bettingEvidence?.strength??0,intentReason:row.bettingEvidence?.reason,searchStrength:row.searchEvidence?.strength??0,
      countrySearchStrength:row.countrySearchEvidence?.strength??0,countrySearchReason:row.countrySearchEvidence?.reason});
    const shortlist=buildShortlist(inventory.map(row=>row.priority),{size:5});
    const materials=rowsForPriorities(inventory,shortlist.content).map((row,index)=>{
      const rank=index+1,seo=seoPriority(row,rank);
      const sourceHash=createHash('sha256').update(JSON.stringify({version:DAILY_GROWTH_VERSION,geo,fixture:row.signals.fixtureId,kickoff:row.signals.kickoff,rank,score:row.priority.total,seo,breakdown:row.priority.lines})).digest('hex');
      return {fixtureId:row.signals.fixtureId,rank,score:row.priority.total,topSocial:true,canonicalUrl:row.destinationUrl,seo,sourceHash,
        label:`${row.signals.home.name} × ${row.signals.away.name}`,breakdown:row.priority.lines,reasons:row.priority.reasons,evidence:{betting:row.bettingEvidence,search:row.searchEvidence,country:row.countrySearchEvidence}};
    });
    const selected=rowsForPriorities(inventory,shortlist.content).map((row,index)=>{
      const locale=geoProfile(geo).locale;
      return {fixtureId:row.signals.fixtureId,rank:index+1,score:row.priority.total,label:`${row.signals.home.name} × ${row.signals.away.name}`,canonicalUrl:row.destinationUrl,
        kickoff:row.signals.kickoff,status:row.signals.status,competition:row.signals.competitionSlug,breakdown:row.priority.lines,evidence:{country:row.countrySearchEvidence,search:row.searchEvidence,betting:row.bettingEvidence},
        discoveryPaths:[interfaceRoutes[locale].home,interfaceRoutes[locale].today,competitionPath(locale,row.signals.competitionSlug),teamPath(locale,row.signals.home.publicId,row.signals.home.name),teamPath(locale,row.signals.away.publicId,row.signals.away.name)]};
    });
    const persisted=await upsertGrowthSeoPriorities(db,materials,now,geo,async(tx,outcome)=>{
      await finishDailyGeoRun(tx,runId,{state:outcome.applied?'SUCCEEDED':'SUPERSEDED',considered:inventory.length,eligible:shortlist.producible,selection:selected,country,changed:outcome.changed},options.now??new Date());
    });
    considered+=inventory.length;
    const state=persisted?.applied===false?'SUPERSEDED':'SUCCEEDED';
    const count=state==='SUCCEEDED'?materials.length:0;selectionCount+=count;
    geoResults.push({geo,state,selected:count,changed:persisted?.changed??false,runId});
   }catch(error){
    const code=String((error as {code?:string}).code??''),diagnostic=`GEO_SELECTION_FAILED${/^[A-Z0-9_]{1,24}$/.test(code)?`_${code}`:''}`;
    await finishDailyGeoRun(db,runId,{state:'FAILED',error:diagnostic},options.now??new Date()).catch(()=>undefined);
    geoResults.push({geo,state:'FAILED',selected:0,changed:false,runId,error:diagnostic});
   }
  }
  const failed=geoResults.filter(r=>r.state==='FAILED'||r.state==='SUPERSEDED').length;
  return {state:failed===geoResults.length?'FAILED':failed?'PARTIAL':'SUCCEEDED',jobId:null,considered,selectionCount,socialCount:selectionCount,geoResults,
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
