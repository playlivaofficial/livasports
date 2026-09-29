import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {gscProperty} from '@/seo/gsc';
import {gscWindows} from '@/seo/gsc-ingest';
import {classifyBrand,detectGrowthOpportunities,metricValid,optimizationSafety,pageType,SEO_OPTIMIZATION,type GrowthPage,type Metric} from './optimization-policy';

type Row=Record<string,unknown>;
const iso=(v:unknown)=>v?new Date(String(v)).toISOString():null;
export function growthMetric(rows:Row[]):Metric{
  const impressions=rows.reduce((s,r)=>s+Number(r.impressions),0),clicks=rows.reduce((s,r)=>s+Number(r.clicks),0);
  const position=impressions?rows.reduce((s,r)=>s+Number(r.position)*Number(r.impressions),0)/impressions:0;
  return {impressions,clicks,ctr:impressions?clicks/impressions:0,position,days:new Set(rows.map(r=>String(r.day))).size,
    positionSpread:impressions?Math.sqrt(rows.reduce((s,r)=>s+Number(r.impressions)*(Number(r.position)-position)**2,0)/impressions):0};
}
const groups=(rows:Row[],key:string)=>{const map=new Map<string,Row[]>();for(const r of rows){const k=String(r[key]);const list=map.get(k)??[];list.push(r);map.set(k,list);}return map;};
/** Bulk DB reads only. Query, country and device reports stay independent: no invented joint dimensions. */
export async function readGrowthEvidence(db:QueryExecutor,now=new Date()){
  const w=gscWindows(now),property=gscProperty(),values=[property,w.previous28.from,w.current28.to];
  const [daily,details,sync,breakdowns,facts,legacy]=await Promise.all([
    db.query(`SELECT day::text,dimension,key,clicks,impressions,position,ctr FROM seo_search_daily WHERE property=$1 AND day BETWEEN $2 AND $3 ORDER BY day`,values),
    db.query(`SELECT day::text,page,dimension,key,clicks,impressions,position FROM seo_page_breakdowns WHERE property=$1 AND day BETWEEN $2 AND $3`,values),
    db.query(`SELECT state,truncated,from_day::text,to_day::text,finished_at FROM seo_gsc_syncs WHERE property=$1 ORDER BY started_at DESC LIMIT 1`,[property]),
    db.query(`SELECT DISTINCT ON(dimension) dimension,state,from_day::text,to_day::text,captured_at FROM seo_breakdown_syncs WHERE property=$1 ORDER BY dimension,captured_at DESC`,[property]),
    db.query(`SELECT p.*,f.public_id,f.status,f.kickoff,f.updated_at,f.home_score,f.away_score,c.slug AS cluster,ht.name AS home,at.name AS away,
      EXISTS(SELECT 1 FROM seo_autopilot_technical t WHERE t.url=p.url AND t.status=200 AND t.problems='[]'::jsonb AND t.checked_at>$1::timestamptz-interval '2 days') AS healthy
      FROM seo_autopilot_pages p JOIN fixtures f ON f.id=p.fixture_id JOIN competitions c ON c.id=f.competition_id
      JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id`,[now]),
    db.query('SELECT page FROM seo_metadata_experiments'),
  ]);
  const observedIds=[...new Set(daily.rows.filter(r=>r.dimension==='PAGE').map(r=>/-([a-f0-9]{16})$/.exec(String(r.key))?.[1]).filter(Boolean))];
  const [entityFacts,teamFacts,competitionFacts]=await Promise.all([
    db.query(`SELECT f.public_id,f.status,f.kickoff,f.updated_at,f.home_score,f.away_score,c.slug AS cluster,ht.name AS home,at.name AS away
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      WHERE f.public_id=ANY($1::text[])`,[observedIds]),
    db.query('SELECT public_id,name FROM teams WHERE public_id=ANY($1::text[])',[observedIds]),
    db.query('SELECT slug,display_name_pt_br AS name FROM competitions WHERE enabled'),
  ]);
  // Additive migration absence is safe for preview/rolling deployments, but never permits actions.
  let active:Row[]=[],actions:Row[]=[],migrationReady=true;
  try{[active,actions]=await Promise.all([
    db.query("SELECT page,control_page,state,frozen_until FROM seo_growth_experiments WHERE state IN('OBSERVING','FROZEN')").then(r=>r.rows),
    db.query("SELECT url,max(created_at) AS last_changed FROM seo_growth_actions WHERE outcome='APPLIED' GROUP BY url").then(r=>r.rows),
  ]);}catch{migrationReady=false;}
  const pageRows=groups(daily.rows.filter(r=>r.dimension==='PAGE'),'key'),detailRows=groups(details.rows,'page');
  const coverageDays=daily.rows.filter(r=>r.dimension==='TOTAL'&&String(r.day)>=w.current28.from).length;
  const pages:GrowthPage[]=[...new Set([...pageRows.keys(),...facts.rows.map(r=>String(r.url))])].map(url=>{
    const all=pageRows.get(url)??[],managed=facts.rows.find(f=>f.url===url),detail=detailRows.get(url)??[];
    const type=pageType(url),id=/-([a-f0-9]{16})$/.exec(url)?.[1];
    const r=managed??(type==='FIXTURE'?entityFacts.rows.find(f=>f.public_id===id):undefined);
    const team=type==='TEAM'?teamFacts.rows.find(t=>t.public_id===id):undefined;
    const competition=type==='COMPETITION'?competitionFacts.rows.find(c=>url.endsWith('/'+c.slug)||new URL(url).searchParams.get('competition')===c.slug):undefined;
    const current=all.filter(d=>String(d.day)>=w.current28.from),previous=all.filter(d=>String(d.day)<w.current28.from);
    const aggregate=(dimension:string)=>[...groups(detail.filter(d=>d.dimension===dimension&&String(d.day)>=w.current28.from),'key')].map(([key,rows])=>({key,...growthMetric(rows)})).sort((a,b)=>b.impressions-a.impressions);
    const action=actions.find(a=>a.url===url),changed=[iso(r?.metadata_changed_at),iso(r?.content_changed_at),iso(action?.last_changed)].filter((x):x is string=>!!x).sort().at(-1)??null;
    let path='';try{const u=new URL(url);if(u.origin==='https://livasports.com')path=u.pathname;}catch{}
    return {url,type,locale:path.split('/')[1]??'',entityId:r?.public_id?String(r.public_id):id??null,
      cluster:r?.cluster?String(r.cluster):competition?String(competition.slug):team?`team:${team.public_id}`:null,label:r?`${r.home} x ${r.away}`:String(team?.name??competition?.name??''),
      current:growthMetric(current),previous:growthMetric(previous),coverageDays,queries:aggregate('QUERY').map(q=>({query:q.key,impressions:q.impressions,clicks:q.clicks,position:q.position,days:q.days})),
      countries:aggregate('COUNTRY'),devices:aggregate('DEVICE'),publishedAt:iso(r?.published_at),lastChangedAt:changed,firstObserved:all[0]?String(all[0].day):null,
      managed:managed?.state==='PUBLISHED',status:r?.status?String(r.status):null,kickoff:iso(r?.kickoff),hasResult:r?.home_score!=null&&r?.away_score!=null,technicalHealthy:r?.healthy===true,
      fresh:!!r&&(r.status==='FINISHED'||now.getTime()-Date.parse(String(r.updated_at))<7*86400000),
      activeExperiment:legacy.rows.some(e=>e.page===url)||active.some(e=>e.page===url||e.control_page===url),
      title:r?.title?String(r.title):null,description:r?.description?String(r.description):null,optimizationMetadata:r?.optimization_metadata??null,linkBoost:Number(r?.link_boost??0)};
  });
  const totals=daily.rows.filter(r=>r.dimension==='TOTAL'&&String(r.day)>=w.current28.from);
  const last=sync.rows[0],connected=last?.state==='CONNECTED'&&!!last.finished_at&&now.getTime()-Date.parse(String(last.finished_at))<36*3600000;
  const complete=last?.truncated===false&&String(last.from_day)<=w.current28.from&&String(last.to_day)>=w.current28.to&&['QUERY','COUNTRY','DEVICE'].every(d=>breakdowns.rows.some(r=>r.dimension===d&&r.state==='SUCCEEDED'&&String(r.from_day)<=w.current28.from&&String(r.to_day)>=w.current28.to&&now.getTime()-Date.parse(String(r.captured_at))<36*3600000));
  const safety=optimizationSafety({connected,complete,latestDay:totals.at(-1)?String(totals.at(-1)!.day):null,expectedDay:w.latestComplete,observedDays:totals.length,
    valid:pages.every(p=>metricValid(p.current)&&metricValid(p.previous))&&daily.rows.every(r=>metricValid(growthMetric([r])))&&details.rows.every(r=>metricValid(growthMetric([r]))),dailyImpressions:totals.map(r=>Number(r.impressions))});
  if(!migrationReady){safety.mode='OBSERVE_ONLY';safety.reasons.push('MIGRATION_NOT_READY');}
  const metrics=(from:string)=>{const rows=daily.rows.filter(r=>String(r.day)>=from),queries=rows.filter(r=>r.dimension==='QUERY'),pageGroups=groups(rows.filter(r=>r.dimension==='PAGE'),'key'),queryGroups=groups(queries,'key');return {
    ...growthMetric(rows.filter(r=>r.dimension==='TOTAL')),
    nonBrandClicks:queries.filter(r=>classifyBrand(String(r.key))==='NON_BRAND').reduce((s,r)=>s+Number(r.clicks),0),
    unknownQueryClicks:queries.filter(r=>classifyBrand(String(r.key))==='UNKNOWN').reduce((s,r)=>s+Number(r.clicks),0),
    top10Pages:[...pageGroups.values()].filter(r=>growthMetric(r).position>0&&growthMetric(r).position<=10).length,
    top20Pages:[...pageGroups.values()].filter(r=>growthMetric(r).position>0&&growthMetric(r).position<=20).length,
    top10Queries:[...queryGroups.values()].filter(r=>growthMetric(r).position>0&&growthMetric(r).position<=10).length,
    top20Queries:[...queryGroups.values()].filter(r=>growthMetric(r).position>0&&growthMetric(r).position<=20).length,
  };};
  const previousComplete=daily.rows.filter(r=>r.dimension==='TOTAL'&&String(r.day)<w.current28.from).length>=28;
  const entrants=(position:number)=>previousComplete?pages.filter(p=>p.current.position>0&&p.current.position<=position&&p.previous.position>position&&p.previous.days>=7).length:null;
  return {config:SEO_OPTIMIZATION,from:w.current28.from,to:w.current28.to,property,mode:safety.mode,reasons:safety.reasons,migrationReady,top10Entrants:entrants(10),top20Entrants:entrants(20),
    observedDays:totals.length,metrics7:metrics(w.current7.from),metrics28:metrics(w.current28.from),pages,
    opportunities:detectGrowthOpportunities(pages,now),providerRequests:0};
}
export type GrowthEvidence=Awaited<ReturnType<typeof readGrowthEvidence>>;
