import 'server-only';
import type {DatabaseClient} from '@/database/client';
import {buildShortlist} from './shortlist';
import {scoreFixture,isProducible} from './scoring';
import {generatedContent} from './content';
import {acquireGrowthJob,finishGrowthJob,persistGrowthItem,readGrowthFixtures,readLatestGrowthItems,recentGrowthFixtureIds} from './repository';
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
    let selected:RankedGrowthFixture[];
    if(options.forceFixtureId){
      const row=ranked.find(candidate=>candidate.signals.fixtureId===options.forceFixtureId&&isProducible(candidate.priority));
      if(!row)throw new Error('FIXTURE_NOT_PRODUCIBLE');
      selected=[row];
    }else{
      const recent=await recentGrowthFixtureIds(db,now);
      const shortlist=buildShortlist(ranked.map(row=>row.priority),{excludeFixtureIds:recent});
      skippedDuplicate=shortlist.suppressedAsDuplicate;
      selected=rowsForPriorities(ranked,shortlist.content);
    }
    let failed=0;
    for(const row of selected){
      try{
        const material=generatedContent(row);
        const stored=await persistGrowthItem(db,{fixtureId:row.signals.fixtureId,sourceHash:material.sourceHash,trigger,
          priorityScore:row.priority.total,scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,
          fixture:material.fixture,content:material.content,canonicalUrl:row.destinationUrl,tracking:material.tracking,now,
          force:!!options.forceFixtureId});
        if(stored){generated++;itemIds.push(stored.id);}else skippedDuplicate++;
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
