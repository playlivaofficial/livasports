import {writeFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';
import {buildCoverageMatrix,inspectStoredTournament} from '../src/odds/coverage-matrix';
import {schedulerPlan} from '../src/odds/scheduler';
import {schedulerTournaments} from '../src/providers/oddspapi/tournament-catalog';
import {readListingOddsSnapshots,readOddsSnapshot} from '../src/odds/read-repository';
import {listingMatchWinnerOdds} from '../src/odds/listing';
import {buildComparison} from '../src/odds/comparison';

const db=new PostgresDatabaseClient(databaseUrl()!);
try {
  const catalog=(await db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0].tournaments;
  const tournaments=schedulerTournaments(catalog);
  const [coverage,plan,feeds,jobs,clock,day]=await Promise.all([
    buildCoverageMatrix(db),schedulerPlan(db,new Date(),tournaments),
    db.query('SELECT * FROM odds_refresh_targets ORDER BY bookmaker,tournament_id'),
    db.query('SELECT id,started_at,status,trigger_source,provider_requests,result FROM odds_sync_jobs ORDER BY started_at DESC LIMIT 12'),
    db.query('SELECT now() AS now'),
    db.query("SELECT count(*)::int AS rolling_day FROM odds_provider_requests WHERE billable AND purpose='SCHEDULED' AND started_at>now()-interval '24 hours'")
  ]);
  const rows=(await db.query(`SELECT f.id,f.public_id,c.slug,f.kickoff,ht.name AS home,at.name AS away FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id WHERE f.status='SCHEDULED' AND f.kickoff>now() AND c.slug=ANY($1::text[]) ORDER BY c.slug,f.kickoff`,[tournaments.map(t=>t.canonical)])).rows;
  const snapshots=await readListingOddsSnapshots(db,rows.map(r=>r.id),'BR');
  const fixtures=rows.map(r=>{
    const s=snapshots.get(r.id)!; const c=buildComparison(s,'MATCH_WINNER');
    return {...r,listing:listingMatchWinnerOdds(s),comparison:c,quoteStates:s.quotes.map(q=>({bookmaker:q.bookmaker,status:q.status,geoEligible:q.geoEligible,observedAt:q.observedAt,lastSuccessfulRefreshAt:q.lastSuccessfulRefreshAt,providerUpdatedAt:q.providerUpdatedAt,providerKickoff:q.providerKickoff}))};
  });
  const examples=[];
  for(const t of tournaments){
    const candidates=fixtures.filter(f=>f.slug===t.canonical);
    const example=candidates.find(f=>f.listing.odds.length)||candidates.find(f=>f.quoteStates.length)||candidates[0];
    if(example)examples.push({tournamentId:t.id,slug:t.canonical,publicId:example.public_id,home:example.home,away:example.away,kickoff:example.kickoff,listing:example.listing,match:buildComparison(await readOddsSnapshot(db,example.id,'BR'),'MATCH_WINNER')});
  }
  const gaps=[];for(const t of tournaments)gaps.push(await inspectStoredTournament(db,t.canonical,t.id));
  const report={clock:clock.rows[0],rollingDay:day.rows[0],coverage,plan,feeds:feeds.rows,jobs:jobs.rows,fixtures,examples,gaps};
  await writeFile('output/hardening-audit-private.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({clock:report.clock,rollingDay:report.rollingDay,budget:coverage.budget,plan,leagues:tournaments.map(t=>({id:t.id,slug:t.canonical,upcoming:fixtures.filter(f=>f.slug===t.canonical).length,listingPriced:fixtures.filter(f=>f.slug===t.canonical&&f.listing.odds.length).length,stored:fixtures.filter(f=>f.slug===t.canonical&&f.quoteStates.length).length})),jobs:jobs.rows.slice(0,3)},null,2));
}finally{await db.close();}
