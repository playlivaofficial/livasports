/** Explicit release operations, never used by public navigation. No provider calls or credential output. */
import {readFile,writeFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {PostgresMatchCenterRepository} from '../src/match-center/repository';
import {PostgresProfileRepository} from '../src/profiles/repository';
import {CTR_MATCHES,CTR_TEAMS,CTR_EXPERIMENT_KEY,ctrMatchMetadata,ctrTeamMetadata} from '../src/seo/ctr-variants';
import {matchPath,teamPath} from '../src/localization/interface';
import {registerExperiment,activateExperiment,readExperiments,type ExperimentRegistration} from '../src/seo/experiments';
import {measurePage,ingestPageBreakdowns} from '../src/seo/page-breakdowns';
import {addSearchDays} from '../src/seo/experiment-windows';
import {isFinishedMatchDecayed} from '../src/seo/policy';
import {readCtrOpportunities} from '../src/seo/ctr-report';
import {readSeoSearchReport,readSeoReport} from '../src/seo/report';
import {ingestGscSearchAnalytics} from '../src/seo/gsc-ingest';

const url=databaseUrl();if(!url)throw Error('DATABASE_NOT_CONFIGURED');
const db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:30_000});
async function main(){
  if(process.argv.includes('--migrate')){
    const filename='049_seo_ctr_experiments.sql',sql=await readFile(`db/migrations/${filename}`,'utf8');
    const result=await db.transaction(async tx=>{
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('seo-ctr-migration',0))");
      if((await tx.query('SELECT filename FROM schema_migrations WHERE filename=$1',[filename])).rows.length)return 'ALREADY_APPLIED';
      await tx.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
      await tx.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);return 'APPLIED';
    });console.log(JSON.stringify({migration:filename,result}));
  }
  const evidence=JSON.parse(await readFile('output/seo-ctr/gsc-joined-before.json','utf8'));
  if(process.argv.includes('--verify-storage')){
    const before=(await db.query('SELECT count(*)::int n FROM seo_page_breakdowns')).rows[0].n;
    try{await db.transaction(async tx=>{
      const fetcher=(async(_url:unknown,init?:RequestInit)=>{
        const query=JSON.parse(String(init?.body));
        const report=evidence.reports.find((r:{dimension:string})=>r.dimension===query.dimensions[2]);
        if(!report)throw Error('SAVED_REPORT_MISSING');return Response.json({rows:report.rows});
      }) as typeof fetch;
      for(let run=0;run<2;run++){
        const results=await ingestPageBreakdowns(tx,'unused-offline',evidence.property,evidence.windows.current28.from,evidence.windows.current28.to,fetcher);
        if(results.some(r=>r.state!=='SUCCEEDED'))throw Error('REPLAY_SQL_FAILED');
        if((await tx.query('SELECT count(*)::int n FROM seo_page_breakdowns')).rows[0].n!==before)throw Error('REPLAY_COUNT_CHANGED');
      }
      const pageReport=evidence.reports.find((r:{dimension:string})=>r.dimension==='page');
      const offline=(async(url:unknown)=>String(url).includes('oauth2.googleapis.com')?Response.json({access_token:'unused-offline'})
        :String(url).includes('searchAnalytics')?Response.json({rows:pageReport.rows}):Response.json({sitemap:[]})) as typeof fetch;
      for(let run=0;run<2;run++){
        const result=await ingestGscSearchAnalytics(tx,{now:new Date(evidence.capturedAt),fetcher:offline,dimensions:['PAGE'],
          env:{GSC_PROPERTY:evidence.property,GSC_CLIENT_ID:'offline-test',GSC_CLIENT_SECRET:'offline-test',GSC_REFRESH_TOKEN:'offline-test'}});
        if(result.state!=='CONNECTED')throw Error('PAGE_REPLAY_FAILED');
        const count=(await tx.query(`SELECT count(*)::int n FROM seo_search_daily WHERE property=$1 AND dimension='PAGE' AND day BETWEEN $2 AND $3`,
          [evidence.property,evidence.windows.current28.from,evidence.windows.current28.to])).rows[0].n;
        if(count!==pageReport.rows.length)throw Error('PAGE_REPLAY_COUNT_MISMATCH');
      }
      throw Error('VERIFIED_ROLLBACK');
    });}catch(error){if(!(error instanceof Error)||error.message!=='VERIFIED_ROLLBACK')throw error;}
    console.log(JSON.stringify({storageReplay:'PASS',runs:2,rolledBack:true,providerRequests:0,gscRequests:0,rows:before}));
  }
  if(process.argv.includes('--seed')){
    if(evidence.property!=='sc-domain:livasports.com'||evidence.reports.some((r:{truncated:boolean})=>r.truncated))throw Error('INCOMPLETE_MEASUREMENT');
    await db.transaction(async tx=>{
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('seo-ctr-baseline',0))");
      for(const report of evidence.reports as Array<{dimension:string;rows:Array<{keys:string[];clicks:number;impressions:number;ctr:number;position:number}>}>){
        const records=report.rows.map(r=>({day:r.keys[0],page:r.keys[1],key:r.keys[2]??'',clicks:r.clicks,impressions:r.impressions,ctr:r.ctr,position:r.position}));
        if(report.dimension==='page'){
          await tx.query(`INSERT INTO seo_search_daily(property,day,dimension,key,clicks,impressions,ctr,position)
            SELECT $1,r.day::date,'PAGE',r.page,r.clicks,r.impressions,r.ctr,r.position FROM jsonb_to_recordset($2::jsonb)
            AS r(day text,page text,clicks integer,impressions integer,ctr double precision,position double precision)
            WHERE true ON CONFLICT(property,day,dimension,key) DO UPDATE SET clicks=excluded.clicks,impressions=excluded.impressions,ctr=excluded.ctr,position=excluded.position`,[evidence.property,JSON.stringify(records)]);
        }else{
          await tx.query(`INSERT INTO seo_page_breakdowns(property,day,page,dimension,key,clicks,impressions,ctr,position)
            SELECT $1,r.day::date,r.page,$2,r.key,r.clicks,r.impressions,r.ctr,r.position FROM jsonb_to_recordset($3::jsonb)
            AS r(day text,page text,key text,clicks integer,impressions integer,ctr double precision,position double precision)
            WHERE true ON CONFLICT(property,day,page,dimension,key) DO UPDATE SET clicks=excluded.clicks,impressions=excluded.impressions,ctr=excluded.ctr,position=excluded.position`,
            [evidence.property,report.dimension.toUpperCase(),JSON.stringify(records)]);
          await tx.query(`INSERT INTO seo_breakdown_syncs(property,dimension,from_day,to_day,state,row_count,captured_at)
            SELECT $1,$2,$3,$4,'SUCCEEDED',$5,$6 WHERE NOT EXISTS(SELECT 1 FROM seo_breakdown_syncs WHERE property=$1 AND dimension=$2 AND captured_at=$6)`,
            [evidence.property,report.dimension.toUpperCase(),evidence.windows.current28.from,evidence.windows.current28.to,records.length,evidence.capturedAt]);
        }
      }
      // Backfill window metadata only for the just-verified full production GSC sync, not old/failed runs.
      await tx.query(`UPDATE seo_gsc_syncs SET from_day=$2,to_day=$3 WHERE id=(SELECT id FROM seo_gsc_syncs
        WHERE property=$1 AND state='CONNECTED' AND NOT truncated AND finished_at BETWEEN $4::timestamptz-interval '10 minutes' AND $4::timestamptz
        ORDER BY finished_at DESC LIMIT 1)`,[evidence.property,evidence.windows.current28.from,evidence.windows.current28.to,evidence.capturedAt]);
    });
    console.log(JSON.stringify({seed:'COMPLETE',sportsProviderRequests:0,rows:(await db.query('SELECT count(*)::int AS n FROM seo_page_breakdowns')).rows[0].n}));
  }
  if(process.argv.includes('--register')){
    const matchRepo=new PostgresMatchCenterRepository(db),teamRepo=new PostgresProfileRepository(db),selected=[];
    for(const entry of CTR_MATCHES){
      const header=await matchRepo.header(entry.publicId,entry.locale);if(!header||isFinishedMatchDecayed(header.status,header.kickoff))throw Error('COHORT_NOT_INDEXABLE');
      const variant=ctrMatchMetadata(entry.locale,{header,lineups:{data:await matchRepo.lineups(header.id)} as never,standings:{data:await matchRepo.standings(header)} as never});
      if(!variant)throw Error('COHORT_MODULE_MISSING');
      selected.push({page:`https://livasports.com${matchPath(entry.locale,entry.publicId,header.home.name,header.away.name)}`,locale:entry.locale,...variant});
    }
    for(const id of CTR_TEAMS){const profile=await teamRepo.team(id,'br');if(!profile?.indexable)throw Error('TEAM_NOT_INDEXABLE');
      selected.push({page:`https://livasports.com${teamPath('br',id,profile.name)}`,locale:'br' as const,...ctrTeamMetadata('br',id,profile.name)!});}
    for(const selectedPage of selected){
      const res=await fetch(selectedPage.page,{redirect:'manual'});if(res.status!==200)throw Error('BASELINE_PAGE_UNAVAILABLE');const $=load(await res.text());
      if($('link[rel="canonical"]').attr('href')!==selectedPage.page||/noindex/.test($('meta[name="robots"]').attr('content')??''))throw Error('BASELINE_PAGE_NOT_CANONICAL_INDEXABLE');
      const baseline={} as ExperimentRegistration['baseline'];
      for(const days of [7,14,28] as const)baseline[String(days) as '7'|'14'|'28']=await measurePage(db,evidence.property,selectedPage.page,addSearchDays(evidence.windows.latestComplete,1-days),evidence.windows.latestComplete);
      await registerExperiment(db,{key:CTR_EXPERIMENT_KEY,page:selectedPage.page,locale:selectedPage.locale,
        queryCluster:baseline['7'].topQueries.map(q=>q.key).join(' / ')||'Query not reported',
        reason:selectedPage.page.includes('vila-nova')?'Brazil-relevant team; 61 impressions, weak visibility; descriptive games/results intent, not a near-page-one claim':'Observed page/query demand; clearer factual intent and shorter title',
        oldTitle:$('title').text(),oldDescription:$('meta[name="description"]').attr('content')??'',newTitle:`${selectedPage.title} | LivaSports`,newDescription:selectedPage.description,baseline});
    }
    console.log(JSON.stringify({registered:selected.length}));
  }
  if(process.argv.includes('--activate')){
    const sha=process.argv.find(a=>a.startsWith('--sha='))?.slice(6);if(!sha)throw Error('SHA_REQUIRED');
    const health=await (await fetch('https://livasports.com/api/internal/health')).json();if(health.release?.commit!==sha)throw Error('PRODUCTION_SHA_MISMATCH');
    const cohort=(await readExperiments(db)).filter(e=>e.experimentKey===CTR_EXPERIMENT_KEY);
    if(cohort.length!==CTR_MATCHES.length+CTR_TEAMS.length)throw Error('COHORT_COUNT_MISMATCH');
    for(const e of cohort){
      const response=await fetch(e.page),$=load(await response.text());
      if(response.status!==200||$('title').text()!==e.newTitle||$('meta[name="description"]').attr('content')!==e.newDescription
        ||$('link[rel="canonical"]').attr('href')!==e.page||/noindex/.test($('meta[name="robots"]').attr('content')??''))throw Error('PRODUCTION_METADATA_MISMATCH');
    }
    const changedAt=new Date();
    await db.transaction(async tx=>{for(const e of cohort)await activateExperiment(tx,e.id,sha,changedAt);});
    console.log(JSON.stringify({activation:'VERIFIED',cohort:cohort.length}));
  }
  const result={capturedAt:new Date().toISOString(),search:await readSeoSearchReport(db),technical:await readSeoReport(db),opportunities:await readCtrOpportunities(db),experiments:await readExperiments(db)};
  await writeFile('output/seo-ctr/measurement-report.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({experiments:result.experiments.map(e=>({page:e.page,oldTitle:e.oldTitle,newTitle:e.newTitle,oldDescription:e.oldDescription,newDescription:e.newDescription,baseline:e.baseline['7'],changedAt:e.changedAt})),opportunities:result.opportunities.pages.filter(p=>p.brazilRelevant),lastSync:result.search.lastSync},null,2));
}
main().catch(error=>{console.error(JSON.stringify({error:/^[A-Z_0-9]+$/.test(error.message)?error.message:((error as {code?:string}).code??'SEO_RELEASE_OPERATION_FAILED')}));process.exitCode=1;}).finally(()=>db.close());
