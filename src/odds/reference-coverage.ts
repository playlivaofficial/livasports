import type {QueryExecutor} from '@/database/client';
import {CORE_GEOS} from '@/config/geo';
import {isAcquisitionCompetition} from '@/config/footballCompetitions';
import {readListingOddsSnapshots} from './read-core';
import {buildComparison,quoteState} from './comparison';
import {REFERENCE_DISPLAY_POLICY,referenceDisplayAllowed} from './reference-policy';
/** Owner-only bounded DB audit. Never invoked by a public page render or provider worker. */
export async function readReferenceCoverage(db:QueryExecutor,now=new Date()){
 const fixtures=(await db.query(`SELECT f.id,c.slug FROM fixtures f JOIN competitions c ON c.id=f.competition_id
 WHERE c.enabled AND f.status='SCHEDULED' AND f.kickoff>$1 AND f.kickoff<$1::timestamptz+interval '7 days'
 AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id) ORDER BY f.kickoff,f.id LIMIT 1000`,[now.toISOString()])).rows.filter(r=>isAcquisitionCompetition(r.slug));
 const ids=fixtures.map(f=>String(f.id));
 const gaps=(await db.query(`WITH latest AS (
 SELECT DISTINCT ON(bookmaker,provider_fixture_id,market,outcome) * FROM odds_native_diagnostics
 WHERE observed_at>$1::timestamptz-interval '24 hours' ORDER BY bookmaker,provider_fixture_id,market,outcome,observed_at DESC)
 SELECT c.iso2 AS geo,d.classification,count(DISTINCT d.provider_fixture_id)::int AS fixtures FROM latest d
 JOIN bookmakers b ON b.provider_slug=d.bookmaker
 JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id AND g.odds_enabled AND g.comparison_enabled
 JOIN countries c ON c.id=g.country_id AND c.iso2 IN ('MX','CO','PE')
 GROUP BY c.iso2,d.classification ORDER BY c.iso2,d.classification`,[now.toISOString()])).rows;
 const geos=[];
 for(const geo of CORE_GEOS){
  const snapshots=await readListingOddsSnapshots(db,ids,geo,true);
  let real=0,reference=0,unavailable=0,expired=0,suspended=0;
  const selections={REAL:0,REFERENCE:0,UNAVAILABLE:0};
  for(const snapshot of snapshots.values()){
   const markets=(['MATCH_WINNER','TOTAL_GOALS','BTTS'] as const).map(m=>buildComparison(snapshot,m,now.getTime()));
   const local=markets.some(m=>m.eligiblePrices>0),ref=markets.some(m=>m.references?.length);
   if(local)real++;else if(ref)reference++;else unavailable++;
   if(snapshot.quotes.some(q=>q.geoEligible&&quoteState(q,snapshot,now.getTime())==='STALE'))expired++;
   if(snapshot.quotes.some(q=>q.geoEligible&&q.status==='SUSPENDED'))suspended++;
   for(const market of markets){const outcomes=market.market==='MATCH_WINNER'?['HOME','DRAW','AWAY']:market.market==='TOTAL_GOALS'?['OVER','UNDER']:['YES','NO'];
    for(const outcome of outcomes)if(market.rows.some(r=>r.cells.some(c=>c.outcome===outcome&&c.decimalOdds!==null)))selections.REAL++;
    else if(market.references?.some(q=>q.outcome===outcome))selections.REFERENCE++;else selections.UNAVAILABLE++;
   }
  }
  geos.push({geo,fixtures:ids.length,real,reference,unavailable:unavailable+ids.length-snapshots.size,expired,suspended,selections,enabled:referenceDisplayAllowed(geo)});
 }
 return {at:now.toISOString(),window:'7 days',limit:1000,providerRequests:0,policy:REFERENCE_DISPLAY_POLICY,geos,diagnostics:gaps};
}
