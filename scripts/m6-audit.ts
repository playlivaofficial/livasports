import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {runMigrations} from '../src/database/migrate';
import {matchPath} from '../src/match-center/routes';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  const command=process.argv[2]??'audit';
  if(command==='migrate'){
    const first=await runMigrations(db);const second=await runMigrations(db);
    if(second.length)throw new Error('MIGRATION_REPLAY_CHANGED');
    console.info(JSON.stringify({command,first,second,idempotent:true,providerRequests:0}));
  }else{
    const counts=(await db.query(`SELECT
      (SELECT count(*) FROM competitions WHERE enabled) AS competitions,(SELECT count(*) FROM fixtures) AS fixtures,
      (SELECT count(*) FROM teams) AS teams,(SELECT count(*) FROM players) AS players,
      (SELECT count(*) FROM odds_current) AS quotes,(SELECT count(*) FROM odds_history) AS history,
      (SELECT count(*) FROM odds_provider_requests) AS odds_http,
      (SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+
        (SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports_requests,
      (SELECT count(*) FROM odds_sync_jobs WHERE status='RUNNING') AS running_jobs,
      (SELECT count(*) FROM odds_sync_snapshots WHERE applied_at IS NULL) AS pending_snapshots,
      (SELECT count(*) FROM product_events WHERE event_name LIKE 'slip_%') AS slip_events,
      (SELECT count(*) FROM product_events WHERE (fixture_id IS NULL OR competition_id IS NULL) AND event_name NOT IN ('slip_open','slip_clear')) AS invalid_event_contexts`)).rows[0];
    const rows=(await db.query(`SELECT f.public_id,f.kickoff,f.status,h.name AS home,a.name AS away,c.slug,
      EXISTS(SELECT 1 FROM odds_current o JOIN bookmakers b ON b.id=o.bookmaker_id WHERE o.fixture_id=f.id AND b.provider_slug='betano.bet.br' AND o.status='ACTIVE') AS has_retained_active_quotes
      FROM fixtures f JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id JOIN competitions c ON c.id=f.competition_id
      WHERE c.enabled AND (EXISTS(SELECT 1 FROM odds_current o WHERE o.fixture_id=f.id) OR f.status='FINISHED')
      ORDER BY (f.status='SCHEDULED' AND f.kickoff>now()) DESC,has_retained_active_quotes DESC,(c.slug='brasileirao-serie-a') DESC,f.kickoff LIMIT 65`)).rows;
    const samples=rows.map(r=>({...r,path:matchPath(r.slug==='liga-mx'?'mx':'br',r.public_id,r.home,r.away)}));
    const report={at:new Date().toISOString(),counts,samples,providerRequests:0};
    await writeFile('output/m6-audit-private.json',JSON.stringify(report,null,2));
    console.info(JSON.stringify({at:report.at,counts,sampleCount:samples.length,samples:samples.slice(0,3),providerRequests:0}));
  }
}catch{console.error('M6_AUDIT_FAILED; credentials not logged');process.exitCode=1;}finally{await db.close();}
