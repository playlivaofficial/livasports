import type {QueryExecutor} from '@/database/client';
import {canonicalFixtures} from './ingestion';
import {readListingOddsSnapshots} from './read-core';
import {buildComparison,quoteState} from './comparison';
import {VISIBLE_BOOKMAKERS} from './registry';
import {SELECTIONS,type OddsMarket,type OddsReadSnapshot,type OddsSnapshot,type CanonicalOddsFixture,type NormalizedOddsQuote} from './types';
import {NATIVE_REASONS,type NativeReason} from './native-diagnostics';
import {freshnessTtlMs} from './scheduler-policy';

export interface NativeCell {fixtureId:string;competition:string;bookmaker:string;market:OddsMarket;outcome:string;window:string;kind:'REAL'|'PROXY'|'UNAVAILABLE';reason:NativeReason|null;source:string|null;}
export interface NativeGroup {key:string;bookmaker:string;competition:string;market:string;window:string;eligible:number;native:number;complete:number;fallback:number;unavailable:number;nativePct:number;fallbackPct:number;reasons:Record<NativeReason,number>;}
const reasons=()=>Object.fromEntries(NATIVE_REASONS.map(k=>[k,0])) as Record<NativeReason,number>;
export function confirmedProviderGap(rows:readonly Record<string,unknown>[],fixtureId:string,outcome:string,observedAt:string|undefined){
  // Quote expiry does not invalidate proof that the latest fetched response omitted this selection.
  // Require exact canonical identity and the latest response timestamp; never reuse superseded evidence.
  return Boolean(observedAt&&rows.some(d=>d.fixture_id===fixtureId&&d.outcome===outcome&&d.classification==='PROVIDER_GAP'
    &&(d.observed_at instanceof Date?+d.observed_at:Date.parse(String(d.observed_at)))===Date.parse(observedAt)));
}
export function returnedQuoteLost(returned:NormalizedOddsQuote|undefined,stored:OddsReadSnapshot['quotes'][number]|undefined,fresh:boolean){
  if(!fresh||returned?.status!=='ACTIVE')return false;
  return !stored||Date.parse(stored.observedAt)<Date.parse(returned.observedAt)||
    (Date.parse(stored.observedAt)===Date.parse(returned.observedAt)&&Number(stored.decimalOdds)!==Number(returned.decimalOdds));
}
export function summarizeNative(cells:readonly NativeCell[]):NativeGroup[]{
  const buckets=new Map<string,NativeCell[]>();
  for(const cell of cells)for(const [competition,market,window] of [
    ['*','*','*'],[cell.competition,cell.market,cell.window],['*',cell.market,'*'],
  ]){const key=[cell.bookmaker,competition,market,window].join('|');const rows=buckets.get(key)??[];rows.push(cell);buckets.set(key,rows);}
  return [...buckets].map(([key,rows])=>{
    const [bookmaker,competition,market,window]=key.split('|'),fixtures=[...new Set(rows.map(r=>r.fixtureId))];
    const native=fixtures.filter(id=>rows.some(r=>r.fixtureId===id&&r.kind==='REAL')).length;
    const complete=fixtures.filter(id=>rows.filter(r=>r.fixtureId===id).every(r=>r.kind==='REAL')).length;
    const fallback=fixtures.filter(id=>rows.some(r=>r.fixtureId===id&&r.kind==='PROXY')).length;
    const unavailable=fixtures.filter(id=>rows.some(r=>r.fixtureId===id&&r.kind==='UNAVAILABLE')).length;
    const counts=reasons();for(const row of rows)if(row.reason)counts[row.reason]++;
    return {key,bookmaker,competition,market,window,eligible:fixtures.length,native,complete,fallback,unavailable,nativePct:native/fixtures.length*100,fallbackPct:fallback/fixtures.length*100,reasons:counts};
  });
}
export function nativeReason(input:{quote?:OddsReadSnapshot['quotes'][number];snapshot:OddsReadSnapshot;now:number;returned:boolean;returnedAt?:string;rejected:boolean;unresolved:boolean;delayed:boolean;providerGap:boolean}):NativeReason{
  const {quote,snapshot,now}=input;
  if(input.returned&&(!quote||Date.parse(input.returnedAt??'')>Date.parse(quote.observedAt)))return 'INGESTION_BUG';
  if(quote){
    if(['SUSPENDED','WITHDRAWN','CLOSED'].includes(quote.status))return 'SUSPENDED_OR_REMOVED';
    if(quoteState(quote,snapshot,now)!=='ACTIVE')return 'STALE_OR_EXPIRED';
    return 'UNKNOWN_PIPELINE_DEFECT'; // persisted fresh quote rejected by read eligibility/resolver
  }
  if(input.returned)return 'INGESTION_BUG';
  if(input.unresolved)return 'IDENTITY_UNRESOLVED';
  if(input.rejected)return 'MARKET_MAPPING_FAILURE';
  if(input.delayed)return 'QUOTA_OR_BACKOFF_DELAY';
  if(input.providerGap)return 'PROVIDER_GAP';
  return 'UNKNOWN_PIPELINE_DEFECT';
}
export function nativeRegressions(current:readonly NativeGroup[],history:readonly {groups:NativeGroup[]}[]){
  return current.flatMap(group=>{
    if(group.competition==='*'||group.eligible<3)return [];
    const samples=history.flatMap(h=>h.groups.filter(g=>g.key===group.key&&g.eligible>=3));
    if(samples.length<3)return [];
    const median=(values:number[])=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
    const baseline=median(samples.map(s=>s.nativePct)),fallback=median(samples.map(s=>s.fallbackPct));
    const unresolved=median(samples.map(s=>s.reasons.IDENTITY_UNRESOLVED??0));
    if(group.reasons.IDENTITY_UNRESOLVED>=unresolved+7)return [{key:group.key,baselineNativePct:baseline,nativePct:group.nativePct,samples:samples.length,reason:'UNRESOLVED_IDENTITY_REGRESSION'}];
    return baseline>=25&&baseline-group.nativePct>=30&&group.fallbackPct-fallback>=20?[{key:group.key,baselineNativePct:baseline,nativePct:group.nativePct,samples:samples.length,reason:'NATIVE_COVERAGE_REGRESSION'}]:[];
  });
}
export async function readNativeCoverage(db:QueryExecutor,now=new Date(),quotaBlocked=false){
  const fixtures=(await canonicalFixtures(db)).filter(f=>f.status==='SCHEDULED'&&Date.parse(f.kickoff)>+now&&Date.parse(f.kickoff)<=+now+7*86400000);
  const [reads,saved,targets,mappings,diagnostics,history]=await Promise.all([
    readListingOddsSnapshots(db,fixtures.map(f=>f.id),null,true),
    db.query(`SELECT DISTINCT ON(s.bookmaker,t.id) s.bookmaker,t.id,s.observed_at,s.payload FROM odds_sync_snapshots s
      CROSS JOIN LATERAL jsonb_array_elements_text(s.payload->'tournamentIds') t(id)
      WHERE s.observed_at>$1::timestamptz-interval '14 days' ORDER BY s.bookmaker,t.id,s.observed_at DESC`,[now.toISOString()]),
    db.query('SELECT * FROM odds_refresh_targets'),
    db.query("SELECT entity_type,provider_entity_id,livasports_entity_id FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type IN ('FIXTURE','COMPETITION')"),
    db.query(`SELECT DISTINCT ON(bookmaker,provider_fixture_id,market,outcome) bookmaker,provider_fixture_id,fixture_id,market,outcome,classification,evidence,observed_at
      FROM odds_native_diagnostics WHERE observed_at>$1::timestamptz-interval '7 days' ORDER BY bookmaker,provider_fixture_id,market,outcome,observed_at DESC`,[now.toISOString()]),
    db.query("SELECT report FROM odds_native_rollups WHERE bucket BETWEEN $1::timestamptz-interval '7 days' AND $1::timestamptz-interval '1 hour' ORDER BY bucket DESC LIMIT 672",[now.toISOString()]),
  ]);
  const cells:NativeCell[]=[];
  for(const fixture of fixtures){
    const snap=reads.get(fixture.id)??{kickoff:fixture.kickoff,fixtureStatus:fixture.status,quotes:[]};
    const hours=(Date.parse(fixture.kickoff)-+now)/3600000,window=hours<=2?'0-2h':hours<=24?'2-24h':hours<=72?'1-3d':'3-7d';
    for(const market of Object.keys(SELECTIONS) as OddsMarket[]){
      const comparison=buildComparison(snap,market,+now);
      for(const book of VISIBLE_BOOKMAKERS){
        const tournament=mappings.rows.find(m=>m.entity_type==='COMPETITION'&&m.livasports_entity_id===fixture.competitionId)?.provider_entity_id;
        const latest=saved.rows.find(r=>r.bookmaker===book.canonicalId&&(r.id===tournament||(r.payload as OddsSnapshot).fixtures.some(f=>f.competition===fixture.competition&&f.providerCompetitionId===r.id)));
        const payload=latest?.payload as OddsSnapshot|undefined;
        const mapped=mappings.rows.find(m=>m.entity_type==='FIXTURE'&&m.livasports_entity_id===fixture.id)?.provider_entity_id;
        const raw=payload?.fixtures.find(f=>f.providerId===mapped);
        const target=targets.rows.find(t=>t.bookmaker===book.canonicalId&&t.tournament_id===(latest?.id??tournament));
        const age=payload?+now-Date.parse(payload.observedAt):Infinity;
        const freshEvidence=payload?age<freshnessTtlMs((Date.parse(fixture.kickoff)-Date.parse(payload.observedAt))/3600000,2,payload.cadenceScale):false;
        const relevant=diagnostics.rows.filter(d=>d.bookmaker===book.canonicalId&&d.market===market&&(d.fixture_id===fixture.id||candidate(d.evidence as Record<string,unknown>,fixture)));
        for(const outcome of SELECTIONS[market]){
          const cell=comparison.rows.find(r=>r.bookmaker===book.canonicalId)?.cells.find(c=>c.outcome===outcome);
          const own=snap.quotes.find(q=>q.bookmaker===book.canonicalId&&q.market===market&&q.outcome===outcome&&(market==='TOTAL_GOALS'?q.line===2.5:q.line===null));
          const returnedQuote=raw?payload?.quotes.find(q=>q.providerFixtureId===raw.providerId&&q.market===market&&q.outcome===outcome&&q.status==='ACTIVE'):undefined;
          const returned=Boolean(freshEvidence&&returnedQuote);
          const kind=cell?.decimalOdds?(cell.priceKind??'UNAVAILABLE'):'UNAVAILABLE';
          const reason=returnedQuoteLost(returnedQuote,own,freshEvidence)?'INGESTION_BUG':kind==='REAL'?null:nativeReason({quote:own,snapshot:snap,now:+now,returned,returnedAt:payload?.observedAt,
            rejected:relevant.some(d=>d.classification==='MARKET_MAPPING_FAILURE'&&(!d.outcome||d.outcome===outcome)),
            unresolved:relevant.some(d=>d.classification==='IDENTITY_UNRESOLVED'),
            delayed:quotaBlocked||Boolean(target?.retry_after&&+new Date(target.retry_after)>+now),
            providerGap:Boolean(freshEvidence&&payload)||confirmedProviderGap(relevant,fixture.id,outcome,payload?.observedAt)});
          cells.push({fixtureId:fixture.id,competition:fixture.competition,bookmaker:book.canonicalId,market,outcome,window,kind,reason,source:cell?.sourceBookmaker??null});
        }
      }
    }
  }
  const groups=summarizeNative(cells),regressions=nativeRegressions(groups,history.rows.map(r=>r.report as {groups:NativeGroup[]}));
  const counts=reasons();for(const c of cells)if(c.reason)counts[c.reason]++;
  const unresolved=diagnostics.rows.filter(d=>d.classification==='IDENTITY_UNRESOLVED'&&Date.parse(String((d.evidence as Record<string,unknown>).kickoff))>+now);
  return {at:now.toISOString(),providerRequests:0 as const,fixtures:fixtures.length,fixtureIds:fixtures.map(f=>f.id),groups,cells,counts,
    unresolvedIdentities:new Set(unresolved.map(d=>d.provider_fixture_id)).size,
    unresolvedInWindow:new Set(unresolved.filter(d=>Date.parse(String((d.evidence as Record<string,unknown>).kickoff))<=+now+7*86400000).map(d=>d.provider_fixture_id)).size,
    pipelineLoss:counts.INGESTION_BUG,regressions,baselineSamples:history.rows.length,
    diagnostics:diagnostics.rows.filter(d=>d.classification!=='NATIVE_PERSISTED'&&d.classification!=='OUT_OF_SCOPE').map(d=>({...d,observed_at:new Date(d.observed_at).toISOString()}))};
}
function candidate(e:Record<string,unknown>,f:CanonicalOddsFixture){
  // Diagnostic attribution only, never an identity mapping decision.
  return e.candidate===f.id||Array.isArray(e.candidates)&&e.candidates.includes(f.id);
}
export async function recordNativeCoverage(db:QueryExecutor,now=new Date()){
  const report=await readNativeCoverage(db,now);
  await persistNativeCoverageReport(db,report);
  return report;
}
export async function persistNativeCoverageReport(db:QueryExecutor,report:Awaited<ReturnType<typeof readNativeCoverage>>){
  const bucket=new Date(Math.floor(Date.parse(report.at)/900000)*900000).toISOString();
  await db.query(`INSERT INTO odds_native_rollups(bucket,report) VALUES($1,$2::jsonb) ON CONFLICT(bucket) DO UPDATE SET report=excluded.report`,
    [bucket,JSON.stringify({at:report.at,groups:report.groups,counts:report.counts,regressions:report.regressions,pipelineLoss:report.pipelineLoss,unresolvedIdentities:report.unresolvedIdentities})]);
  // Retain bounded derived telemetry only. Canonical mappings, quotes and saved source responses are untouched.
  await db.query(`DELETE FROM odds_native_rollups WHERE bucket<$1::timestamptz-interval '14 days'`,[report.at]);
  await db.query(`DELETE FROM odds_native_diagnostics WHERE (snapshot_id,bookmaker,provider_fixture_id,market,outcome) IN
    (SELECT snapshot_id,bookmaker,provider_fixture_id,market,outcome FROM odds_native_diagnostics
     WHERE observed_at<$1::timestamptz-interval '7 days' ORDER BY observed_at LIMIT 1000)`,[report.at]);
}
