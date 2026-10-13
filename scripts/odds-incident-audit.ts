/** Bounded incident evidence. Read-only by default; --canary counts every upstream request in the existing ledger. */
import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {budgetHealth} from '../src/odds/budget';
import {readVerifiedOperatorFeeds} from '../src/odds/operator-feeds';
import {readListingOddsSnapshots} from '../src/odds/read-core';
import {buildComparison} from '../src/odds/comparison';
import {schedulerInputs} from '../src/odds/scheduler';
import {planScheduler} from '../src/odds/scheduler-policy';
import {schedulerTournaments} from '../src/providers/oddspapi/tournament-catalog';
import {M5OddsPapiAdapter} from '../src/providers/oddspapi/M5OddsPapiAdapter';
import {startOddsJob,endOddsJob,canonicalFixtures} from '../src/odds/ingestion';
import {matchOddsSnapshot} from '../src/odds/matching';
import {readTeamIdentities} from '../src/odds/identity';
import type {PersistedFixtureMapping,OddsSnapshot} from '../src/odds/types';
import {isAcquisitionCompetition} from '../src/config/footballCompetitions';
import {freshnessTtlMs} from '../src/odds/scheduler-policy';

const db=new PostgresDatabaseClient(databaseUrl()!,undefined,{statementTimeoutMs:30000});
const arg=(key:string)=>process.argv.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
const label=arg('label')??'before';
if(!/^[a-z0-9-]+$/.test(label))throw Error('INVALID_AUDIT_LABEL');
try{
 const capturedAt=new Date().toISOString();
 const feeds=await readVerifiedOperatorFeeds(db),budget=await budgetHealth(db);
 const catalog=(await db.query("SELECT markets,tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
 const tournaments=schedulerTournaments(catalog.tournaments);
 const inventory=(await db.query(`SELECT f.id,f.public_id,c.slug AS competition,f.kickoff,h.name AS home,a.name AS away
   FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id
   WHERE c.enabled AND f.status='SCHEDULED' AND f.kickoff>now() AND f.kickoff<=now()+interval '7 days'
   AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id) ORDER BY f.kickoff,f.id`)).rows;
 const fixtures=inventory.filter(f=>isAcquisitionCompetition(f.competition));
 const [canonical,identities,mappingRows,evidenceRows]=await Promise.all([canonicalFixtures(db),readTeamIdentities(db),
  db.query(`SELECT provider_entity_id AS "providerId",livasports_entity_id AS "fixtureId",metadata->>'homeProviderId' AS "homeProviderId",metadata->>'awayProviderId' AS "awayProviderId",metadata->>'canonicalKickoff' AS "canonicalKickoff",metadata->>'providerKickoff' AS "providerKickoff" FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type='FIXTURE'`),
  db.query(`SELECT DISTINCT ON(s.bookmaker,t.id) s.bookmaker,t.id,s.observed_at,s.payload FROM odds_sync_snapshots s
    CROSS JOIN LATERAL jsonb_array_elements_text(s.payload->'tournamentIds') t(id)
    WHERE s.observed_at>now()-interval '14 days' AND s.bookmaker=ANY($1::text[]) AND s.payload ? 'geoFeeds'
    ORDER BY s.bookmaker,t.id,s.observed_at DESC`,[[...new Set(feeds.map(f=>f.providerBookmakerId))]])]);
 const providerEvidence=evidenceRows.rows.map(row=>{const snapshot=row.payload as OddsSnapshot;
  const matches=matchOddsSnapshot(snapshot.fixtures.filter(f=>f.providerCompetitionId===row.id),canonical,mappingRows.rows as PersistedFixtureMapping[],identities);
  return {bookmaker:row.bookmaker,tournamentId:row.id,at:row.observed_at,snapshot,matches};});
 const coverage=[];
 for(const geo of ['MX','CO','PE'] as const){
  const read=await readListingOddsSnapshots(db,fixtures.map(f=>f.id),geo,true);
  for(const fixture of fixtures){const snapshot=read.get(fixture.id);if(!snapshot)continue;
   for(const market of ['MATCH_WINNER','TOTAL_GOALS','BTTS'] as const){const comparison=buildComparison(snapshot,market,Date.parse(capturedAt));
    for(const feed of feeds.filter(f=>f.geo===geo)){
     const row=comparison.rows.find(r=>r.bookmaker===feed.operatorId);
     const evidence=providerEvidence.find(e=>e.bookmaker===feed.providerBookmakerId&&e.matches.some(m=>m.fixture?.id===fixture.id));
     const match=evidence?.matches.find(m=>m.fixture?.id===fixture.id);
     const providerQuotes=match?evidence!.snapshot.quotes.filter(q=>q.providerFixtureId===match.raw.providerId&&q.market===market):[];
     const expected=providerQuotes.filter(q=>q.status==='ACTIVE'&&q.providerUpdatedAt&&match!.raw.status==='PREGAME'&&
       Date.parse(q.observedAt)+freshnessTtlMs((Math.min(Date.parse(match!.raw.kickoff),+fixture.kickoff)-Date.parse(q.observedAt))/3600000,2,evidence!.snapshot.cadenceScale??1)>Date.parse(capturedAt));
     const active=row?.cells.filter(c=>c.state==='ACTIVE'&&c.priceKind==='REAL').map(c=>({outcome:c.outcome,price:c.decimalOdds,expiresAt:c.expiresAt}))??[];
     coverage.push({geo,bookmaker:feed.operatorId,fixtureId:fixture.id,publicId:fixture.public_id,competition:fixture.competition,market,
      providerReturned:!!match,providerObservedAt:evidence?.snapshot.observedAt??null,
      providerSelections:providerQuotes.map(q=>({outcome:q.outcome,status:q.status})),
      expectedFresh:expected.map(q=>q.outcome),missingFreshUpstream:expected.filter(q=>!active.some(c=>c.outcome===q.outcome)).map(q=>q.outcome),active,
      stored:snapshot.quotes.filter(q=>q.bookmaker===feed.operatorId&&q.market===market&&q.geoEligible).map(q=>({outcome:q.outcome,status:q.status,observedAt:q.observedAt,ttl:q.freshnessTtlMinutes}))});
    }
   }
  }
 }
 const inputs=await schedulerInputs(db,tournaments),plan=planScheduler(inputs.targets,new Date(capturedAt),inputs.budget);
 const summary=feeds.map(f=>{const rows=coverage.filter(r=>r.geo===f.geo&&r.bookmaker===f.operatorId);return {...f,upcomingFixtures:fixtures.length,
  anyCurrent:new Set(rows.filter(r=>r.active.length).map(r=>r.fixtureId)).size,
  markets:Object.fromEntries(['MATCH_WINNER','TOTAL_GOALS','BTTS'].map(m=>[m,rows.filter(r=>r.market===m&&r.active.length===(m==='MATCH_WINNER'?3:2)).length])),
  ingested:new Set(rows.filter(r=>r.stored.length).map(r=>r.fixtureId)).size,
  providerReturned:new Set(rows.filter(r=>r.providerReturned).map(r=>r.fixtureId)).size,
  providerFresh:new Set(rows.filter(r=>r.expectedFresh.length).map(r=>r.fixtureId)).size,
  missingFreshUpstreamFixtures:new Set(rows.filter(r=>r.missingFreshUpstream.length).map(r=>r.fixtureId)).size,
  missingFreshUpstreamSelections:rows.reduce((n,r)=>n+r.missingFreshUpstream.length,0),
  latestSavedResponse:providerEvidence.filter(e=>e.bookmaker===f.providerBookmakerId).map(e=>e.snapshot.observedAt).sort().at(-1)??null};});
 const byCompetition=feeds.flatMap(f=>[...new Set(fixtures.map(item=>item.competition))].map(competition=>{const rows=coverage.filter(r=>r.geo===f.geo&&r.bookmaker===f.operatorId&&r.competition===competition);return {geo:f.geo,bookmaker:f.operatorId,competition,upcoming:fixtures.filter(item=>item.competition===competition).length,providerReturned:new Set(rows.filter(r=>r.providerReturned).map(r=>r.fixtureId)).size,current:new Set(rows.filter(r=>r.active.length).map(r=>r.fixtureId)).size,missingFreshSelections:rows.reduce((n,r)=>n+r.missingFreshUpstream.length,0)};}));
 const report={capturedAt,evidenceLimit:'Latest saved successful provider responses, not an assertion of current upstream availability during HTTP 500 outage.',fixtures,excludedInventory:inventory.filter(f=>!isAcquisitionCompetition(f.competition)),summary,byCompetition,budget,plan,coverage};
 await writeFile(`output/odds-incident-${label}-private.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({capturedAt,summary,budget,cadence:plan.cadence,pacing:plan.pacing,decisions:plan.targets.reduce((out,t)=>{const key=t.delayReason??(t.due?'DUE':'NOT_DUE');out[key]=(out[key]??0)+1;return out;},{} as Record<string,number>)}));
 if(process.argv.includes('--canary')){
  const ids=(arg('tournaments')??'27464,27070,406,7').split(',');
  if(ids.length>4||ids.some(id=>!tournaments.some(t=>t.id===id)))throw Error('INVALID_CANARY_TOURNAMENTS');
  const books=arg('books')?.split(',')??[...new Set(feeds.map(f=>f.providerBookmakerId))];
  if(books.length>5||books.some(id=>!feeds.some(f=>f.providerBookmakerId===id)))throw Error('INVALID_CANARY_BOOKMAKERS');
  const job=await startOddsJob(db);let success=false;
  try{
   const provider=new M5OddsPapiAdapter(db,process.env.ODDSPAPI_API_KEY!,job,6,false,Date.now()+140000,tournaments,0);provider.setOperatorFeeds(feeds);provider.setMarketCatalog(catalog.markets);
   if(process.argv.includes('--verified-account')){
    if(!budget.verified)throw Error('ACCOUNT_NOT_VERIFIED');
    console.log(JSON.stringify({account:'EXISTING_VERIFIED_BUDGET_BASELINE',requests:0}));
   }else{const account=await provider.accountCoverage();console.log(JSON.stringify({account,requests:provider.requestCount()}));}
   const canonical=await canonicalFixtures(db),identities=await readTeamIdentities(db);
   const saved=(await db.query(`SELECT provider_entity_id AS "providerId",livasports_entity_id AS "fixtureId",metadata->>'homeProviderId' AS "homeProviderId",metadata->>'awayProviderId' AS "awayProviderId",metadata->>'canonicalKickoff' AS "canonicalKickoff",metadata->>'providerKickoff' AS "providerKickoff" FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type='FIXTURE'`)).rows as PersistedFixtureMapping[];
   for(const bookmaker of books){
    const snapshot=await provider.snapshot(bookmaker,ids);const matches=matchOddsSnapshot(snapshot.fixtures,canonical,saved,identities);
    await writeFile(`output/odds-incident-${label}-${bookmaker}-private.json`,JSON.stringify({snapshot,matches},null,2));
    console.log(JSON.stringify({bookmaker,returned:snapshot.fixtures.length,quotes:snapshot.quotes.length,statuses:snapshot.quotes.reduce((o,q)=>{o[q.status]=(o[q.status]??0)+1;return o;},{} as Record<string,number>),rejected:snapshot.rejected,mappings:matches.reduce((o,m)=>{o[m.state]=(o[m.state]??0)+1;return o;},{} as Record<string,number>),requests:provider.requestCount()}));
   }
   success=true;
  }finally{await endOddsJob(db,job,success);}
 }
}catch(e){let code=e instanceof Error?e.message:'AUDIT_FAILED';try{const parsed=JSON.parse(code);code=`PROVIDER_HTTP_${parsed.status}`;}catch{/* Known safe error codes only. */}console.error(JSON.stringify({error:/^[A-Z_0-9]+$/.test(code)?code:'AUDIT_FAILED'}));process.exitCode=1;}
finally{await db.close();}
