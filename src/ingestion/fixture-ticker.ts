import type {DatabaseClient} from '@/database/client';
import {ProviderMappingService} from '@/domain/provider-mapping';
import {FootballIngestionService} from './FootballIngestionService';
import {HttpSportmonksGateway} from '@/providers/sportmonks/HttpSportmonksGateway';
import {SportmonksAdapter} from '@/providers/sportmonks/SportmonksAdapter';
import {PostgresFootballRepository} from '@/repositories/postgres-football.repository';
import {PostgresProviderEntityMappingRepository} from '@/repositories/postgres-provider-mapping.repository';
import {SafeProviderError} from '@/providers/safe-error';
import type {CacheInvalidator} from '@/cache/invalidation';

/** Fixture schedule refresh cadence: the public site must always hold the next weeks of fixtures without a manual run. */
export const FIXTURE_SYNC_INTERVAL_MINUTES=6*60;
export const FIXTURE_SYNC_FAILURE_COOLDOWN_MINUTES=30;
export const FIXTURE_SYNC_AUTH_COOLDOWN_MINUTES=24*60;
/** Window: yesterday (late results/postponements) through three weeks ahead; scores keep the recent past current. */
export const FIXTURE_SYNC_WINDOW={daysPast:1,daysFuture:21} as const;

export function fixtureSyncDue(last:{started_at:Date;status:string;error_message?:string|null}|undefined,now=Date.now()):boolean {
  if(!last)return true;
  const minutes=last.status==='FAILED'?(/\b(401|403)\b/.test(last.error_message??'')?FIXTURE_SYNC_AUTH_COOLDOWN_MINUTES:FIXTURE_SYNC_FAILURE_COOLDOWN_MINUTES)
    :last.status==='RUNNING'?FIXTURE_SYNC_FAILURE_COOLDOWN_MINUTES:FIXTURE_SYNC_INTERVAL_MINUTES;
  return now-last.started_at.getTime()>=minutes*60000;
}
/**
 * Automatic fixture ingestion on the existing five-minute ticker (fixtures/between with league filters; a few dozen
 * Sportmonks requests every six hours). Never invoked by navigation; one run at a time through an advisory lock.
 */
export async function runFixtureTicker(db:DatabaseClient,key:string|undefined,invalidator?:CacheInvalidator,now=()=>new Date()){
  if(!key)return {state:'NOT_CONFIGURED',providerRequests:0};
  return db.transaction(async tx=>{
    if(!(await tx.query("SELECT pg_try_advisory_xact_lock(hashtext('livasports-fixture-ticker')) AS acquired")).rows[0]?.acquired)
      return {state:'ALREADY_RUNNING',providerRequests:0};
    const last=(await tx.query("SELECT started_at,status,error_message FROM ingestion_sync_runs WHERE sync_kind='FIXTURES' ORDER BY started_at DESC LIMIT 1")).rows[0];
    if(!fixtureSyncDue(last as {started_at:Date;status:string;error_message:string}|undefined,now().getTime()))return {state:'NOT_DUE',providerRequests:0};
    const repository=new PostgresFootballRepository(db),gateway=new HttpSportmonksGateway(key);
    const mappings=new ProviderMappingService(new PostgresProviderEntityMappingRepository(db));
    const service=new FootballIngestionService(new SportmonksAdapter(gateway,mappings,code=>repository.findCountryByCode(code)),repository,undefined,now,invalidator);
    try{return {state:'SUCCEEDED',...await service.syncFixtures(FIXTURE_SYNC_WINDOW.daysPast,FIXTURE_SYNC_WINDOW.daysFuture)};}
    catch(error){return {state:'FAILED',providerRequests:gateway.requestCount(),error:error instanceof SafeProviderError?'SPORTMONKS_HTTP_'+error.context.status:'FIXTURES_SYNC_FAILED'};}
  });
}
