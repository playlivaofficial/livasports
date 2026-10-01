import {createHash} from 'node:crypto';
import type {QueryExecutor} from '@/database/client';
import {sportmonksUtc} from '@/providers/sportmonks/utc';

type Row=Record<string,unknown>;
export interface StandingsEvidence {fetchedAt:string;providerUpdatedAt:string|null;hash:string;metrics:Record<string,number>;rows:number;}
export interface PreviousStandings {fetched_at:Date|string|null;provider_updated_at:Date|string|null;snapshot_hash:string|null;snapshot_metrics:Record<string,number>;row_count:number;}
export class StandingsSnapshotError extends Error {}
const array=(v:unknown):Row[]=>Array.isArray(v)?v:[];
export function standingsEvidence(rows:Row[],fetchedAt=new Date().toISOString()):StandingsEvidence {
  const timestamps=rows.map(r=>(r.season as Row|undefined)?.standings_recalculated_at??r.updated_at).filter((v):v is string=>typeof v==='string').map(v=>sportmonksUtc(v).toISOString());
  const metrics:Record<string,number>={};
  const canonical=rows.map(r=>{
    if(!Number.isSafeInteger(r.id)||!Number.isSafeInteger(r.participant_id)||!Number.isInteger(r.position)||Number(r.position)<1)throw new StandingsSnapshotError('INVALID_SNAPSHOT');
    const key=`${r.stage_id??0}:${r.group_id??0}:${r.participant_id}`;
    if(key in metrics)throw new StandingsSnapshotError('DUPLICATE_STANDING');
    const played=array(r.details).find(d=>d.type_id===129)?.value;
    if(played==null||!Number.isInteger(Number(played))||Number(played)<0)throw new StandingsSnapshotError('INVALID_PLAYED');
    metrics[key]=Number(played);
    return {id:r.id,key,position:r.position,points:r.points,details:array(r.details).map(d=>({type:d.type_id,value:d.value})).sort((a,b)=>Number(a.type)-Number(b.type)),form:r.form??null,rule:r.rule??null};
  }).sort((a,b)=>a.key.localeCompare(b.key));
  return {fetchedAt,providerUpdatedAt:timestamps.length?[...timestamps].sort()[0]:null,hash:createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),metrics,rows:rows.length};
}
export function rejectStandingsSnapshot(prior:PreviousStandings|undefined,next:StandingsEvidence):string|null {
  if(!prior)return null;
  if(prior.fetched_at&&Date.parse(next.fetchedAt)<new Date(prior.fetched_at).getTime())return 'OLDER_FETCH';
  if(prior.row_count>0&&next.rows===0)return 'EMPTY_REPLACEMENT';
  const oldTime=prior.provider_updated_at?new Date(prior.provider_updated_at).getTime():null;
  const newTime=next.providerUpdatedAt?Date.parse(next.providerUpdatedAt):null;
  if(oldTime!==null&&(newTime===null||newTime<oldTime))return 'OLDER_PROVIDER_SNAPSHOT';
  // A positively newer upstream revision can include legitimate deductions/rescissions.
  if(oldTime!==null&&newTime!==null&&newTime>oldTime)return null;
  for(const [key,played] of Object.entries(prior.snapshot_metrics))if(!(key in next.metrics)||next.metrics[key]<played)return 'REGRESSING_UNVERSIONED_SNAPSHOT';
  return null;
}
export async function lockStandingsSnapshot(db:QueryExecutor,seasonId:string,competitionId:string,next:StandingsEvidence){
  await db.query(`INSERT INTO standings_refresh_state(season_id,competition_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[seasonId,competitionId]);
  const prior=(await db.query<PreviousStandings>(`SELECT * FROM standings_refresh_state WHERE season_id=$1 FOR UPDATE`,[seasonId])).rows[0];
  const reason=rejectStandingsSnapshot(prior,next);if(reason)throw new StandingsSnapshotError(reason);
}
export async function commitStandingsSnapshot(db:QueryExecutor,seasonId:string,next:StandingsEvidence){
  await db.query(`UPDATE standings_refresh_state SET provider_updated_at=$2,fetched_at=$3,persisted_at=now(),last_success_at=now(),
    snapshot_version=snapshot_version+CASE WHEN snapshot_hash IS DISTINCT FROM $4 THEN 1 ELSE 0 END,snapshot_hash=$4,snapshot_metrics=$5::jsonb,row_count=$6 WHERE season_id=$1`,
    [seasonId,next.providerUpdatedAt,next.fetchedAt,next.hash,JSON.stringify(next.metrics),next.rows]);
  await db.query(`UPDATE standings_current SET provider_updated_at=$2 WHERE season_id=$1`,[seasonId,next.providerUpdatedAt]);
}
