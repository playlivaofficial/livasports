import { KICKOFF_TOLERANCE_MS, SELECTIONS, type OddsBookmakerRow, type OddsComparison, type OddsMarket, type OddsOutcome, type OddsReadSnapshot, type ReadOddsQuote, type OddsStatus } from './types';
import { freshnessTtlMs } from './scheduler-policy';
import {BOOKMAKER_REGISTRY,isVisibleBookmaker} from './registry';
import {resolveInsurance} from './insurance';
import {referenceSourceAllowed} from './reference-policy';
import type {IndicativeQuote} from './types';
const UNION_BOOKMAKERS=BOOKMAKER_REGISTRY.map(b=>({bookmaker:b.canonicalId,name:b.displayName}));

export function publicFeedCount(snapshot:OddsReadSnapshot):number {
  return new Set(snapshot.quotes.filter(q=>q.geoEligible).map(q=>q.bookmaker)).size;
}
export function quoteFreshnessTtlMs(quote:ReadOddsQuote,snapshot:OddsReadSnapshot,now:number):number {
  const close=Math.min(Date.parse(snapshot.kickoff),Date.parse(quote.providerKickoff));
  if(now>=close)return 0;
  if(quote.freshnessTtlMinutes!==null&&quote.freshnessTtlMinutes!==undefined)
    return Number.isFinite(quote.freshnessTtlMinutes)&&quote.freshnessTtlMinutes>0?quote.freshnessTtlMinutes*60000:0;
  return freshnessTtlMs((close-Date.parse(quote.observedAt))/3600000,publicFeedCount(snapshot));
}

