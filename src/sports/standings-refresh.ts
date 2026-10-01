import type {DatabaseClient} from '@/database/client';
import type {CacheInvalidator} from '@/cache/invalidation';
import {SportsIngestionStore,type ProviderRow} from './ingestion-store';
import {standingsEvidence,StandingsSnapshotError} from './standings-snapshot';

export const STANDINGS_POLICY={perTick:3,dailyCap:192,hourlyCap:24,safetyHours:12,settleMinutes:5} as const;
export const standingsTag=(id:string)=>`standings:${id}`;
export function standingsBackoff(failures:number,code:string){
  if(/HTTP_(401|403|404)/.test(code))return 24*60;
  if(code==='HTTP_429')return 60;
  return [5,15,60,360,720][Math.min(Math.max(0,failures-1),4)];
}
type Candidate={id:string;competition_id:string;slug:string;league:string;provider_id:string;name:string;dirty_version:string;refreshed_version:string;snapshot_hash:string|null;failures:number;};
class StandingsRequestError extends Error {constructor(readonly code:string){super(code);}}
export async function fetchStandings(key:string,providerSeason:string,transport:typeof fetch=fetch):Promise<ProviderRow[]> {
  if(!/^\d+$/.test(providerSeason))throw new StandingsRequestError('INVALID_MAPPING');
  const url=new URL(`https://api.sportmonks.com/v3/football/standings/seasons/${providerSeason}`);
  url.searchParams.set('include','participant;details.type;stage;group;rule;form;season');
  let response:Response;try{response=await transport(url,{headers:{Authorization:key,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw new StandingsRequestError('NETWORK_FAILURE');}
  if(!response.ok)throw new StandingsRequestError(`HTTP_${response.status}`);
  const body=await response.json().catch(()=>null);
  if(!body||!Array.isArray(body.data)||body.pagination?.has_more)throw new StandingsRequestError('INCOMPLETE_RESPONSE');
  return body.data;
}
/** A separate sports cron. No public read or odds job calls this worker. */
export async function runStandingsRefresh(db:DatabaseClient,key:string|undefined,invalidator:CacheInvalidator,transport:typeof fetch=fetch){
  const result={status:'OK',providerRequests:0,refreshed:[] as string[],errors:[] as {seasonId:string;code:string}[]};
  if(!key?.trim())return {...result,status:'NOT_CONFIGURED'};
  return db.transaction(async lock=>{
    if(!(await lock.query<{locked:boolean}>(`SELECT pg_try_advisory_xact_lock(hashtext('livasports-standings-refresh')) AS locked`)).rows[0]?.locked)return {...result,status:'BUSY'};
    // Discover rollover/current seasons without any provider catalogue call. Old dirty seasons remain eligible.
    await db.query(`INSERT INTO standings_refresh_state(season_id,competition_id)
      SELECT s.id,s.competition_id FROM seasons s JOIN competitions c ON c.id=s.competition_id WHERE c.enabled AND s.is_current ON CONFLICT DO NOTHING`);
    const usage=(await db.query<{today:number;hour:number;halted:boolean}>(`SELECT count(*) FILTER(WHERE started_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS today,
      count(*) FILTER(WHERE started_at>now()-interval '1 hour')::int AS hour,
      COALESCE(bool_or(error_code IN ('HTTP_401','HTTP_403','HTTP_429') AND started_at>now()-interval '1 hour'),false) AS halted
      FROM standings_refresh_attempts WHERE started_at>now()-interval '1 day'`)).rows[0];
    if(usage.halted)return {...result,status:'UPSTREAM_COOLDOWN'};
    const limit=Math.min(STANDINGS_POLICY.perTick,STANDINGS_POLICY.dailyCap-usage.today,STANDINGS_POLICY.hourlyCap-usage.hour);
    if(limit<=0)return {...result,status:'BUDGET_LIMIT'};
    const candidates=(await db.query<Candidate>(`SELECT s.id,s.name,s.competition_id,c.slug,lm.provider_entity_id AS league,sm.provider_entity_id AS provider_id,
      q.dirty_version,q.refreshed_version,q.snapshot_hash,q.failures
      FROM standings_refresh_state q JOIN seasons s ON s.id=q.season_id JOIN competitions c ON c.id=s.competition_id AND c.enabled
      JOIN provider_entity_mappings sm ON sm.livasports_entity_id=s.id AND sm.provider='SPORTMONKS' AND sm.entity_type='SEASON'
      JOIN provider_entity_mappings lm ON lm.livasports_entity_id=c.id AND lm.provider='SPORTMONKS' AND lm.entity_type='COMPETITION'
      WHERE q.next_attempt_at<=now() AND (s.is_current OR q.dirty_version>q.refreshed_version)
        AND (q.dirty_version=q.refreshed_version OR q.dirty_at<=now()-interval '5 minutes')
      ORDER BY (q.dirty_version>q.refreshed_version) DESC,q.next_attempt_at,c.priority_br LIMIT $1`,[limit])).rows;
    const store=new SportsIngestionStore(db);
    for(const c of candidates){
      const attempt=(await db.query<{id:string}>(`INSERT INTO standings_refresh_attempts(season_id) VALUES($1) RETURNING id`,[c.id])).rows[0].id;
      await db.query(`UPDATE standings_refresh_state SET last_attempt_at=now() WHERE season_id=$1`,[c.id]);
      result.providerRequests++;
      try {
        const fetchedAt=new Date().toISOString();const rows=await fetchStandings(key,c.provider_id,transport);
        const evidence=standingsEvidence(rows,fetchedAt);
        await store.standings({id:c.id,competitionId:c.competition_id,league:c.league,providerId:Number(c.provider_id),name:c.name},rows,fetchedAt);
        // Unchanged response after a result may mean provider settlement is still pending.
        if(c.dirty_version!==c.refreshed_version&&c.snapshot_hash===evidence.hash)throw new StandingsRequestError('PROVIDER_PENDING');
        await db.query(`UPDATE standings_refresh_state SET refreshed_version=$2,failures=0,last_error=NULL,
          next_attempt_at=CASE WHEN dirty_version>$2 THEN now()+interval '5 minutes' ELSE now()+$3::int*interval '1 minute' END WHERE season_id=$1`,
          [c.id,c.dirty_version,c.dirty_version!==c.refreshed_version?20:STANDINGS_POLICY.safetyHours*60]);
        await db.query(`UPDATE standings_refresh_attempts SET completed_at=now(),status='SUCCEEDED' WHERE id=$1`,[attempt]);
        await invalidator.invalidateTags([standingsTag(c.competition_id),`standings-slug:${c.slug}`]);
        result.refreshed.push(c.id);
      }catch(error){
        const code=error instanceof StandingsRequestError?error.code:error instanceof StandingsSnapshotError?error.message:'PERSISTENCE_FAILURE';
        await db.query(`UPDATE standings_refresh_state SET failures=failures+1,last_error=$2,next_attempt_at=now()+$3::int*interval '1 minute' WHERE season_id=$1`,[c.id,code,standingsBackoff(c.failures+1,code)]);
        await db.query(`UPDATE standings_refresh_attempts SET completed_at=now(),status='FAILED',error_code=$2 WHERE id=$1`,[attempt,code]);
        result.errors.push({seasonId:c.id,code});
        if(/HTTP_(401|403|429|5\d\d)|NETWORK_FAILURE/.test(code))break;
      }
    }
    return result;
  });
}
