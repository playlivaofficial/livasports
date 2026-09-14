import type {DatabaseClient} from '@/database/client';
import {ProviderMappingService} from '@/domain/provider-mapping';
import {FootballIngestionService} from './FootballIngestionService';
import {HttpSportmonksGateway} from '@/providers/sportmonks/HttpSportmonksGateway';
import {SportmonksAdapter} from '@/providers/sportmonks/SportmonksAdapter';
import {PostgresFootballRepository} from '@/repositories/postgres-football.repository';
import {PostgresProviderEntityMappingRepository} from '@/repositories/postgres-provider-mapping.repository';
import {SafeProviderError} from '@/providers/safe-error';
import type {CacheInvalidator} from '@/cache/invalidation';
import {persistScoreDetails} from '@/sports/score-details';

export function scoreTickDue(last:{started_at:Date;status:string;error_message?:string|null}|undefined,now=Date.now()):boolean {
  if(!last)return true;
  const cooldown=last.status==='FAILED'?(/\b(401|403)\b/.test(last.error_message??'')?86400000:15*60000):4*60000;
  return now-last.started_at.getTime()>=cooldown;
}
/** Reuses the existing external ticker and sports request accounting. Never invoked by navigation. */
export async function runScoreTicker(db:DatabaseClient,key:string|undefined,invalidator?:CacheInvalidator){
  if(!key)return {state:'NOT_CONFIGURED',providerRequests:0};
  return db.transaction(async tx=>{
    if(!(await tx.query("SELECT pg_try_advisory_xact_lock(hashtext('livasports-score-ticker')) AS acquired")).rows[0]?.acquired)
      return {state:'ALREADY_RUNNING',providerRequests:0};
    const last=(await tx.query("SELECT started_at,status,error_message FROM ingestion_sync_runs WHERE sync_kind='SCORES' ORDER BY started_at DESC LIMIT 1")).rows[0];
    if(!scoreTickDue(last as {started_at:Date;status:string;error_message:string}|undefined))return {state:'NOT_DUE',providerRequests:0};
    const repository=new PostgresFootballRepository(db),gateway=new HttpSportmonksGateway(key,undefined,rows=>persistScoreDetails(db,rows));
    const mappings=new ProviderMappingService(new PostgresProviderEntityMappingRepository(db));
    const service=new FootballIngestionService(new SportmonksAdapter(gateway,mappings,code=>repository.findCountryByCode(code)),repository,undefined,undefined,invalidator);
    try{return {state:'SUCCEEDED',...await service.syncFixtureScores(50)};}
    catch(error){return {state:'FAILED',providerRequests:gateway.requestCount(),error:error instanceof SafeProviderError?'SPORTMONKS_HTTP_'+error.context.status:'SCORES_SYNC_FAILED'};}
  });
}
