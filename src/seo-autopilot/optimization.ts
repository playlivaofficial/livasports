import 'server-only';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {gscProperty} from '@/seo/gsc';
import {gscWindows} from '@/seo/gsc-ingest';
import {measurePage} from '@/seo/page-breakdowns';
import {firstFullSearchDay,observationWindow,addSearchDays} from '@/seo/experiment-windows';
import {readGrowthEvidence,type GrowthEvidence} from './optimization-data';
import {actionGate,assessExperiment,experimentArm,queryIntent,SEO_OPTIMIZATION as config,seoLinkBoostScore,seoPerformanceWeightAdjustment,type GrowthPage,type Metric,type Opportunity} from './optimization-policy';
import {crawlSeoUrl} from './crawl';
import {contentHash} from './policy';
import {metadataSourceSignature} from './optimization-metadata';

const dayOf=(d:Date)=>d.toISOString().slice(0,10);
const metric=(m:Awaited<ReturnType<typeof measurePage>>):Metric=>({...m.totals??{clicks:0,impressions:0,ctr:0,position:0},days:m.complete?Math.round((Date.parse(m.to)-Date.parse(m.from))/86400000)+1:0,positionSpread:0});
const safePage=(p:GrowthPage)=>({url:p.url,type:p.type,cluster:p.cluster,current:p.current,previous:p.previous,queries:p.queries.slice(0,5),countries:p.countries,devices:p.devices,publishedAt:p.publishedAt,lastChangedAt:p.lastChangedAt,status:p.status,technicalHealthy:p.technicalHealthy,fresh:p.fresh});
async function logAction(db:QueryExecutor,now:Date,o:Opportunity,action:string,outcome:string,reason:string,previous:unknown,next:unknown,experimentId:unknown=null){
  await db.query(`INSERT INTO seo_growth_actions(action_key,day,url,action,outcome,reason,confidence,detector,previous_value,new_value,evidence,experiment_id,config_version,release_sha)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14) ON CONFLICT(action_key) DO NOTHING`,
    [contentHash({day:dayOf(now),url:o.url,action,outcome}),dayOf(now),o.url,action,outcome,reason,o.confidence,o.detector,JSON.stringify(previous),JSON.stringify(next),JSON.stringify({page:safePage(o.evidence),benchmark:o.benchmark,cohortSize:o.cohortSize,query:o.query}),experimentId,config.version,process.env.VERCEL_GIT_COMMIT_SHA??null]);
}
/** 7/14/28-day observations freeze exact windows; not wins inferred from partial days. */
async function observeExperiments(db:DatabaseClient,now:Date,evidence:GrowthEvidence){
  if(evidence.mode!=='ACTIVE')return {measured:0,frozen:0};
  const experiments=(await db.query(`SELECT *,observation_start::text AS observation_start FROM seo_growth_experiments
    WHERE state='OBSERVING' ORDER BY last_measured_at NULLS FIRST,started_at LIMIT $1`,[config.maxExperimentsPerRun])).rows;
  let measured=0,frozen=0;
  for(const e of experiments){
    const source=(e.previous_value as {source?:{page:string;control:string}})?.source;
    const livePage=evidence.pages.find(p=>p.url===e.page),liveControl=evidence.pages.find(p=>p.url===e.control_page);
    if(source&&(!livePage||!liveControl||source.page!==metadataSourceSignature(livePage.label,livePage.status,livePage.kickoff??null)||source.control!==metadataSourceSignature(liveControl.label,liveControl.status,liveControl.kickoff??null))){
      await db.transaction(async tx=>{
        await tx.query("UPDATE seo_growth_experiments SET state='FROZEN',frozen_until=$2 WHERE id=$1",[e.id,new Date(now.getTime()+config.rollbackCooldownDays*86400000)]);
        if(livePage)await logAction(tx,now,{url:livePage.url,detector:'DECAYING_WINNER',confidence:'HIGH',reason:'SOURCE_LIFECYCLE_CHANGED',proposedAction:'FREEZE_REVIEW',benchmark:null,cohortSize:1,query:null,evidence:livePage},'SOURCE_FREEZE','APPLIED','Fixture lifecycle or canonical source changed; experiment is confounded',{state:e.state},{state:'FROZEN'},e.id);
      });frozen++;continue;
    }
    const existing=(await db.query('SELECT window_days FROM seo_growth_observations WHERE experiment_id=$1',[e.id])).rows;
    for(const days of [7,14,28] as const){
      const w=observationWindow(String(e.observation_start),days);if(w.to>gscWindows(now).latestComplete||existing.some(r=>Number(r.window_days)===days))continue;
      const [after,control]=await Promise.all([measurePage(db,gscProperty(),String(e.page),w.from,w.to),measurePage(db,gscProperty(),String(e.control_page),w.from,w.to)]);
      if(!after.complete||!control.complete||!after.breakdownsComplete||!control.breakdownsComplete)continue;
      const baseline=e.baseline as Record<string,{page:Metric;control:Metric}>;
      const assessment=assessExperiment(baseline[String(days)].page,metric(after),baseline[String(days)].control,metric(control),days);
      await db.transaction(async tx=>{
        await tx.query(`INSERT INTO seo_growth_observations(experiment_id,window_days,from_day,to_day,metrics,assessment) VALUES($1,$2,$3,$4,$5::jsonb,$6)
          ON CONFLICT(experiment_id,window_days) DO NOTHING`,[e.id,days,w.from,w.to,JSON.stringify({page:after,control}),assessment]);
        if(assessment==='FREEZE_REVIEW'&&config.rollbackEnabled){
          // A freeze is safer than attributing a seasonal/fixture demand change to metadata. No destructive rollback.
          await tx.query("UPDATE seo_growth_experiments SET state='FROZEN',frozen_until=$2 WHERE id=$1",[e.id,new Date(now.getTime()+config.rollbackCooldownDays*86400000)]);
          const p=evidence.pages.find(p=>p.url===e.page);
          if(p)await logAction(tx,now,{url:p.url,detector:'DECAYING_WINNER',confidence:'HIGH',reason:assessment,proposedAction:'FREEZE_REVIEW',benchmark:null,cohortSize:1,query:null,evidence:p},'FREEZE_REVIEW','APPLIED','Control-adjusted deterioration; freeze and diagnose before any rollback',{state:e.state},{state:'FROZEN',minimumCooldownDays:config.rollbackCooldownDays},e.id);
          frozen++;
        }else if(days===28)await tx.query("UPDATE seo_growth_experiments SET state='COMPLETE' WHERE id=$1",[e.id]);
      });measured++;if(assessment==='FREEZE_REVIEW')break;
    }
    await db.query('UPDATE seo_growth_experiments SET last_measured_at=$2 WHERE id=$1',[e.id,now]);
  }
  return {measured,frozen};
}
async function weeklyWeights(db:DatabaseClient,e:GrowthEvidence,now:Date){
  const monday=new Date(now);monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);const week=dayOf(monday);
  if(e.mode!=='ACTIVE'||!config.clusterLearningEnabled)return {week,changed:0,mode:'OBSERVE_ONLY'};
  const previousWeights=(await db.query('SELECT cluster,adjustment,evaluated_week::text AS week FROM seo_growth_cluster_weights')).rows;
  let changed=0;
  for(const cluster of [...new Set(e.pages.map(p=>p.cluster).filter((s):s is string=>!!s))].sort()){
    const old=previousWeights.find(w=>w.cluster===cluster);
    if(old?.week===week)continue;
    const pages=e.pages.filter(p=>p.cluster===cluster),qualified=pages.filter(p=>p.current.days>=7&&p.previous.days>=7&&p.current.impressions>=100&&p.previous.impressions>=100);
    const detectors=e.opportunities.filter(o=>o.evidence.cluster===cluster);
    const countEntities=(rows:Opportunity[])=>new Set(rows.map(o=>o.evidence.entityId??o.url)).size;
    const winners=countEntities(detectors.filter(o=>o.detector==='WINNING_PAGE')),losers=countEntities(detectors.filter(o=>['DECAYING_WINNER','LOW_VALUE'].includes(o.detector)));
    const qualifiedCount=new Set([...qualified.map(p=>p.entityId??p.url),...detectors.filter(o=>o.detector==='LOW_VALUE').map(o=>o.evidence.entityId??o.url)]).size;
    if(!old&&qualifiedCount<3)continue; // No per-team neutral rows or fake learning from sparse samples.
    // Do not turn insufficient history into a negative finding; only old adjustments decay toward neutral.
    const previous=Number(old?.adjustment??0),next=seoPerformanceWeightAdjustment(previous,winners,losers,qualifiedCount,true);
    const reasons={winners,losers,qualifiedPages:qualifiedCount,old:previous,new:next,reason:qualifiedCount<3?'INSUFFICIENT_CLUSTER_EVIDENCE_DECAY_TO_NEUTRAL':'BOUNDED_COMPARABLE_WINDOWS'};
    await db.transaction(async tx=>{
      await tx.query(`INSERT INTO seo_growth_cluster_weights(cluster,adjustment,evaluated_week,evidence,updated_at) VALUES($1,$2,$3,$4::jsonb,$5)
        ON CONFLICT(cluster) DO UPDATE SET adjustment=$2,evaluated_week=$3,evidence=$4::jsonb,updated_at=$5`,[cluster,next,week,JSON.stringify(reasons),now]);
      if(next!==previous){const p=pages[0];await logAction(tx,now,{url:`cluster:${cluster}`,detector:winners>losers?'WINNING_PAGE':'LOW_VALUE',confidence:qualified.length>=3?'MEDIUM':'LOW',reason:reasons.reason,proposedAction:'RESOURCE_PRIORITY',benchmark:null,cohortSize:qualified.length,query:null,evidence:p},'RESOURCE_PRIORITY','APPLIED',reasons.reason,{adjustment:previous},{adjustment:next});changed++;}
    });
  }
  return {week,changed,mode:'ACTIVE'};
}
/** Only existing factual match identity and verified modules. Query text is never injected into HTML. */
export function proposedMetadata(p:GrowthPage,title:string,description:string){
  const intent=queryIntent(p.queries[0]?.query??'');
  const suffix=p.status==='FINISHED'?'resultado e dados do jogo':'horário e dados do jogo';
  const base=p.label.trim();
  if(!base||base.length>100||!title||!description||p.type!=='FIXTURE'||!p.kickoff||!['SCHEDULED','FINISHED'].includes(p.status??'')||(p.status==='FINISHED'&&!p.hasResult))return null;
  const date=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short'}).format(new Date(p.kickoff));
  const nextTitle=`${base}: ${suffix} (${date})`;
  const nextDescription=`Acompanhe ${base}: ${p.status==='FINISHED'?'resultado registrado':'horário programado'} e dados disponíveis do confronto no LivaSports.`;
  return {title:nextTitle,description:nextDescription,intent,sourceSignature:metadataSourceSignature(p.label,p.status,p.kickoff)};
}

