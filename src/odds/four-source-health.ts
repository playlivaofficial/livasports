import type {QueryExecutor} from '@/database/client';
import {CORE_GEOS,type CoreGeo} from '@/config/geo';
import {readListingOddsSnapshots} from './read-core';
import {readVerifiedOperatorFeeds} from './operator-feeds';
import {buildComparison,quoteState} from './comparison';
import {BOOKMAKER_REGISTRY,VISIBLE_BOOKMAKERS} from './registry';
import {fallbackReferenceBookmakers} from './fallback-pool';
import {SELECTIONS,type OddsMarket,type OddsReadSnapshot} from './types';

/**
 * Operators expected to price a jurisdiction. Taken from the registry rather than from whoever
 * happened to price a fixture, so the coverage baseline cannot go circular: a book that prices
 * nothing must still be measured against everything it was supposed to price.
 */
export function eligibleOperatorsFor(geo:CoreGeo):string[]{
  return VISIBLE_BOOKMAKERS.filter(book=>(book.countries as readonly string[]).includes(geo)).map(book=>book.canonicalId);
}

/**
 * Source health for ONE jurisdiction. `eligibleOperators` is that GEO's expected line-up: every
 * fixture counts as expected coverage for those operators and for no others, so bwin is never
 * penalised for Mexico and Inkabet is never penalised for Colombia. Retired operators are excluded
 * entirely — we no longer request them, so they would report a permanent zero and misrepresent health.
 */
export function summarizeFourSources(snapshots:readonly OddsReadSnapshot[],now:number,eligibleOperators?:readonly string[],fallbackOperators:readonly string[]=[]){
  const sources=BOOKMAKER_REGISTRY.filter(book=>book.displayRole!=='RETIRED')
    .map(book=>({bookmaker:book.canonicalId,name:book.displayName,role:book.displayRole,fixtures:0,eligibleFixtures:0,currentFixtures:0,staleOrSuspended:0,markets:{MATCH_WINNER:0,TOTAL_GOALS:0,BTTS:0}}));
  const targets=VISIBLE_BOOKMAKERS.map(book=>({bookmaker:book.canonicalId,real:0,proxy:0,unavailable:0,BETANO_INSURANCE_USED:0,BETANO_INSURANCE_FAILED:0,ALTERNATE_INSURANCE_USED:0,NO_INSURANCE_AVAILABLE:0}));
  const visibleReal={three:0,two:0,one:0,none:0};
  for(const snapshot of snapshots){
    let realBooks=0;
    // Jurisdiction line-up first, then whatever the snapshot itself declares, then everything.
    const eligible=eligibleOperators??snapshot.eligibleBookmakers?.map(book=>book.id);
    for(const source of sources){
      if(!eligible||eligible.includes(source.bookmaker))source.eligibleFixtures++;
      const quotes=snapshot.quotes.filter(q=>q.bookmaker===source.bookmaker&&q.geoEligible);
      const fresh=quotes.filter(q=>quoteState(q,snapshot,now)==='ACTIVE'&&Number(q.decimalOdds)>1&&Number(q.decimalOdds)<=1000);
      if(quotes.length)source.fixtures++;
      if(fresh.length){source.currentFixtures++;if(source.role==='VISIBLE_PRIMARY')realBooks++;}
      source.staleOrSuspended+=quotes.length-fresh.length;
      for(const market of Object.keys(SELECTIONS) as OddsMarket[])if(SELECTIONS[market].every(outcome=>fresh.some(q=>q.market===market&&q.outcome===outcome&&(market==='TOTAL_GOALS'?q.line===2.5:q.line===null))))source.markets[market]++;
    }
    visibleReal[realBooks===3?'three':realBooks===2?'two':realBooks===1?'one':'none']++;
    for(const market of Object.keys(SELECTIONS) as OddsMarket[]){
      const comparison=buildComparison(snapshot,market,now);
      for(const target of targets){
        const row=comparison.rows.find(r=>r.bookmaker===target.bookmaker);
        for(const outcome of SELECTIONS[market]){
          const cell=row?.cells.find(c=>c.outcome===outcome);
          if(cell?.decimalOdds&&cell.priceKind==='REAL'){target.real++;continue;}
          if(cell?.decimalOdds&&cell.priceKind==='PROXY'){
            target.proxy++;
            if(cell.sourceBookmaker==='betano.bet.br')target.BETANO_INSURANCE_USED++;
            else{target.BETANO_INSURANCE_FAILED++;target.ALTERNATE_INSURANCE_USED++;}
          }else{target.unavailable++;target.BETANO_INSURANCE_FAILED++;target.NO_INSURANCE_AVAILABLE++;}
        }
      }
    }
  }
  const total=targets.reduce((n,t)=>n+t.real+t.proxy,0),proxy=targets.reduce((n,t)=>n+t.proxy,0);
  // Only this jurisdiction's own line-up can degrade it. An operator that is active elsewhere but is
  // not eligible here contributes nothing to the baseline and cannot contaminate the score.
  // A configured reference source is reported on its own, never folded into the jurisdiction's
  // commitment: its outage is not a GEO outage, and its coverage can never paper over a primary's.
  const accountable=sources.filter(s=>s.role==='VISIBLE_PRIMARY'&&!fallbackOperators.includes(s.bookmaker)&&(!eligibleOperators||eligibleOperators.includes(s.bookmaker)));
  const fallbackSources=sources.filter(s=>fallbackOperators.includes(s.bookmaker));
  const bestVisible=Math.max(0,...accountable.map(s=>s.currentFixtures));
  const degraded=(snapshots.length>0&&accountable.length>0&&bestVisible===0)||proxy>total*.8||
    accountable.some(s=>s.eligibleFixtures>=5&&s.currentFixtures<s.eligibleFixtures*.25);
  return {fixtures:snapshots.length,sources,fallbackSources,targets,visibleReal,proxyPct:total?Math.round(proxy/total*1000)/10:0,degraded};
}

