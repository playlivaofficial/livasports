import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {readNativeCoverage} from '../src/odds/native-coverage';
import {schedulerInputs} from '../src/odds/scheduler';
import {budgetCadence,planScheduler} from '../src/odds/scheduler-policy';
import {schedulerTournaments} from '../src/providers/oddspapi/tournament-catalog';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
 const label=process.argv.includes('--after')?'after':'before';
 const catalog=(await db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0]?.tournaments??[];
 const now=new Date(),coverage=await readNativeCoverage(db,now),inputs=await schedulerInputs(db,schedulerTournaments(catalog));
 const targets=(await db.query(`SELECT r.bookmaker,r.tournament_id,r.last_success_at,r.last_attempt_at,r.retry_after,r.consecutive_failures,r.last_error,
   r.failure_class,r.backoff_reason,r.next_recheck_at,r.failure_evidence,
   c.slug AS competition,(SELECT count(*)::int FROM odds_provider_requests p WHERE p.safe_query->>'bookmaker'=r.bookmaker
     AND r.tournament_id=ANY(string_to_array(p.safe_query->>'tournamentIds',','))) AS attempts,
   (SELECT jsonb_agg(x ORDER BY x.started_at DESC) FROM (SELECT p.started_at,p.http_status,p.outcome,p.safe_query
     FROM odds_provider_requests p WHERE p.safe_query->>'bookmaker'=r.bookmaker
       AND r.tournament_id=ANY(string_to_array(p.safe_query->>'tournamentIds',',')) ORDER BY p.started_at DESC LIMIT 5) x) AS recent_requests
   FROM odds_refresh_targets r LEFT JOIN provider_entity_mappings m ON m.provider='ODDSPAPI' AND m.entity_type='COMPETITION' AND m.provider_entity_id=r.tournament_id
   LEFT JOIN competitions c ON c.id=m.livasports_entity_id
   WHERE r.retry_after>now() ORDER BY r.retry_after`)).rows;
 const byTarget=targets.map(t=>{const cells=coverage.cells.filter(c=>c.bookmaker===t.bookmaker&&c.competition===t.competition&&c.kind!=='REAL');
   const scheduled=inputs.targets.find(i=>i.bookmaker===t.bookmaker&&i.tournamentId===t.tournament_id);
   return {...t,delay_minutes:Math.max(0,Math.round((+new Date(t.retry_after)-+now)/60000)),affected_selections:cells.length,
    affected_fixtures:new Set(cells.map(c=>c.fixtureId)).size,reasons:Object.fromEntries([...new Set(cells.map(c=>c.reason))].map(reason=>[String(reason),cells.filter(c=>c.reason===reason).length])),
    has_useful_coverage:scheduled?.hasUsefulCoverage??false,recent_native:scheduled?.recentNative??false,native_expiry_at:scheduled?.nativeExpiryAt??null,nearest_kickoff:scheduled?.fixtures.map(f=>f.kickoff).sort()[0]??null};});
 const gap=coverage.cells.filter(c=>c.reason==='PROVIDER_GAP');
 const gaps=Object.values(Object.groupBy(gap,c=>[c.bookmaker,c.competition,c.market].join('|'))).map(rows=>({bookmaker:rows![0].bookmaker,competition:rows![0].competition,market:rows![0].market,selections:rows!.length,fixtures:new Set(rows!.map(r=>r.fixtureId)).size})).sort((a,b)=>b.selections-a.selections);
 const delayMinutes=byTarget.filter(t=>t.affected_selections>0).map(t=>t.delay_minutes).sort((a,b)=>a-b);
 const marketCatalog=(await db.query("SELECT markets FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0]?.markets??[];
 const sourceStorage=await db.query(`SELECT source_provider,b.provider_slug,count(*)::int AS quotes,count(DISTINCT fixture_id)::int AS fixtures
   FROM odds_native_source_current s JOIN bookmakers b ON b.id=s.bookmaker_id GROUP BY source_provider,b.provider_slug ORDER BY source_provider,b.provider_slug`);
 const evidence=await db.query(`SELECT bookmaker,market,classification,count(*)::int AS selections,count(DISTINCT fixture_id)::int AS fixtures,
   count(*) FILTER(WHERE evidence->'quote' IS NOT NULL)::int AS returned_quotes
   FROM odds_native_diagnostics WHERE observed_at>now()-interval '7 days' GROUP BY bookmaker,market,classification ORDER BY bookmaker,market,classification`);
 const cadence=budgetCadence(inputs.targets,now,inputs.budget),plan=planScheduler(inputs.targets,now,inputs.budget);
 const data={at:now.toISOString(),providerRequests:0,coverage:{fixtures:coverage.fixtures,counts:coverage.counts,delayCounts:coverage.delayCounts,groups:coverage.groups.filter(g=>g.competition==='*')},
   backoff:{affectedSelections:byTarget.reduce((n,t)=>n+t.affected_selections,0),subreasons:Object.fromEntries(Object.entries(Object.groupBy(byTarget.filter(t=>t.affected_selections>0),t=>String(t.backoff_reason??'UNCLASSIFIED'))).map(([k,v])=>[k,v!.reduce((n,t)=>n+t.affected_selections,0)])),
     averageDelayMinutes:delayMinutes.length?Math.round(delayMinutes.reduce((a,b)=>a+b,0)/delayMinutes.length):0,medianDelayMinutes:delayMinutes.length?delayMinutes[Math.floor(delayMinutes.length/2)]:0},
   scheduler:{cadence,pacing:plan.pacing,dueBatches:plan.batches,maximumBillableRequests:plan.maximumBillableRequests},
   targets:byTarget,gaps,unresolved:coverage.unresolvedIdentities,budget:inputs.budget,marketCatalog,sourceStorage:sourceStorage.rows,evidence:evidence.rows};
 await writeFile(`output/native-gap-backoff-${label}-private.json`,JSON.stringify(data,null,2));
 console.log(JSON.stringify(data));
}finally{await db.close();}
