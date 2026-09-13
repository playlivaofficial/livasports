import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { databaseUrl,PostgresDatabaseClient } from '@/database/client';
import { runMigrations } from '@/database/migrate';
import { M5OddsPapiAdapter } from '@/providers/oddspapi/M5OddsPapiAdapter';
import { M5_TOURNAMENTS, normalizeM5Snapshot,verifyCatalog } from '@/providers/oddspapi/m5-normalizer';
import { mergeCatalogTournaments,resolveCatalogTournaments,schedulerTournaments } from '@/providers/oddspapi/tournament-catalog';
import { COVERAGE_DISCOVERY_REQUEST_CAP } from '@/providers/oddspapi/request-limits';
import {planUtcParseDefectRepair} from './matching';
import {buildCoverageMatrix} from './coverage-matrix';
import {canonicalFixtures,endOddsJob,persistSnapshot,startOddsJob} from './ingestion';
import {planOddsRefresh} from './refresh-policy';
import {budgetHealth} from './budget';
import {splitProviderBatches} from './scheduler-policy';
import type { OddsSnapshot } from './types';
import {runOddsScheduler} from './scheduler';

const db=new PostgresDatabaseClient(databaseUrl()!);
let job:string|null=null;
try {
  const command=process.argv[2]??'verify';
  if(command==='migrate')console.info(JSON.stringify({migrations:await runMigrations(db)}));
  else if(command==='scheduled-refresh')console.info(JSON.stringify(await runOddsScheduler(db,process.env.ODDSPAPI_API_KEY!)));
  else if(command==='discover-catalog'){
    const health=await budgetHealth(db);
    if(!health.verified||Number(health.safeRemaining)<COVERAGE_DISCOVERY_REQUEST_CAP)throw new Error('ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED');
    job=await startOddsJob(db);
    const provider=new M5OddsPapiAdapter(db,process.env.ODDSPAPI_API_KEY!,job,1,false,Date.now()+60000);
    const data=await provider.providerTournaments();
    if(!Array.isArray(data))throw new Error('ODDSPAPI_TOURNAMENTS_UNUSABLE');
    const existing=(await db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
    if(!existing)throw new Error('ODDS_CATALOG_NOT_VERIFIED');
    const merged=mergeCatalogTournaments(existing.tournaments,data);
    await db.query("UPDATE odds_provider_catalog SET tournaments=$1::jsonb,verified_at=now() WHERE provider='ODDSPAPI'",[JSON.stringify(merged)]);
    const resolved=resolveCatalogTournaments(merged);
    await endOddsJob(db,job,true);job=null;
    console.info(JSON.stringify({requests:provider.requestCount(),storedTournaments:merged.length,
      resolved:resolved.map(row=>({id:row.id,slug:row.slug,category:row.category,canonical:row.canonical})),
      scheduler:schedulerTournaments(merged).map(row=>row.id)}));
  }
  else if(command==='canary-tournament'){
    const slug=process.argv[3]??'';
    const health=await budgetHealth(db);
    if(!health.verified||Number(health.safeRemaining)<COVERAGE_DISCOVERY_REQUEST_CAP)throw new Error('ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED');
    const catalog=(await db.query("SELECT markets,tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
    if(!catalog)throw new Error('ODDS_CATALOG_NOT_VERIFIED');verifyCatalog(catalog.markets,catalog.tournaments);
    const candidate=resolveCatalogTournaments(catalog.tournaments).find(row=>row.canonical===slug);
    if(!candidate)throw new Error('ODDS_TOURNAMENT_UNVERIFIED');
    if(M5_TOURNAMENTS.some(row=>row.id===candidate.id))throw new Error('ODDS_TOURNAMENT_ALREADY_STABLE');
    job=await startOddsJob(db);
    const mapped=[...schedulerTournaments(catalog.tournaments),candidate];
    const provider=new M5OddsPapiAdapter(db,process.env.ODDSPAPI_API_KEY!,job,4,false,Date.now()+140000,mapped);
    const results=[];
    for(const bookmaker of ['betano.bet.br','betsson'] as const){
      const snapshot=await provider.snapshot(bookmaker,[candidate.id]);
      results.push(await persistSnapshot(db,job,snapshot));
      const again=await provider.snapshot(bookmaker,[candidate.id]);
      results.push(await persistSnapshot(db,job,again));
    }
    await endOddsJob(db,job,true);job=null;
    console.info(JSON.stringify({canonical:candidate.canonical,tournamentId:candidate.id,requests:provider.requestCount(),results}));
  }
  else if(command==='repair-utc-kickoffs'){
    const snapshots=(await db.query(`SELECT DISTINCT ON (bookmaker) payload FROM odds_sync_snapshots
      WHERE applied_at IS NOT NULL ORDER BY bookmaker,observed_at DESC`)).rows.map(r=>r.payload as OddsSnapshot);
    const fixtures=await canonicalFixtures(db);
    const planned=new Map<string,{fixtureId:string;before:string;after:string}>();
    for(const snapshot of snapshots)for(const fixture of snapshot.fixtures){
      const repair=planUtcParseDefectRepair(fixture,fixtures);if(!repair)continue;
      const existing=planned.get(repair.fixtureId);
      if(existing&&existing.after!==repair.after)throw new Error('ODDS_KICKOFF_REPAIR_CONFLICT');
      planned.set(repair.fixtureId,repair);
    }
    job=await startOddsJob(db);
    for(const repair of planned.values()){
      await db.query(`UPDATE fixtures SET kickoff=$2,updated_at=now() WHERE id=$1 AND kickoff=$3`,[repair.fixtureId,repair.after,repair.before]);
      await db.query(`UPDATE provider_entity_mappings SET metadata=metadata||jsonb_build_object('m5KickoffCorrection',$2::jsonb),updated_at=now()
        WHERE provider='SPORTMONKS' AND entity_type='FIXTURE' AND livasports_entity_id=$1`,
        [repair.fixtureId,JSON.stringify({observedAt:new Date().toISOString(),before:repair.before,after:repair.after,reason:'UTC_PARSE_DEFECT_PROVEN'})]);
      await db.query(`UPDATE provider_entity_mappings SET metadata=metadata||jsonb_build_object('canonicalKickoff',$2::text),updated_at=now()
        WHERE provider='ODDSPAPI' AND entity_type='FIXTURE' AND livasports_entity_id=$1 AND metadata->>'canonicalKickoff'=$3`,
        [repair.fixtureId,repair.after,repair.before]);
    }
    const results=[];
    for(const snapshot of snapshots)results.push(await persistSnapshot(db,job,snapshot));
    await endOddsJob(db,job,true);job=null;
    console.info(JSON.stringify({providerRequests:0,repairs:planned.size,results:results.map(r=>({bookmaker:r.bookmaker,matchedFixtures:r.matchedFixtures,quotes:r.quotes}))}));
  }
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
        JSON.stringify(mergeCatalogTournaments([], audit.responses['tournaments:{"sportId":10,"language":"en"}'].data)),audit.startedAt]);
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
        const mapped=schedulerTournaments(catalog.tournaments);
        const fixtures=(await canonicalFixtures(db)).filter(f=>mapped.some(t=>t.canonical===f.competition));
        const latest=(await db.query(`SELECT min(at) AS at FROM (SELECT bookmaker,max(observed_at) AS at FROM odds_sync_snapshots WHERE applied_at IS NOT NULL GROUP BY bookmaker)s`)).rows[0]?.at;
        const plan=planOddsRefresh(fixtures,latest?.toISOString()??null);
        console.info(JSON.stringify({stage:'ODDS_REFRESH_PLAN',...plan}));
        const provider=new M5OddsPapiAdapter(db,process.env.ODDSPAPI_API_KEY!,job,4,false,Date.now()+140000,mapped);
        for(const bookmaker of ['betano.bet.br','betsson']){
          const due=mapped.filter(t=>fixtures.some(f=>f.competition===t.canonical&&f.status==='SCHEDULED'&&Date.parse(f.kickoff)>Date.now()))
            .map(t=>({bookmaker,tournamentId:t.id,fixtures:fixtures.filter(f=>f.competition===t.canonical),publicEligible:true,hasUsefulCoverage:true,lastSuccessAt:null,retryAfter:null}));
          for(const tournamentIds of splitProviderBatches(due)){
            const snapshot=await provider.snapshot(bookmaker,tournamentIds);
            const result=await persistSnapshot(db,job,snapshot);console.info(JSON.stringify(result));
          }
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
  } else if(command==='coverage-matrix'){
    const report=await buildCoverageMatrix(db);
    await writeFile('output/odds-coverage-matrix-private.json',JSON.stringify(report,null,2));
    console.info(JSON.stringify({
      at:report.at,budget:report.budget,
      scheduler:{state:report.scheduler?.state,lastError:report.scheduler?.last_error,lastAutomaticRefreshAt:report.scheduler?.last_automatic_refresh_at,nextDueAt:report.scheduler?.next_due_at},
      schedulerTournaments:report.schedulerTournaments,
      ligaMxUnmapped:report.ligaMxGap.length,
      rows:report.rows.map(row=>({slug:row.slug,id:row.oddspapiTournamentId,state:row.verificationState,upcoming:row.upcoming,mapped:row.mapped,
        betsson:row.betsson.matchWinner,betano:row.betano.matchWinner,scheduler:row.schedulerEnabled,reason:row.disabledReason})),
    }));
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
