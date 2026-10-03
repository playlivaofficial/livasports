import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {gscProperty} from './gsc';
import {gscWindows} from './gsc-ingest';
import {measurePage,type PageMeasurement} from './page-breakdowns';
import {addSearchDays,firstFullSearchDay,OBSERVATION_DAYS,observationWindow,observationAssessment,descriptiveDelta} from './experiment-windows';

export interface ExperimentRegistration {
  key:string;page:string;locale:'br'|'mx'|'co'|'pe'|'en';queryCluster:string;reason:string;
  oldTitle:string;oldDescription:string;newTitle:string;newDescription:string;
  baseline:Record<'7'|'14'|'28',PageMeasurement>;
}
/** Explicit CLI/release registration only. Conflict never replaces the frozen BEFORE evidence. */
export async function registerExperiment(db:QueryExecutor,input:ExperimentRegistration){
  const url=new URL(input.page);
  if(url.origin!=='https://livasports.com'||!url.pathname.startsWith(`/${input.locale}/`)||url.hash)throw Error('INVALID_EXPERIMENT_PAGE');
  if(!Object.values(input.baseline).every(b=>b.complete&&b.breakdownsComplete))throw Error('BASELINE_INCOMPLETE');
  if(input.oldTitle===input.newTitle&&input.oldDescription===input.newDescription)throw Error('NO_METADATA_CHANGE');
  return (await db.query(`INSERT INTO seo_metadata_experiments(experiment_key,property,page,locale,query_cluster,reason,
    old_title,old_description,new_title,new_description,baseline) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
    ON CONFLICT(experiment_key,page) DO NOTHING RETURNING id`,
    [input.key,gscProperty(),input.page,input.locale,input.queryCluster,input.reason,input.oldTitle,input.oldDescription,
      input.newTitle,input.newDescription,JSON.stringify(input.baseline)])).rows[0]?.id??null;
}
/** Only after exact production HTML is verified. Idempotent: retries cannot move the observation clock. */
export async function activateExperiment(db:QueryExecutor,id:string,sha:string,changedAt:Date){
  if(!/^[a-f0-9]{40}$/.test(sha)||!Number.isFinite(changedAt.getTime()))throw Error('INVALID_RELEASE');
  return db.query(`UPDATE seo_metadata_experiments SET changed_at=$2,release_sha=$3,observation_start=$4
    WHERE id=$1 AND changed_at IS NULL`,[id,changedAt,sha,firstFullSearchDay(changedAt)]);
}
const isoDay=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):String(value);

/** Daily persisted follow-up, DB-only. No metadata mutation, winners, automatic rollout or rollback. */
export async function captureExperimentObservations(db:QueryExecutor,now=new Date()){
  const rows=(await db.query(`SELECT e.id,e.property,e.page,e.observation_start::text AS observation_start,
    ARRAY(SELECT o.window_days FROM seo_experiment_observations o WHERE o.experiment_id=e.id) AS captured_windows
    FROM seo_metadata_experiments e WHERE e.changed_at IS NOT NULL ORDER BY e.changed_at DESC LIMIT 100`)).rows;
  let captured=0;
  for(const row of rows)for(const days of OBSERVATION_DAYS){
    if((row.captured_windows as number[]|undefined)?.includes(days))continue;
    const window=observationWindow(isoDay(row.observation_start),days);
    if(window.to>gscWindows(now).latestComplete)continue;
    const metrics=await measurePage(db,String(row.property),String(row.page),window.from,window.to);
    if(!metrics.complete||!metrics.breakdownsComplete)continue;
    const saved=await db.query(`INSERT INTO seo_experiment_observations(experiment_id,window_days,from_day,to_day,metrics)
      VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(experiment_id,window_days) DO NOTHING RETURNING experiment_id`,
      [row.id,days,window.from,window.to,JSON.stringify(metrics)]);
    captured+=saved.rows.length;
  }
  return captured;
}

export async function readExperiments(db:QueryExecutor,now=new Date()){
  // PostgreSQL DATE is a calendar day: avoid pg's local-midnight Date conversion.
  const rows=(await db.query(`SELECT *,observation_start::text AS observation_start FROM seo_metadata_experiments ORDER BY registered_at DESC LIMIT 100`)).rows;
  const observations=rows.length?(await db.query(`SELECT experiment_id,window_days,from_day,to_day,metrics,measured_at
    FROM seo_experiment_observations WHERE experiment_id=ANY($1::uuid[])`,[rows.map(row=>row.id)])).rows:[];
  return rows.map(row=>{
    const baseline=row.baseline as ExperimentRegistration['baseline'];
    const start=row.observation_start?isoDay(row.observation_start):null;
    return {id:String(row.id),experimentKey:String(row.experiment_key),page:String(row.page),queryCluster:String(row.query_cluster),reason:String(row.reason),
      oldTitle:String(row.old_title),newTitle:String(row.new_title),oldDescription:String(row.old_description),newDescription:String(row.new_description),
      changedAt:row.changed_at?new Date(String(row.changed_at)).toISOString():null,baseline,
      changedThisWeek:!!row.changed_at&&Date.parse(String(row.changed_at))>=now.getTime()-7*86_400_000,
      windows:OBSERVATION_DAYS.map(days=>{
        const window=start?observationWindow(start,days):null;
        const observation=observations.find(o=>o.experiment_id===row.id&&Number(o.window_days)===days);
        const current=(observation?.metrics as PageMeasurement|undefined)?.totals??null,before=baseline[String(days) as '7'|'14'|'28'].totals;
        return {days,...window,earliestReadDate:window?addSearchDays(window.to,3):null,current,
          status:observationAssessment(before,current,!!observation),delta:before&&current?descriptiveDelta(before,current):null};
      })};
  });
}
export type MetadataExperiment=Awaited<ReturnType<typeof readExperiments>>[number];
