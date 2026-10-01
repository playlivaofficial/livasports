import {createHash} from 'node:crypto';
import type {QueryExecutor} from '@/database/client';

export interface StandingsFreshness {
  competitionId:string;seasonId:string;providerUpdatedAt:string|null;fetchedAt:string|null;persistedAt:string|null;
  snapshotHash:string|null;snapshotVersion:number;lastSuccess:string|null;lastError:string|null;stale:boolean;ageSeconds:number|null;pending:boolean;
}
const iso=(v:unknown)=>v?new Date(String(v)).toISOString():null;
export async function standingsRevision(db:QueryExecutor,slug:string){
  const rows=(await db.query(`SELECT q.season_id,q.snapshot_version,q.last_success_at,q.last_error,q.dirty_version,q.refreshed_version
    FROM standings_refresh_state q JOIN competitions c ON c.id=q.competition_id WHERE c.slug=$1 ORDER BY q.season_id`,[slug])).rows;
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,24);
}
export async function readStandingsFreshness(db:QueryExecutor,seasonId:string):Promise<StandingsFreshness|null>{
  const r=(await db.query(`SELECT *,extract(epoch FROM now()-last_success_at)::int AS age_seconds FROM standings_refresh_state WHERE season_id=$1`,[seasonId])).rows[0];
  if(!r)return null;
  const age=r.age_seconds===null?null:Number(r.age_seconds),pending=String(r.dirty_version)!==String(r.refreshed_version);
  return {competitionId:String(r.competition_id),seasonId:String(r.season_id),providerUpdatedAt:iso(r.provider_updated_at),fetchedAt:iso(r.fetched_at),persistedAt:iso(r.persisted_at),
    snapshotHash:r.snapshot_hash??null,snapshotVersion:Number(r.snapshot_version),lastSuccess:iso(r.last_success_at),lastError:r.last_error??null,
    stale:pending||!!r.last_error||age===null||age>13*3600,ageSeconds:age,pending};
}