type SourceSummary=ReturnType<typeof summarizeFourSources>;

/**
 * Combines per-jurisdiction summaries into one owner view. Degradation is the OR of the individual
 * jurisdictions, so a Mexican outage is never masked by healthy Colombian coverage even though
 * Betsson serves both. `fixtures` stays the distinct fixture count rather than the sum of the
 * per-GEO evaluations, so a fixture eligible in three jurisdictions is not counted three times.
 */
export function mergeSourceHealth(parts:readonly {geo:CoreGeo;summary:SourceSummary;eligible?:readonly string[]}[],fixtures:number):SourceSummary&{geos:Array<{geo:CoreGeo;eligible:string[];fallback:string[];fixtures:number;degraded:boolean;proxyPct:number}>}{
  const base=summarizeFourSources([],0);
  for(const {summary} of parts){
    for(const source of base.sources){
      const from=summary.sources.find(s=>s.bookmaker===source.bookmaker);
      if(!from)continue;
      source.fixtures+=from.fixtures;source.eligibleFixtures+=from.eligibleFixtures;
      source.currentFixtures+=from.currentFixtures;source.staleOrSuspended+=from.staleOrSuspended;
      for(const market of Object.keys(source.markets) as OddsMarket[])source.markets[market]+=from.markets[market];
    }
    for(const target of base.targets){
      const from=summary.targets.find(t=>t.bookmaker===target.bookmaker);
      if(!from)continue;
      target.real+=from.real;target.proxy+=from.proxy;target.unavailable+=from.unavailable;
      target.BETANO_INSURANCE_USED+=from.BETANO_INSURANCE_USED;target.BETANO_INSURANCE_FAILED+=from.BETANO_INSURANCE_FAILED;
      target.ALTERNATE_INSURANCE_USED+=from.ALTERNATE_INSURANCE_USED;target.NO_INSURANCE_AVAILABLE+=from.NO_INSURANCE_AVAILABLE;
    }
    for(const bucket of Object.keys(base.visibleReal) as Array<keyof SourceSummary['visibleReal']>)base.visibleReal[bucket]+=summary.visibleReal[bucket];
  }
  const total=base.targets.reduce((n,t)=>n+t.real+t.proxy,0),proxy=base.targets.reduce((n,t)=>n+t.proxy,0);
  return {...base,fixtures,proxyPct:total?Math.round(proxy/total*1000)/10:0,
    degraded:parts.some(part=>part.summary.degraded),
    geos:parts.map(part=>({geo:part.geo,eligible:[...(part.eligible??eligibleOperatorsFor(part.geo))],
      fallback:fallbackReferenceBookmakers(part.geo).map(source=>source.bookmaker),
      fixtures:part.summary.fixtures,degraded:part.summary.degraded,proxyPct:part.summary.proxyPct}))};
}

