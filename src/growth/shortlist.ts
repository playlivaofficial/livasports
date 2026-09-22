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
}
export interface Shortlist {
  social:FixturePriority[];
  content:FixturePriority[];
  considered:number;
  producible:number;
  suppressedAsDuplicate:number;
}

/** Highest score first; kickoff then public id break ties so ordering never depends on input order. */
export function rankPriorities(priorities:readonly FixturePriority[]):FixturePriority[]{
  return [...priorities].sort((a,b)=>
    b.total-a.total||
    Date.parse(a.kickoff)-Date.parse(b.kickoff)||
    a.publicId.localeCompare(b.publicId));
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
    chosen.sort((a,b)=>b.total-a.total||Date.parse(a.kickoff)-Date.parse(b.kickoff)||a.publicId.localeCompare(b.publicId));
  }
  return chosen;
}

export function buildShortlist(priorities:readonly FixturePriority[],options:ShortlistOptions={}):Shortlist{
  const exclude=options.excludeFixtureIds??new Set<string>();
  const producible=rankPriorities(priorities.filter(isProducible));
  const fresh=producible.filter(priority=>!exclude.has(priority.fixtureId));
  const content=pickWithDiversity(fresh,SHORTLIST.contentSize,SHORTLIST.maxPerCompetitionContent);
  // Social is a strict subset of content, with a tighter cap so a single round cannot own the feed.
  const social=pickWithDiversity(content,SHORTLIST.socialSize,SHORTLIST.maxPerCompetitionSocial);
  return {social,content,considered:priorities.length,producible:producible.length,
    suppressedAsDuplicate:producible.length-fresh.length};
}