export async function runGrowthOptimization(db:DatabaseClient,now=new Date(),fetcher:typeof fetch=fetch){
  const started=Date.now();
  const evidence=await readGrowthEvidence(db,now);
  if(!evidence.migrationReady)return {mode:'OBSERVE_ONLY',reasons:evidence.reasons,applied:0,providerRequests:0};
  const observations=await observeExperiments(db,now,evidence),weekly=await weeklyWeights(db,evidence,now);
  const usedRows=(await db.query("SELECT action,count(*)::int AS n FROM seo_growth_actions WHERE day=$1 AND outcome='APPLIED' GROUP BY action",[dayOf(now)])).rows;
  const counts=new Map(usedRows.map(r=>[String(r.action),Number(r.n)]));
  const reserved=new Set<string>();let applied=0,held=0;
  for(const o of evidence.opportunities.slice(0,60)){
    if(Date.now()-started>45_000)break; // Preserve time for the base publisher and technical/sitemap health.
    const kind=o.proposedAction==='TITLE_PATTERN'?'TITLE_PATTERN':'INTERNAL_LINK_BOOST';
    if(!['TITLE_PATTERN','INTERNAL_LINK_BOOST'].includes(o.proposedAction))continue;
    const p=o.evidence;
    let gate=actionGate(p,kind,o.confidence,now,counts.get(kind)??0,evidence.mode);
    if(reserved.has(p.url)||applied>=config.maxActionsPerRun)gate='RUN_CAP_OR_CONFLICT';
    // Stable assignment within a comparable type/locale/intent/position cohort, not selecting a winning variant after results.
    const cohort=`${kind}:${p.type}:${p.locale}:${queryIntent(o.query??'')}:${Math.floor(p.current.position/5)}:${dayOf(now).slice(0,7)}`;
    if(experimentArm(`${cohort}:${p.url}`)!=='VARIANT')gate='CONTROL_ASSIGNMENT';
    const control=evidence.pages.filter(c=>c.url!==p.url&&c.type===p.type&&c.locale===p.locale&&c.status===p.status&&c.cluster===p.cluster&&!c.activeExperiment&&!reserved.has(c.url)
      &&queryIntent(c.queries[0]?.query??'')===queryIntent(o.query??'')&&Math.abs(c.current.position-p.current.position)<=3
      &&c.current.impressions>=p.current.impressions*.5&&c.current.impressions<=p.current.impressions*2&&c.current.days>=config.minimumDaysObserved
      &&c.technicalHealthy&&c.fresh&&experimentArm(`${cohort}:${c.url}`)==='CONTROL').sort((a,b)=>a.url.localeCompare(b.url))[0];
    if(gate==='ELIGIBLE'&&!control)gate='NO_COMPARABLE_CONTROL';
    if(gate!=='ELIGIBLE'){held++;await logAction(db,now,o,kind,'HELD',gate,{},{});continue;}
    const baseline:Record<string,{page:Metric;control:Metric}>={};let baselineOk=true;
    for(const days of [7,14,28]){const to=evidence.to,from=addSearchDays(to,-days+1);const [a,b]=await Promise.all([measurePage(db,gscProperty(),p.url,from,to),measurePage(db,gscProperty(),control!.url,from,to)]);
      baseline[String(days)]={page:metric(a),control:metric(b)};if(!a.complete||!b.complete||!a.breakdownsComplete||!b.breakdownsComplete)baselineOk=false;}
    if(!baselineOk){held++;await logAction(db,now,o,kind,'HELD','BASELINE_INCOMPLETE',{},{});continue;}
    const html=await crawlSeoUrl(p.url,fetcher).catch(()=>null),controlHtml=await crawlSeoUrl(control!.url,fetcher).catch(()=>null);
    if(!html||!controlHtml||html.problems.length||controlHtml.problems.length||!html.indexFollow||!controlHtml.indexFollow){held++;await logAction(db,now,o,kind,'HELD','RENDERED_QUALITY_GATE',{},{});continue;}
    const proposed=proposedMetadata(p,html.title,html.description??'');
    const next=kind==='TITLE_PATTERN'?proposed:{linkBoost:seoLinkBoostScore(o),intentFocus:queryIntent(o.query??''),expiresAt:new Date(now.getTime()+config.signalExpiryDays*86400000).toISOString()};
    const source={page:metadataSourceSignature(p.label,p.status,p.kickoff??null),control:metadataSourceSignature(control!.label,control!.status,control!.kickoff??null)};
    const previous=kind==='TITLE_PATTERN'?{title:p.title,description:p.description,optimizationMetadata:p.optimizationMetadata??null,renderedTitle:html.title,renderedDescription:html.description,source}:{linkBoost:p.linkBoost,source};
    if(!next||(kind==='TITLE_PATTERN'&&(proposed!.title===html.title||(await db.query('SELECT 1 FROM seo_autopilot_pages WHERE lower(title)=lower($1) AND url<>$2 LIMIT 1',[proposed!.title,p.url])).rows.length))){held++;await logAction(db,now,o,kind,'HELD','DUPLICATE_OR_UNCHANGED_METADATA',previous,next);continue;}
    const experimentId=await db.transaction(async tx=>{
      const experiment=(await tx.query(`INSERT INTO seo_growth_experiments(cohort,kind,page,control_page,started_at,observation_start,baseline,previous_value,new_value,confidence,reason,release_sha)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12) RETURNING id`,[cohort,kind,p.url,control!.url,now,firstFullSearchDay(now),JSON.stringify(baseline),JSON.stringify(previous),JSON.stringify(next),o.confidence,o.reason,process.env.VERCEL_GIT_COMMIT_SHA??null])).rows[0];
      if(kind==='TITLE_PATTERN')await tx.query('UPDATE seo_autopilot_pages SET title=$2,description=$3,metadata_changed_at=$4,content_changed_at=$4,optimization_metadata=$5::jsonb WHERE url=$1',[p.url,proposed!.title,proposed!.description,now,JSON.stringify(proposed)]);
      else await tx.query('UPDATE seo_autopilot_pages SET link_boost=$2,link_boost_until=$3,intent_focus=$4 WHERE url=$1',[p.url,seoLinkBoostScore(o),new Date(now.getTime()+config.signalExpiryDays*86400000),queryIntent(o.query??'')]);
      await logAction(tx,now,o,kind,'APPLIED',o.reason,previous,next,experiment.id);
      return String(experiment.id);
    });
    if(kind==='TITLE_PATTERN'){
      const rendered=await crawlSeoUrl(p.url,fetcher).catch(()=>null);
      if(!rendered||rendered.problems.length||!rendered.title.startsWith(proposed!.title)||rendered.description!==proposed!.description){
        await db.transaction(async tx=>{
          await tx.query('UPDATE seo_autopilot_pages SET title=$2,description=$3,optimization_metadata=$4::jsonb,metadata_changed_at=$5,content_changed_at=$5 WHERE url=$1 AND optimization_metadata=$6::jsonb',
            [p.url,p.title,p.description,JSON.stringify(p.optimizationMetadata??null),now,JSON.stringify(proposed)]);
          await tx.query("UPDATE seo_growth_experiments SET state='FROZEN',frozen_until=$2 WHERE id=$1",[experimentId,new Date(now.getTime()+config.rollbackCooldownDays*86400000)]);
          await logAction(tx,now,o,'RENDER_RECOVERY','APPLIED','Rendered metadata did not match: restore exact prior override and freeze',next,previous,experimentId);
        });
      }
    }
    counts.set(kind,(counts.get(kind)??0)+1);reserved.add(p.url);reserved.add(control!.url);applied++;
  }
  const report={mode:evidence.mode,reasons:evidence.reasons,from:evidence.from,to:evidence.to,observedDays:evidence.observedDays,metrics7:evidence.metrics7,metrics28:evidence.metrics28,
    opportunities:evidence.opportunities.slice(0,80).map(o=>({...o,evidence:safePage(o.evidence)})),insufficientEvidencePages:evidence.pages.filter(p=>p.current.days<config.minimumDaysObserved).length,
    eligiblePages:evidence.pages.filter(p=>p.managed).length,observations,weekly,applied,held,providerRequests:0};
  await db.query(`INSERT INTO seo_growth_snapshots(day,mode,report,config_version) VALUES($1,$2,$3::jsonb,$4)
    ON CONFLICT(day) DO UPDATE SET mode=$2,report=$3::jsonb,config_version=$4,captured_at=now()`,[dayOf(now),evidence.mode,JSON.stringify(report),config.version]);
  await db.query(`INSERT INTO seo_growth_weekly(week,report) VALUES($1,$2::jsonb) ON CONFLICT(week) DO NOTHING`,[weekly.week,JSON.stringify({...report,
    nextPriorities:evidence.opportunities.slice(0,20).map(o=>({url:o.url,detector:o.detector,action:o.proposedAction,confidence:o.confidence})),
    note:'Weekly strategic snapshot; results remain descriptive, not causal. No automatic deletion/noindex.'})]);
  return report;
}
