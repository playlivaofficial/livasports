import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { databaseUrl,PostgresDatabaseClient } from '@/database/client';
import { runMigrations } from '@/database/migrate';
import { M5OddsPapiAdapter } from '@/providers/oddspapi/M5OddsPapiAdapter';
import { M5_TOURNAMENTS,normalizeM5Snapshot,verifyCatalog } from '@/providers/oddspapi/m5-normalizer';
import { canonicalFixtures,endOddsJob,persistSnapshot,startOddsJob } from './ingestion';
import {planOddsRefresh} from './refresh-policy';
import type { OddsSnapshot } from './types';
import {runOddsScheduler} from './scheduler';

const db=new PostgresDatabaseClient(databaseUrl()!);
let job:string|null=null;
try {
  const command=process.argv[2]??'verify';
  if(command==='migrate')console.info(JSON.stringify({migrations:await runMigrations(db)}));
  else if(command==='scheduled-refresh')console.info(JSON.stringify(await runOddsScheduler(db,process.env.ODDSPAPI_API_KEY!)));
  else if(command==='import-audit'||command==='refresh'||command==='resume'||command==='replay-latest'){
    job=await startOddsJob(db);let snapshots:OddsSnapshot[]=[];
    if(command==='import-audit'){
      const audit=JSON.parse(await readFile('output/m5-audit-private.json','utf8'));
      verifyCatalog(audit.responses['markets:{"language":"en"}'].data,audit.responses['tournaments:{"sportId":10,"language":"en"}'].data);
      const subs=audit.responses['account:{}'].data.subscriptions.filter((s:{is_active:boolean})=>s.is_active);
      if(subs.length!==1||subs[0].request_limit!==5000||!subs[0].sport_ids.includes(10)||
        !subs[0].bookmakers['betano.bet.br']||!subs[0].bookmakers.betsson||
        ['betano.bet.br','betsson'].some(b=>subs[0].bookmakers[b].has_live_odds!==false||subs[0].bookmakers[b].has_player_props!==false))throw new Error('ACCOUNT_SCOPE_NOT_VERIFIED');
      const s=subs[0];
      await db.query(`INSERT INTO odds_provider_catalog(provider,markets,tournaments,verified_at) VALUES('ODDSPAPI',$1::jsonb,$2::jsonb,$3)
        ON CONFLICT(provider) DO NOTHING`,[JSON.stringify(audit.responses['markets:{"language":"en"}'].data.filter((m:{marketId:number})=>[101,104,1010].includes(m.marketId))),
        JSON.stringify(audit.responses['tournaments:{"sportId":10,"language":"en"}'].data.filter((t:{tournamentId:number})=>M5_TOURNAMENTS.some(m=>m.id===String(t.tournamentId)))),audit.startedAt]);
      await db.query(`INSERT INTO odds_budget_baselines(period_start,period_end,externally_consumed,hard_limit,verified_at)
        VALUES($1,$2,$3,5000,$4) ON CONFLICT(period_start) DO NOTHING`,[s.valid_from,s.valid_until,s.request_count,audit.responses['account:{}'].observedAt]);
      for(const r of audit.requests){
        const id='audit-'+createHash('sha256').update(JSON.stringify([r.at,r.endpoint,r.query])).digest('hex');
        await db.query(`INSERT INTO odds_provider_requests(id,endpoint,safe_query,started_at,completed_at,http_status,outcome)
          VALUES($1,$2,$3::jsonb,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,[id,r.endpoint,JSON.stringify(r.query),r.at,r.observedAt??null,typeof r.status==='number'?r.status:null,r.status===200?'SUCCEEDED':'AUDIT_ERROR']);
      }
      for(const [key,value] of Object.entries(audit.responses))if(key.startsWith('odds-by-tournaments:')){
          const query=JSON.parse(key.slice(key.indexOf(':')+1));const response=value as {data:unknown;observedAt:string};
          snapshots.push(normalizeM5Snapshot(response.data,query.bookmaker,response.observedAt,query.tournamentIds.split(',')));
      }
      const betano=snapshots.find(s=>s.bookmaker==='betano.bet.br');
      if(!betano?.quotes.length||betano.quotes.some(q=>q.sourceDomain!=='www.betano.bet.br'))throw new Error('BETANO_GEO_EVIDENCE_MISSING');
      await db.query(`INSERT INTO bookmaker_geo_availability(bookmaker_id,country_id,odds_enabled,comparison_enabled,affiliate_enabled,verified_at,evidence)
        SELECT b.id,c.id,b.provider_slug='betano.bet.br' AND c.iso2='BR',b.provider_slug='betano.bet.br' AND c.iso2='BR',false,$1,
        jsonb_build_object('source','M5 account and fixture-domain audit','reason',CASE WHEN b.provider_slug='betano.bet.br' AND c.iso2='BR' THEN 'BR-specific paid feed verified'
          WHEN b.provider_slug='betsson' THEN 'Generic betsson.com feed; BR/MX jurisdiction unverified' ELSE 'BR source is not MX coverage' END)
        FROM bookmakers b CROSS JOIN countries c WHERE b.provider_slug IN ('betano.bet.br','betsson') AND c.iso2 IN ('BR','MX')
        ON CONFLICT(bookmaker_id,country_id) DO NOTHING`,[betano.observedAt]);
    }else if(command==='refresh'){
        const catalog=(await db.query("SELECT markets,tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
        if(!catalog)throw new Error('ODDS_CATALOG_NOT_VERIFIED');verifyCatalog(catalog.markets,catalog.tournaments);
        const fixtures=(await canonicalFixtures(db)).filter(f=>M5_TOURNAMENTS.some(t=>t.canonical===f.competition));
        const latest=(await db.query(`SELECT min(at) AS at FROM (SELECT bookmaker,max(observed_at) AS at FROM odds_sync_snapshots WHERE applied_at IS NOT NULL GROUP BY bookmaker)s`)).rows[0]?.at;
        const plan=planOddsRefresh(fixtures,latest?.toISOString()??null);
        console.info(JSON.stringify({stage:'ODDS_REFRESH_PLAN',...plan}));
        const provider=new M5OddsPapiAdapter(db,process.env.ODDSPAPI_API_KEY!,job,4);
        for(const bookmaker of ['betano.bet.br','betsson']){
          const tournaments=M5_TOURNAMENTS.filter(t=>fixtures.some(f=>f.competition===t.canonical&&f.status==='SCHEDULED'&&Date.parse(f.kickoff)>Date.now())).map(t=>t.id);
          if(!tournaments.length)continue;
          const snapshot=await provider.snapshot(bookmaker,tournaments);
          const result=await persistSnapshot(db,job,snapshot);console.info(JSON.stringify(result));
        }
        console.info(JSON.stringify({requestsThisRun:provider.requestCount()}));
    }else{
      snapshots=(await db.query(command==='replay-latest'?
        'SELECT DISTINCT ON(bookmaker) payload FROM odds_sync_snapshots WHERE applied_at IS NOT NULL ORDER BY bookmaker,observed_at DESC LIMIT 2':
        'SELECT payload FROM odds_sync_snapshots WHERE applied_at IS NULL ORDER BY observed_at LIMIT 4')).rows.map(r=>r.payload);
    }
    const results=[];for(const snapshot of snapshots)results.push(await persistSnapshot(db,job,snapshot));
    if(results.length){await writeFile('output/m5-ingestion-private.json',JSON.stringify({at:new Date().toISOString(),results},null,2));console.info(JSON.stringify(results));}
    await endOddsJob(db,job,true);job=null;
  } else if(command==='verify'){
    const result=await db.query(`SELECT
      (SELECT count(*) FROM competitions WHERE enabled) AS enabled_competitions,
      (SELECT count(*) FROM fixtures) AS fixtures,
      (SELECT count(*) FROM teams) AS teams,
      (SELECT count(*) FROM provider_entity_mappings) AS mappings,
      (SELECT count(*) FROM odds_current) AS current_quotes,
      (SELECT count(*) FROM odds_history) AS history,
      (SELECT count(*) FROM odds_provider_requests) AS m5_requests,
      (SELECT count(*) FROM odds_mapping_reviews WHERE state IN ('EXACT','HIGH_CONFIDENCE')) AS matched_fixtures,
      (SELECT count(*) FROM odds_sync_jobs WHERE status='RUNNING') AS running_jobs,
      (SELECT count(*) FROM odds_sync_snapshots WHERE applied_at IS NULL) AS unapplied_snapshots,
      (SELECT count(*) FROM (SELECT fixture_id,bookmaker_id,market_code,outcome_code,line FROM odds_current GROUP BY 1,2,3,4,5 HAVING count(*)>1)d) AS duplicate_quotes,
      (SELECT count(*) FROM odds_current WHERE scope<>'FULL_TIME_REGULATION' OR phase<>'PREGAME' OR decimal_odds<=1 OR decimal_odds>1000 OR (market_code='TOTAL_GOALS' AND line<>2.5)
        OR (market_code='MATCH_WINNER' AND outcome_code NOT IN ('HOME','DRAW','AWAY')) OR (market_code='TOTAL_GOALS' AND outcome_code NOT IN ('OVER','UNDER')) OR (market_code='BTTS' AND outcome_code NOT IN ('YES','NO'))) AS invalid_quotes,
      (SELECT count(*) FROM odds_current o LEFT JOIN fixtures f ON f.id=o.fixture_id LEFT JOIN bookmakers b ON b.id=o.bookmaker_id WHERE f.id IS NULL OR b.id IS NULL) AS orphan_quotes`);
    const coverage=(await db.query(`SELECT c.slug,b.provider_slug,o.market_code,o.status,count(*) AS quotes,count(DISTINCT f.id) AS fixtures,min(o.provider_updated_at) AS oldest_provider_timestamp,
      max(o.provider_updated_at) AS newest_provider_timestamp,max(o.observed_at) AS observed_at FROM odds_current o JOIN fixtures f ON f.id=o.fixture_id
      JOIN competitions c ON c.id=f.competition_id JOIN bookmakers b ON b.id=o.bookmaker_id GROUP BY 1,2,3,4 ORDER BY 1,2,3,4`)).rows;
    const matching=(await db.query('SELECT state,count(*) AS n FROM odds_mapping_reviews GROUP BY state')).rows;
    const report={at:new Date().toISOString(),...result.rows[0],coverage,matching};
    await writeFile('output/m5-verification-private.json',JSON.stringify(report,null,2));console.info(JSON.stringify(report));
  }else throw new Error('UNKNOWN_ODDS_COMMAND');
}catch(error){
  if(job)await endOddsJob(db,job,false).catch(()=>undefined);
  const message=error instanceof Error?error.message:'Unknown failure';
  const safe=['SPORTMONKS_API_KEY','ODDSPAPI_API_KEY','DATABASE_URL','DATABASE_POSTGRES_URL','POSTGRES_URL'].reduce((s,k)=>process.env[k]?s.split(process.env[k]!).join('[REDACTED]'):s,message);
  console.error(JSON.stringify({error:safe}));process.exitCode=1;
}finally {await db.close();}