export type FourSourceHealth={at:string;providerRequests:0;windows:Record<'24h'|'3d'|'7d',ReturnType<typeof mergeSourceHealth>>};

/**
 * Canonical per-jurisdiction eligibility. The verified provider mappings in the database are the
 * source of truth; the registry line-up is the fallback when that read is unavailable or a GEO has no
 * mapping yet, so a jurisdiction can never silently drop out of the baseline and look healthy.
 */
export async function readGeoEligibility(db:QueryExecutor):Promise<Record<CoreGeo,string[]>>{
  let verified:Awaited<ReturnType<typeof readVerifiedOperatorFeeds>>=[];
  try{verified=await readVerifiedOperatorFeeds(db);}catch{verified=[];}
  return Object.fromEntries(CORE_GEOS.map(geo=>{
    const mapped=[...new Set(verified.filter(feed=>feed.geo===geo).map(feed=>feed.operatorId))];
    return [geo,mapped.length?mapped:eligibleOperatorsFor(geo)];
  })) as Record<CoreGeo,string[]>;
}

export async function readFourSourceHealth(db:QueryExecutor,now=new Date()):Promise<FourSourceHealth>{
  const {rows}=await db.query(`SELECT f.id,f.kickoff FROM fixtures f JOIN competitions c ON c.id=f.competition_id AND c.enabled
    WHERE f.status='SCHEDULED' AND f.kickoff>$1 AND f.kickoff<=$1::timestamptz+interval '7 days' ORDER BY f.kickoff`,[now.toISOString()]);
  const fixtures=rows.map(row=>({id:String(row.id),kickoff:new Date(row.kickoff as string).toISOString()}));
  const eligibility=fixtures.length?await readGeoEligibility(db):({} as Record<CoreGeo,string[]>);
  // Read once per jurisdiction so every snapshot carries that GEO's own eligible target pool. A
  // fixture the read returns nothing for is an UNPRICED fixture, not an absent one, so it is filled in
  // as an empty snapshot: missing coverage has to be measured against the expected fixture universe
  // rather than against whichever fixtures happened to be priced.
  const perGeo=await Promise.all(CORE_GEOS.map(async geo=>{
    const read=fixtures.length?await readListingOddsSnapshots(db,fixtures.map(f=>f.id),geo,true):new Map();
    return {geo,eligible:eligibility[geo]??eligibleOperatorsFor(geo),
      snapshots:fixtures.map(fixture=>read.get(fixture.id)??
        ({kickoff:fixture.kickoff,fixtureStatus:'SCHEDULED',quotes:[],eligibleBookmakers:[],insuranceEnabled:false} as OddsReadSnapshot))};
  }));
  const inWindow=(snapshot:OddsReadSnapshot,hours:number)=>Date.parse(snapshot.kickoff)<=now.getTime()+hours*3600000;
  const window=(hours:number)=>mergeSourceHealth(
    perGeo.map(part=>({geo:part.geo,eligible:part.eligible,
      summary:summarizeFourSources(part.snapshots.filter(snapshot=>inWindow(snapshot,hours)),now.getTime(),part.eligible,fallbackReferenceBookmakers(part.geo).map(source=>source.bookmaker))})),
    fixtures.filter(fixture=>Date.parse(fixture.kickoff)<=now.getTime()+hours*3600000).length);
  return {at:now.toISOString(),providerRequests:0,
    windows:Object.fromEntries(([['24h',24],['3d',72],['7d',168]] as const).map(([key,hours])=>[key,window(hours)])) as FourSourceHealth['windows']};
}
