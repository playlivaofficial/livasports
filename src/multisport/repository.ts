import {createHash,randomUUID} from 'node:crypto';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {validateSnapshot,type SportsSnapshot} from './model';
import {assertOpenLigaSnapshot} from './openligadb';
import {orderSportsSnapshots} from './ordering';
import {assertRefreshProgress} from './refresh-integrity';

export interface SnapshotRecord {key:string;draft:SportsSnapshot;published:SportsSnapshot|null;revision:number;reviewedRevision:number|null;reviewedAt:string|null;archived:boolean}
export interface SnapshotMutation {action:'create'|'save'|'review'|'publish'|'archive';key:string;revision:number;draft?:SportsSnapshot}
export interface RefreshState {sourceKey:string;lastAttemptAt:string|null;lastSuccessAt:string|null;nextAllowedAt:string;upstreamVersion:string|null;failures:number;lastError:string|null;leaseToken:string|null}
export type RefreshClaim={claimed:true;token:string;previousVersion:string|null}|{claimed:false;reason:'busy'|'not-due';nextAllowedAt?:string};
const columns='snapshot_key AS "key",draft,published,revision,reviewed_revision AS "reviewedRevision",reviewed_at::text AS "reviewedAt",archived';
const refreshColumns='source_key AS "sourceKey",last_attempt_at::text AS "lastAttemptAt",last_success_at::text AS "lastSuccessAt",next_allowed_at::text AS "nextAllowedAt",upstream_version AS "upstreamVersion",failures,last_error AS "lastError",lease_token AS "leaseToken"';
const sixHours=6*60*60*1000;
export function snapshotKey(snapshot:Pick<SportsSnapshot,'competitionId'|'season'>){return `${snapshot.competitionId}:${snapshot.season}`;}
function validKey(key:unknown):key is string{return typeof key==='string'&&key.length<=160&&/^[a-z0-9]+(?:-[a-z0-9]+)*:[A-Za-z0-9][A-Za-z0-9 /_.()-]{0,79}$/.test(key);}
function canonical(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
}
/** Re-fetching identical source data does not create another draft or pretend it is newer. */
export function snapshotHash(snapshot:SportsSnapshot){const content:Record<string,unknown>={...snapshot};delete content.retrievedAt;return createHash('sha256').update(canonical(content)).digest('hex');}
function assertSnapshot(value:unknown,key:string,now:Date):asserts value is SportsSnapshot {
  let valid=false;try{valid=validateSnapshot(value,now).length===0&&snapshotKey(value as SportsSnapshot)===key;}catch{/* Reject malformed shapes without exposing internal errors. */}
  if(!valid)throw new Error('INVALID_SNAPSHOT');
}
export function transitionSnapshot(record:SnapshotRecord,input:SnapshotMutation,now=new Date()):SnapshotRecord {
  if(input.key!==record.key||input.revision!==record.revision)throw new Error('REVISION_CONFLICT');
  if(input.action==='save'){
    assertSnapshot(input.draft,record.key,now);
    if(snapshotHash(input.draft)===snapshotHash(record.draft))return record;
    return {...record,draft:input.draft,revision:record.revision+1,reviewedRevision:null,reviewedAt:null};
  }
  if(input.action==='review'){
    assertSnapshot(record.draft,record.key,now);
    return {...record,reviewedRevision:record.revision,reviewedAt:now.toISOString()};
  }
  if(input.action==='archive')return record.archived?record:{...record,archived:true,revision:record.revision+1,reviewedRevision:null,reviewedAt:null};
  if(input.action!=='publish')throw new Error('INVALID_ACTION');
  assertSnapshot(record.draft,record.key,now);
  const reviewed=Date.parse(record.reviewedAt??'');
  if(record.reviewedRevision!==record.revision||!Number.isFinite(reviewed)||reviewed>now.getTime()||now.getTime()-reviewed>86400000)throw new Error('REVIEW_REQUIRED');
  return {...record,published:record.draft,archived:false};
}
async function writeRecord(db:QueryExecutor,row:SnapshotRecord,action:string){
  await db.query(`UPDATE sports_snapshots SET draft=$2,published=$3,revision=$4,reviewed_revision=$5,reviewed_at=$6,archived=$7,content_hash=$8,edited_at=now() WHERE snapshot_key=$1`,[row.key,JSON.stringify(row.draft),row.published?JSON.stringify(row.published):null,row.revision,row.reviewedRevision,row.reviewedAt,row.archived,snapshotHash(row.draft)]);
  await audit(db,row,action);
}
async function audit(db:QueryExecutor,row:SnapshotRecord,action:string){await db.query('INSERT INTO sports_snapshot_audit(snapshot_key,action,revision,content_hash,snapshot) VALUES ($1,$2,$3,$4,$5)',[row.key,action,row.revision,snapshotHash(row.draft),JSON.stringify(row)]);}
async function createRecord(db:QueryExecutor,draft:SportsSnapshot,action:string):Promise<SnapshotRecord>{
  const row:SnapshotRecord={key:snapshotKey(draft),draft,published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false};
  await db.query('INSERT INTO sports_snapshots(snapshot_key,competition_id,season,draft,content_hash) VALUES ($1,$2,$3,$4,$5)',[row.key,draft.competitionId,draft.season,JSON.stringify(draft),snapshotHash(draft)]);
  await audit(db,row,action);return row;
}
export class SportsRepository {
  constructor(private readonly db:DatabaseClient){}
  async listOwner():Promise<SnapshotRecord[]>{return (await this.db.query<SnapshotRecord>(`SELECT ${columns} FROM sports_snapshots ORDER BY edited_at DESC,snapshot_key LIMIT 200`)).rows;}
  async listPublished():Promise<SportsSnapshot[]>{return orderSportsSnapshots((await this.db.query<{published:SportsSnapshot}>('SELECT published FROM sports_snapshots WHERE published IS NOT NULL AND NOT archived ORDER BY competition_id,season DESC LIMIT 500')).rows.map(row=>row.published).filter(snapshot=>validateSnapshot(snapshot).length===0));}
  async findPublished(competitionId:string,season?:string):Promise<SportsSnapshot|null>{
    const snapshots=(await this.db.query<{published:SportsSnapshot}>(`SELECT published FROM sports_snapshots WHERE competition_id=$1 AND ($2::text IS NULL OR season=$2) AND published IS NOT NULL AND NOT archived ORDER BY season DESC LIMIT 100`,[competitionId,season??null])).rows.map(row=>row.published);
    return orderSportsSnapshots(snapshots.filter(snapshot=>validateSnapshot(snapshot).length===0&&snapshot.competitionId===competitionId&&(!season||snapshot.season===season)))[0]??null;
  }
  async mutate(input:SnapshotMutation,now=new Date()):Promise<SnapshotRecord>{
    if(!input||!validKey(input.key)||!Number.isSafeInteger(input.revision)||input.revision<0||!['create','save','review','publish','archive'].includes(input.action))throw new Error('INVALID_MUTATION');
    return this.db.transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(724220)');
      const recent=await db.query<{count:string}>("SELECT count(*) FROM sports_snapshot_audit WHERE recorded_at>now()-interval '10 minutes'");
      if(Number(recent.rows[0]?.count)>=100)throw new Error('RATE_LIMITED');
      const current=(await db.query<SnapshotRecord>(`SELECT ${columns} FROM sports_snapshots WHERE snapshot_key=$1 FOR UPDATE`,[input.key])).rows[0];
      if(input.action==='create'){
        if(input.revision!==0)throw new Error('REVISION_CONFLICT');
        assertSnapshot(input.draft,input.key,now);
        if(current){if(snapshotHash(current.draft)===snapshotHash(input.draft))return current;throw new Error('REVISION_CONFLICT');}
        return createRecord(db,input.draft,'create');
      }
      if(!current)throw new Error('NOT_FOUND');
      const next=transitionSnapshot(current,input,now);
      if(canonical(current)===canonical(next))return current;
      await writeRecord(db,next,input.action);return next;
    });
  }
  async refreshStatus():Promise<RefreshState[]>{return (await this.db.query<RefreshState>(`SELECT ${refreshColumns} FROM sports_source_refresh ORDER BY source_key LIMIT 30`)).rows;}
  /** Durable reservation is committed before HTTP, so crashes/manual clicks cannot reset the six-hour budget. */
  async claimRefresh(sourceKey:string,now=new Date(),jitterMs=0):Promise<RefreshClaim>{
    if(sourceKey!=='openligadb:bl1:2026')throw new Error('SOURCE_NOT_APPROVED');
    return this.db.transaction(async db=>{
      const lock=await db.query<{locked:boolean}>('SELECT pg_try_advisory_xact_lock(724221,hashtext($1)) AS locked',[sourceKey]);
      if(!lock.rows[0]?.locked)return {claimed:false,reason:'busy'};
      await db.query('INSERT INTO sports_source_refresh(source_key,next_allowed_at) VALUES ($1,$2) ON CONFLICT DO NOTHING',[sourceKey,now.toISOString()]);
      const state=(await db.query<RefreshState>(`SELECT ${refreshColumns} FROM sports_source_refresh WHERE source_key=$1 FOR UPDATE`,[sourceKey])).rows[0];
      if(Date.parse(state.nextAllowedAt)>now.getTime())return {claimed:false,reason:'not-due',nextAllowedAt:state.nextAllowedAt};
      const token=randomUUID(),next=new Date(now.getTime()+sixHours+Math.max(0,Math.min(300000,jitterMs)));
      await db.query('UPDATE sports_source_refresh SET lease_token=$2,last_attempt_at=$3,next_allowed_at=$4 WHERE source_key=$1',[sourceKey,token,now.toISOString(),next.toISOString()]);
      return {claimed:true,token,previousVersion:state.upstreamVersion};
    });
  }
  /** Stage validated data, or publish only through the separately enabled fixed Bundesliga policy. */
  async finishRefresh(input:{sourceKey:string;token:string;upstreamVersion:string;snapshot?:SportsSnapshot;publishAutomatically?:boolean},now=new Date()):Promise<SnapshotRecord|null>{
    return this.db.transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(724220)');
      const state=(await db.query<RefreshState>(`SELECT ${refreshColumns} FROM sports_source_refresh WHERE source_key=$1 FOR UPDATE`,[input.sourceKey])).rows[0];
      if(!state||state.leaseToken!==input.token)throw new Error('REFRESH_LEASE_LOST');
      let result:SnapshotRecord|null=null,changed=false;
      if(input.snapshot){
        const key=snapshotKey(input.snapshot);assertSnapshot(input.snapshot,key,now);
        const old=(await db.query<SnapshotRecord>(`SELECT ${columns} FROM sports_snapshots WHERE snapshot_key=$1 FOR UPDATE`,[key])).rows[0];
        assertRefreshProgress(old?.published??null,input.snapshot);
        if(!old){result=await createRecord(db,input.snapshot,'refresh');changed=true;}
        else{result=transitionSnapshot(old,{action:'save',key,revision:old.revision,draft:input.snapshot},now);if(result!==old){await writeRecord(db,result,'refresh');changed=true;}}
        if(input.publishAutomatically&&!result.archived){
          // Only the fixed, full Bundesliga feed can use the automatic publication path.
          // A manual source URL/mode claim is insufficient: reconcile every score again.
          assertOpenLigaSnapshot(input.snapshot,now);
          if(!result.archived&&result.published&&snapshotHash(result.published)===snapshotHash(result.draft)){
            // No audit/revision churn on an unchanged publication.
          }else{
            result={...result,published:result.draft,archived:false,reviewedRevision:result.revision,reviewedAt:now.toISOString()};
            await writeRecord(db,result,'auto-publish');
            changed=true;
          }
        }
      }
      if(!input.snapshot&&input.publishAutomatically){
        const staged=(await db.query<SnapshotRecord>(`SELECT ${columns} FROM sports_snapshots WHERE snapshot_key=$1 FOR UPDATE`,['bundesliga:2026/27'])).rows[0];
        if(staged&&!staged.archived&&(!staged.published||snapshotHash(staged.published)!==snapshotHash(staged.draft))){
          assertOpenLigaSnapshot(staged.draft,now);
          result={...staged,published:staged.draft,reviewedRevision:staged.revision,reviewedAt:now.toISOString()};
          await writeRecord(db,result,'auto-publish');
          changed=true;
        }
      }
      await db.query('UPDATE sports_source_refresh SET upstream_version=$3,last_success_at=$4,failures=0,last_error=NULL,lease_token=NULL WHERE source_key=$1 AND lease_token=$2',[input.sourceKey,input.token,input.upstreamVersion,now.toISOString()]);
      // Reconciliation after a manual import can have a new refresh marker but
      // identical content. Report no mutation, avoiding false publication/cache churn.
      return changed?result:null;
    });
  }
  async failRefresh(sourceKey:string,token:string,errorCode:string,now=new Date()):Promise<void>{
    const safeCode=/^[A-Z][A-Z0-9_]{0,63}$/.test(errorCode)?errorCode:'REFRESH_FAILED';
    await this.db.query(`UPDATE sports_source_refresh SET failures=LEAST(failures+1,8),last_error=$3,lease_token=NULL,next_allowed_at=GREATEST(next_allowed_at,$4::timestamptz+(LEAST(48,6*power(2,LEAST(failures,3))) * interval '1 hour')) WHERE source_key=$1 AND lease_token=$2`,[sourceKey,token,safeCode,now.toISOString()]);
  }
}
