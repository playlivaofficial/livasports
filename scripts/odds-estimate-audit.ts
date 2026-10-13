/** Read-only live-data audit. No provider, scheduler, migration, or data-write entry point. */
import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {readListingOddsSnapshots} from '../src/odds/read-core';
import {buildComparison} from '../src/odds/comparison';
import {SELECTIONS,type OddsMarket} from '../src/odds/types';
import {CORE_GEOS} from '../src/config/geo';
import {primaryVisibleBookmakers} from '../src/odds/fallback-pool';
import {isAcquisitionCompetition} from '../src/config/footballCompetitions';
import {minusTenPercent} from '../src/odds/calculated-estimate';
const db=new PostgresDatabaseClient(databaseUrl()!,undefined,{statementTimeoutMs:30000});
try{
 const fixtures=(await db.query(`SELECT f.id,f.public_id,c.slug AS competition,f.kickoff,h.name AS home,a.name AS away
 FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id
 WHERE c.enabled AND f.status='SCHEDULED' AND f.kickoff>now() AND f.kickoff<now()+interval '7 days'
 AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id) ORDER BY f.kickoff,f.id`)).rows;
 const at=Date.now(),rows=[];let violations=0;
 for(const geo of CORE_GEOS){
  const snapshots=await readListingOddsSnapshots(db,fixtures.map(f=>f.id),geo,true),pair=primaryVisibleBookmakers(geo);
  for(const f of fixtures)for(const market of Object.keys(SELECTIONS) as OddsMarket[]){
   const snapshot=snapshots.get(f.id);if(!snapshot)continue;
   const c=buildComparison(snapshot,market,at);
   for(const book of pair){
    const genuine=c.rows.find(r=>r.bookmaker===book)?.cells.filter(q=>q.state==='ACTIVE'&&q.priceKind==='REAL'&&q.decimalOdds)??[];
    const estimates=c.estimates?.filter(e=>e.targetBookmaker===book)??[];
    for(const e of estimates){
     const source=c.rows.find(r=>r.bookmaker===e.sourceBookmaker)?.cells.find(q=>q.outcome===e.outcome);
     if(e.sourceBookmaker!==pair.find(id=>id!==book)||e.decimalOdds!==minusTenPercent(source?.decimalOdds??'')||source?.priceKind!=='REAL'||
       genuine.some(q=>q.outcome===e.outcome)||e.executable||e.affiliateEligible)violations++;
    }
    rows.push({geo,bookmaker:book,fixtureId:f.id,publicId:f.public_id,competition:f.competition,home:f.home,away:f.away,kickoff:f.kickoff,market,
      acquisition:isAcquisitionCompetition(f.competition),genuine:genuine.map(q=>({outcome:q.outcome,price:q.decimalOdds,expiresAt:q.expiresAt})),
      estimates:estimates.map(e=>({outcome:e.outcome,price:e.decimalOdds,source:e.sourceBookmaker,sourcePrice:e.sourceDecimalOdds,expiresAt:e.expiresAt})),
      completeReal:genuine.length===SELECTIONS[market].length,completeComparison:genuine.length+estimates.length===SELECTIONS[market].length});
   }
  }
 }
 const summarize=(approvedOnly:boolean)=>CORE_GEOS.flatMap(geo=>primaryVisibleBookmakers(geo).map(bookmaker=>{
  const sample=rows.filter(r=>r.geo===geo&&r.bookmaker===bookmaker&&(!approvedOnly||r.acquisition));
  return {geo,bookmaker,fixtures:new Set(sample.map(r=>r.fixtureId)).size,markets:Object.fromEntries(Object.keys(SELECTIONS).map(m=>{
   const cells=sample.filter(r=>r.market===m);return [m,{realComplete:cells.filter(r=>r.completeReal).length,comparisonComplete:cells.filter(r=>r.completeComparison).length,
    realOutcomes:cells.reduce((n,r)=>n+r.genuine.length,0),estimatedOutcomes:cells.reduce((n,r)=>n+r.estimates.length,0),estimateFixtures:cells.filter(r=>r.estimates.length).length}];
  }))};
 }));
 const report={capturedAt:new Date(at).toISOString(),providerRequests:0,sourceAccuracyViolations:violations,allEnabledUpcoming:fixtures.length,
  approvedUpcoming:fixtures.filter(f=>isAcquisitionCompetition(f.competition)).length,approved:summarize(true),allEnabled:summarize(false),rows};
 await writeFile('output/odds-estimate-coverage-private.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,rows:undefined,samples:CORE_GEOS.flatMap(geo=>rows.filter(r=>r.geo===geo&&r.estimates.length&&r.market==='MATCH_WINNER').slice(0,2))}));
 if(violations)process.exitCode=1;
}catch{console.error('ODDS_ESTIMATE_AUDIT_FAILED');process.exitCode=1;}finally{await db.close();}