export function quoteState(quote:ReadOddsQuote,snapshot:OddsReadSnapshot,now:number):OddsStatus {
  if(snapshot.fixtureStatus!=='SCHEDULED'||now>=Math.min(Date.parse(snapshot.kickoff),Date.parse(quote.providerKickoff)))return 'CLOSED';
  if(!Number.isFinite(Date.parse(snapshot.kickoff))||!Number.isFinite(Date.parse(quote.providerKickoff))||
    Math.abs(Date.parse(snapshot.kickoff)-Date.parse(quote.providerKickoff))>KICKOFF_TOLERANCE_MS)return 'CLOSED';
  if(quote.scope!=='FULL_TIME_REGULATION'||quote.phase!=='PREGAME')return 'CLOSED';
  if(quote.status!=='ACTIVE')return quote.status;
  const updated=Date.parse(quote.providerUpdatedAt??'');const observed=Date.parse(quote.observedAt);
  const refreshed=Date.parse(quote.lastSuccessfulRefreshAt);const ttl=quoteFreshnessTtlMs(quote,snapshot,now);
  if(!Number.isFinite(updated)||!Number.isFinite(observed)||!Number.isFinite(refreshed)||ttl<=0||observed>now+60000||updated>observed+60000||refreshed>now+60000||
    now-Math.min(observed,refreshed)>=ttl)return 'STALE';
  return 'ACTIVE';
}
export function buildComparison(snapshot:OddsReadSnapshot,market:OddsMarket,now=Date.now(),actions:Record<string,string>={}):OddsComparison {
  const primary=snapshot.eligibleBookmakers?.map(b=>({bookmaker:b.id,name:b.name}))??UNION_BOOKMAKERS;
  // A configured reference source is a target in its own right, never a stand-in identity for a
  // primary book. It is only admitted when the server declared it for this jurisdiction, and a book
  // that is already a primary here is never duplicated as a reference.
  const primaryPool=new Set(primary.map(b=>b.bookmaker));
  const reference=[...(snapshot.fallbackBookmakers??[])].sort((a,b)=>a.priority-b.priority)
    .filter(b=>!primaryPool.has(b.id)).map(b=>({bookmaker:b.id,name:b.name}));
  const referencePool=new Set(reference.map(b=>b.bookmaker));
  const targets=[...primary,...reference];
  const pool=new Set(targets.map(b=>b.bookmaker));
  const relevant=snapshot.quotes.filter(q=>q.geoEligible&&q.market===market&&(market==='TOTAL_GOALS'?q.line===2.5:q.line===null));
  const result:OddsComparison={market,line:market==='TOTAL_GOALS'?2.5:null,rows:[],observedAt:null,providerUpdatedAt:null,expiresAt:null,eligiblePrices:0};
  const closeTimes=[snapshot.kickoff,...relevant.map(q=>q.providerKickoff)].map(Date.parse).filter(Number.isFinite);
  result.closesAt=closeTimes.length?new Date(Math.min(...closeTimes)).toISOString():null;
  if(!relevant.some(q=>targets.some(book=>book.bookmaker===q.bookmaker)))return withReferences(result,snapshot,now);
  const nativeRows:OddsBookmakerRow[]=targets.map(({bookmaker,name})=>{
    const prices=relevant.filter(q=>q.bookmaker===bookmaker);
    const selectedMarket=selectNativeMarketQuotes(prices,market,snapshot,now);
    const cells=SELECTIONS[market].map(outcome=>{
      const matches=prices.filter(q=>q.outcome===outcome);const selected=selectedMarket.get(outcome);const q=selectedMarket.ambiguous?undefined:selected??matches.find(row=>(row.provider??'ODDSPAPI')===selectedMarket.provider)??matches[0];
      const state=q?quoteState(q,snapshot,now):'UNAVAILABLE';
      const valid=q&&Number.isFinite(Number(q.decimalOdds))&&Number(q.decimalOdds)>1&&Number(q.decimalOdds)<=1000;
      const ttl=q?quoteFreshnessTtlMs(q,snapshot,now):0;
      const expires=q?Math.min(Date.parse(q.observedAt)+ttl,Date.parse(q.lastSuccessfulRefreshAt)+ttl,Date.parse(snapshot.kickoff),Date.parse(q.providerKickoff)):NaN;
      return {outcome,decimalOdds:state==='ACTIVE'&&valid?q.decimalOdds:null,state:valid?state:'UNAVAILABLE' as const,best:false,
        expiresAt:Number.isFinite(expires)?new Date(expires).toISOString():null,
        priceKind:state==='ACTIVE'&&valid?'REAL' as const:null,targetBookmaker:bookmaker,
        sourceBookmaker:state==='ACTIVE'&&valid?q.bookmaker:null,sourceBookmakerName:state==='ACTIVE'&&valid?q.bookmakerName:null,
        sourceQuoteId:state==='ACTIVE'&&valid?q.quoteId:null,sourceObservedAt:state==='ACTIVE'&&valid?q.observedAt:null};
    });
    return {bookmaker,name:prices[0]?.bookmakerName??name,cells,action:null};
  });
  result.rows=nativeRows.filter(row=>pool.has(row.bookmaker)&&isVisibleBookmaker(row.bookmaker)).map(row=>{
    const cells=row.cells.map((cell,cellIndex)=>{
      if(cell.priceKind==='REAL'||snapshot.insuranceEnabled===false)return cell;
      const source=resolveInsurance(row.bookmaker,nativeRows.map(candidate=>({bookmaker:candidate.bookmaker,
        priceKind:candidate.cells[cellIndex].priceKind,current:candidate.cells[cellIndex].state==='ACTIVE',
        decimalOdds:candidate.cells[cellIndex].decimalOdds,value:candidate.cells[cellIndex]}))).candidate?.value;
      if(!source?.decimalOdds){
        if(cell.state!=='UNAVAILABLE')return cell;
        const nativeStates=nativeRows.map(r=>r.cells[cellIndex].state);
        const state:OddsStatus|'UNAVAILABLE'=nativeStates.includes('STALE')?'STALE':nativeStates.includes('SUSPENDED')?'SUSPENDED':nativeStates.includes('CLOSED')?'CLOSED':cell.state;
        return {...cell,state};
      }
      return {...cell,decimalOdds:source.decimalOdds,state:'ACTIVE' as const,expiresAt:source.expiresAt,priceKind:'PROXY' as const,
        sourceBookmaker:source.sourceBookmaker,sourceBookmakerName:source.sourceBookmakerName,sourceQuoteId:source.sourceQuoteId,sourceObservedAt:source.sourceObservedAt};
    });
    // A reference row shows its own price under its own name and never receives an action, whatever
    // the caller passed: continuity is informational, and only a primary book can be clicked through.
    if(referencePool.has(row.bookmaker))return {...row,cells,action:null,role:'FALLBACK_REFERENCE' as const,affiliateEligible:false};
    return {...row,cells,action:cells.some(cell=>cell.decimalOdds)?actions[row.bookmaker]??null:null,role:'PRIMARY_VISIBLE' as const,affiliateEligible:true};
  });
  for(const outcome of SELECTIONS[market]){
    const eligible=result.rows.flatMap(r=>r.cells.filter(c=>c.outcome===outcome&&c.decimalOdds!==null));
    // "Best price" is a claim a visitor can act on, so only commercial primary rows compete for it. A
    // reference price is shown for continuity and is never marked best, even when it is numerically
    // higher — the visitor cannot take it here, and crowning it would read as a recommendation.
    const real=result.rows.filter(r=>r.role!=='FALLBACK_REFERENCE').flatMap(r=>r.cells.filter(c=>c.outcome===outcome&&c.decimalOdds!==null&&c.priceKind==='REAL'));
    if(new Set(real.map(cell=>cell.sourceQuoteId).filter(Boolean)).size>=2){const best=Math.max(...real.map(c=>Number(c.decimalOdds)));real.forEach(c=>{c.best=Number(c.decimalOdds)===best;});}
    result.eligiblePrices+=eligible.length;
  }
  const observed=relevant.map(q=>q.observedAt).filter(s=>Number.isFinite(Date.parse(s))).sort();
  const updated=relevant.map(q=>q.providerUpdatedAt).filter((s):s is string=>!!s&&Number.isFinite(Date.parse(s))).sort();
  const expires=result.rows.flatMap(r=>r.cells.filter(c=>c.decimalOdds!==null).map(c=>c.expiresAt!)).sort();
  result.observedAt=observed.at(-1)??null;result.providerUpdatedAt=updated.at(-1)??null;result.expiresAt=expires[0]??null;
  return withReferences(result,snapshot,now);
}
function withReferences(result:OddsComparison,snapshot:OddsReadSnapshot,now:number):OddsComparison {
  // A reference fills an outcome gap, never a missing operator's offer. Any
  // eligible local REAL price for this exact outcome suppresses the reference.
  const primary=snapshot.referenceGapBookmakers??snapshot.eligibleBookmakers?.map(b=>b.id)??
    result.rows.filter(r=>r.role!=='FALLBACK_REFERENCE').map(r=>r.bookmaker);
  const references=SELECTIONS[result.market].flatMap(outcome=>{
    const covered=(bookmaker:string)=>result.rows.some(r=>r.bookmaker===bookmaker&&r.role!=='FALLBACK_REFERENCE'&&
      r.cells.some(c=>c.outcome===outcome&&c.priceKind==='REAL'&&c.decimalOdds!==null));
    if(primary.some(covered))return [];
    if(snapshot.referenceGapBookmakers?.length===0)return [];
    const quote=selectIndicativeQuote(snapshot,result.market,outcome,result.line,now);return quote?[quote]:[];
  });
  return references.length?{...result,references}:result;
}
/** Actual source price, never an average/best-price recommendation or a local operator row. */
export function selectIndicativeQuote(snapshot:OddsReadSnapshot,market:OddsMarket,outcome:OddsOutcome,line:number|null,now:number):IndicativeQuote|null {
  if(!snapshot.fixtureId||snapshot.fixtureStatus!=='SCHEDULED')return null;
  const candidates=(snapshot.referenceQuotes??[]).filter(q=>q.fixtureId===snapshot.fixtureId&&q.provider==='ODDSPAPI'&&q.geoEligible&&
    referenceSourceAllowed(q.targetGeo,q.sourceGeo,q.bookmaker,q.providerBookmakerId)&&q.market===market&&q.outcome===outcome&&q.line===line&&
    q.scope==='FULL_TIME_REGULATION'&&q.phase==='PREGAME'&&!!q.quoteId&&!!q.providerFixtureId&&!!q.sourceDomain&&quoteState(q,snapshot,now)==='ACTIVE'&&
    Number.isFinite(Number(q.decimalOdds))&&Number(q.decimalOdds)>1&&Number(q.decimalOdds)<=1000);
  const valid=candidates.flatMap(q=>{
    // Ambiguous supplier duplicates are not resolved by choosing the most attractive price.
    if(candidates.filter(c=>c.bookmaker===q.bookmaker&&c.sourceGeo===q.sourceGeo).length!==1)return [];
    const unscaled=freshnessTtlMs((Date.parse(q.providerKickoff)-Date.parse(q.observedAt))/3600000,2);
    const ttl=Math.min(quoteFreshnessTtlMs(q,snapshot,now),unscaled);
    const expires=Math.min(Date.parse(q.observedAt)+ttl,Date.parse(q.lastSuccessfulRefreshAt)+ttl,Date.parse(q.providerKickoff),Date.parse(snapshot.kickoff));
    if(!Number.isFinite(expires)||expires<=now)return [];
    return [{kind:'INDICATIVE' as const,fixtureId:q.fixtureId,providerFixtureId:q.providerFixtureId,market,outcome,line,scope:q.scope,phase:q.phase,
      decimalOdds:q.decimalOdds,bookmaker:q.bookmaker,bookmakerName:q.bookmakerName,sourceGeo:q.sourceGeo,sourceDomain:q.sourceDomain!,
      quoteId:q.quoteId,observedAt:q.observedAt,providerUpdatedAt:q.providerUpdatedAt!,expiresAt:new Date(expires).toISOString(),affiliateEligible:false as const,executable:false as const}];
  });
  const target=snapshot.referenceQuotes?.[0]?.targetGeo;
  return valid.sort((a,b)=>Number(b.sourceGeo===target)-Number(a.sourceGeo===target)||Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.bookmaker.localeCompare(b.bookmaker)||a.quoteId.localeCompare(b.quoteId))[0]??null;
}
/** Only server-approved suppliers participate. Ambiguity inside one supplier is never guessed. */
export function selectNativeQuote(matches:readonly ReadOddsQuote[],snapshot:OddsReadSnapshot,now:number){
  const providers=snapshot.approvedNativeProviders??['ODDSPAPI'];
  let inactive:ReadOddsQuote|undefined;
  for(const provider of providers){
    const rows=matches.filter(q=>(q.provider??'ODDSPAPI')===provider);
    if(rows.length!==1)continue;
    const quote=rows[0];inactive??=quote;
    if(quoteState(quote,snapshot,now)==='ACTIVE'&&Number(quote.decimalOdds)>1&&Number(quote.decimalOdds)<=1000)return quote;
  }
  return inactive;
}

