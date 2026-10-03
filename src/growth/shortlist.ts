import {SHORTLIST} from './config';
import {isProducible,type FixturePriority} from './scoring';

/**
 * Traffic Engine V1 — turning scores into a day's work list.
 *
 * Two rules beyond raw score. First, determinism: ties break on kickoff then public id, never on array
 * order, so the same data always yields the same shortlist no matter how the rows arrived. Second,
 * diversity: without a per-competition cap a single round of Brasileirão would fill every slot with five
 * near-identical fixtures, which is exactly the low-value output this milestone is meant to avoid.
 *
 * The social list is drawn from the content list, so the two can never disagree about a fixture.
 */

export interface ShortlistOptions {
  /** Fixtures produced recently; offered again only after the duplicate window passes. */
  excludeFixtureIds?:ReadonlySet<string>;
  /** Current GEO acquisition lists use five; old media/history callers may retain the legacy Top10 shape. */
  size?:number;
}
export interface Shortlist {
  social:FixturePriority[];
  content:FixturePriority[];
  considered:number;
  producible:number;
  suppressedAsDuplicate:number;
}

/** Highest score first; kickoff then public id break ties so ordering never depends on input order. */
const byRank=(a:FixturePriority,b:FixturePriority)=>
  b.total-a.total||
  Date.parse(a.kickoff)-Date.parse(b.kickoff)||
  a.publicId.localeCompare(b.publicId);

export function rankPriorities(priorities:readonly FixturePriority[]):FixturePriority[]{
  return [...priorities].sort(byRank);
}

/** Take the highest-scoring fixtures while never exceeding `cap` from any one competition. */
export function pickWithDiversity(ranked:readonly FixturePriority[],size:number,cap:number,overrideGap=SHORTLIST.diversityOverrideGap):FixturePriority[]{
  const chosen:FixturePriority[]=[],deferred:FixturePriority[]=[],used=new Map<string,number>();
  for(const priority of ranked){
    if(chosen.length>=size)break;
    const count=used.get(priority.competitionSlug)??0;
    if(count>=cap){deferred.push(priority);continue;}
    used.set(priority.competitionSlug,count+1);
    chosen.push(priority);
  }
  // The cap is a diversity preference, not a hard editorial veto. A clearly stronger fixture can
  // displace the weakest choice; small score differences keep the varied list intact.
  for(const priority of deferred){
    const weakest=chosen.at(-1);
    if(!weakest||priority.total-weakest.total<overrideGap)continue;
    chosen[chosen.length-1]=priority;
    chosen.sort(byRank);
  }
  // A quota the cap could not fill must still be filled. The cap was being applied as a hard veto
  // while filling, and the override above can only *replace* an entry, never add one — so on a light
  // calendar the list came back short (production reached `top_social` 4 of 5, and a window holding a
  // single competition collapsed the Top 10 to 4).
  //
  // Diversity is relaxed one step at a time rather than abandoned, so the list stays as varied as the
  // fixtures allow instead of jumping straight to "whatever scores highest". Nothing here changes a
  // score or a weight; it only stops the selector discarding fixtures it was asked to return.
  for(let relaxed=cap+1;chosen.length<size&&relaxed<=size;relaxed++){
    const taken=new Set(chosen.map(row=>row.fixtureId)),counts=new Map<string,number>();
    for(const row of chosen)counts.set(row.competitionSlug,(counts.get(row.competitionSlug)??0)+1);
    for(const priority of ranked){
      if(chosen.length>=size)break;
      if(taken.has(priority.fixtureId))continue;
      const count=counts.get(priority.competitionSlug)??0;
      if(count>=relaxed)continue;
      counts.set(priority.competitionSlug,count+1);
      taken.add(priority.fixtureId);
      chosen.push(priority);
    }
  }
  chosen.sort(byRank);
  return chosen;
}

export function buildShortlist(priorities:readonly FixturePriority[],options:ShortlistOptions={}):Shortlist{
  const exclude=options.excludeFixtureIds??new Set<string>();
  const producible=rankPriorities(priorities.filter(isProducible));
  const fresh=producible.filter(priority=>!exclude.has(priority.fixtureId));
  const size=options.size??SHORTLIST.contentSize;
  const content=pickWithDiversity(fresh,size,size<=5?SHORTLIST.maxPerCompetitionSocial:SHORTLIST.maxPerCompetitionContent);
  // VNext: ranks 1–5 are social; 6–10 are SEO only. Preserve the existing diversity-aware
  // Top 10 order/weights rather than promoting a rank-6 fixture past an unchanged rank-5.
  const social=content.slice(0,SHORTLIST.socialSize);
  return {social,content,considered:priorities.length,producible:producible.length,
    suppressedAsDuplicate:producible.length-fresh.length};
}

/** Canonical content ranks follow the shared diversity-aware Top 10; remaining fixtures continue in raw-score order. */
export function sharedPriorityRanks(shortlist:Pick<Shortlist,'content'>,priorities:readonly FixturePriority[]):Map<string,number>{
  const sharedIds=shortlist.content.map(row=>row.fixtureId),shared=new Set(sharedIds);
  const remaining=rankPriorities(priorities).map(row=>row.fixtureId).filter(id=>!shared.has(id));
  return new Map([...sharedIds,...remaining].map((id,index)=>[id,index+1]));
}