/** Select exactly one supplier snapshot for the entire market. Partial provider snapshots are never merged. */
export function selectNativeMarketQuotes(matches:readonly ReadOddsQuote[],market:OddsMarket,snapshot:OddsReadSnapshot,now:number){
  const providers=snapshot.approvedNativeProviders??['ODDSPAPI'];
  const required=SELECTIONS[market];
  const candidates=providers.flatMap((provider,priority)=>{
    const providerRows=matches.filter(q=>(q.provider??'ODDSPAPI')===provider);
    const snapshots=new Map<string,ReadOddsQuote[]>();
    for(const row of providerRows){const key=row.observedAt;const rows=snapshots.get(key)??[];rows.push(row);snapshots.set(key,rows);}
    return [...snapshots.entries()].map(([observedAt,rows])=>{
      const active=rows.filter(q=>quoteState(q,snapshot,now)==='ACTIVE'&&Number(q.decimalOdds)>1&&Number(q.decimalOdds)<=1000);
      const unique=new Map<string,ReadOddsQuote>();let ambiguous=false;
      for(const outcome of required){const found=active.filter(q=>q.outcome===outcome);if(found.length>1)ambiguous=true;else if(found.length===1)unique.set(outcome,found[0]);}
      return {provider,priority,observedAt,rows,active:ambiguous?new Map<string,ReadOddsQuote>():unique,complete:!ambiguous&&unique.size===required.length,ambiguous};
    });
  });
  const ranked=candidates.filter(c=>c.active.size>0).sort((a,b)=>Number(b.complete)-Number(a.complete)||b.active.size-a.active.size||Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.priority-b.priority);
  const selected=ranked[0]??candidates.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.priority-b.priority)[0];
  const result=new Map<OddsOutcome,ReadOddsQuote>() as Map<OddsOutcome,ReadOddsQuote>&{provider?:string;ambiguous?:boolean};
  if(selected){result.provider=selected.provider;result.ambiguous=selected.ambiguous;for(const [outcome,quote] of selected.active)result.set(outcome as OddsOutcome,quote);}
  return result;
}
