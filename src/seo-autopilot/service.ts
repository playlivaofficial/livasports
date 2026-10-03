import {CORE_GEOS} from '@/config/geo';
import {languageTags} from '@/localization/interface';
import 'server-only';
import type {DatabaseClient} from '@/database/client';
import {isMatchInSitemapWindow,siteOrigin} from '@/seo/policy';
import {SEO_AUTOPILOT as config} from './config';
import {acquireSeoRun,readSeoInventory,recordSeoDecision} from './repository';
import {contentHash,seoInternalLinkEngine,seoOpportunityScore,seoPublishGate,type PublishState} from './policy';
import {crawlSeoUrl,type HtmlAudit} from './crawl';
import {maintainSeoSitemaps} from './sitemaps';
import {runGrowthOptimization} from './optimization';
import type {GscHealth} from '@/seo/gsc-health';

export async function runSeoAutopilot(db:DatabaseClient,options:{now?:Date;fetcher?:typeof fetch;maintainSitemaps?:boolean}={}){
  const now=options.now??new Date(),started=Date.now(),day=now.toISOString().slice(0,10);
  if(!config.enabled)return {state:'DISABLED',providerRequests:0};
  const runId=await acquireSeoRun(db,now);if(!runId)return {state:'ALREADY_RUNNING',providerRequests:0};
  const outcomes:Array<{url:string;score:number;state:string;reasons:string[]}>=[];
  const audits=new Map<string,Promise<HtmlAudit|null>>();
  const audit=(url:string)=>{let promise=audits.get(url);if(!promise){promise=crawlSeoUrl(url,options.fetcher).catch(()=>null);audits.set(url,promise);}return promise;};
  try{
    // Existing 05:40 seo-refresh ingests final GSC days before this 07:10 job. Never duplicate ingestion here.
    // Failed optimization cannot stop base publishing/technical/sitemap maintenance.
    const feedback=await runGrowthOptimization(db,now,options.fetcher).catch(()=>({mode:'OBSERVE_ONLY',reasons:['OPTIMIZATION_FAILED'],applied:0,providerRequests:0}));
    const byGeo=await Promise.all(CORE_GEOS.map(geo=>readSeoInventory(db,now,geo)));
    const candidates=byGeo.flat();
    // A release-day BR publication still consumes the inherited global daily cap.
    const used=(await db.query(`SELECT count(*)::int AS n FROM seo_all_pages WHERE published_at>=$1::date AND published_at<$1::date+interval '1 day'`,[day])).rows[0];
    const refreshed=Number((await db.query(`SELECT count(*)::int AS n FROM seo_autopilot_decisions WHERE created_at>=$1::date AND created_at<$1::date+interval '1 day'
      AND previous_state->>'hash' IS DISTINCT FROM new_state->>'hash' AND new_state ? 'hash'`,[day])).rows[0].n);
    let remaining=config.maxNewIndexablePagesPerDay-Number(used.n),refreshes=refreshed;
    const oldest=(a:typeof candidates[number],b:typeof candidates[number])=>Math.floor((a.row.checked_at?new Date(String(a.row.checked_at)).getTime():0)/86400000)-Math.floor((b.row.checked_at?new Date(String(b.row.checked_at)).getTime():0)/86400000)||(b.score.total+Number(b.resourceAdjustment??0))-(a.score.total+Number(a.resourceAdjustment??0));
    // Reserve maintenance slots so new inventory cannot starve already-published lifecycle updates.
    const linkRepair=(c:typeof candidates[number])=>['["INSUFFICIENT_INBOUND_LINKS"]','["DAILY_PUBLICATION_CAP"]'].includes(JSON.stringify(c.row.previous_reasons));
    const queues=byGeo.map(rows=>[...rows.filter(c=>c.row.published_at).sort(oldest).slice(0,2),...rows.filter(c=>!c.row.published_at)
      .sort((a,b)=>Number(linkRepair(b))-Number(linkRepair(a))||oldest(a,b))]);
    // Round-robin resource allocation: one large market cannot starve a smaller GEO.
    const queue:typeof candidates=[];
    for(let depth=0;queue.length<config.maxCandidatesPerRun&&queues.some(rows=>depth<rows.length);depth++){
      for(const rows of queues){if(rows[depth]&&queue.length<config.maxCandidatesPerRun)queue.push(rows[depth]);}
    }
    for(const candidate of queue.slice(0,config.maxCandidatesPerRun)){
      if(Date.now()-started>200_000)break;
      const {signals:f,evidence,row,destinationUrl:url,locale}=candidate;
      const links=seoInternalLinkEngine(f,candidates.filter(c=>c.locale===locale).map(c=>({signals:c.signals,score:c.score.total})),locale);
      let state:PublishState='PRODUCT_ONLY',reasons=['BELOW_OPPORTUNITY_THRESHOLD'];
      let html:HtmlAudit|null=null;
      if(candidate.score.total>=config.tierBThreshold){
        html=await audit(url);
        const sources=await Promise.all(links.filter(l=>l.relation!=='FIXTURE').map(l=>audit(siteOrigin+l.href)));
        evidence.inboundSources=sources.filter(s=>s?.status===200&&s.indexFollow&&s.links.includes(url)).length;
        if(html&&sources.some(s=>s!==null&&s.status>=400))html.problems.push('BROKEN_INTERNAL_LINK');
        const gate=seoPublishGate({score:candidate.score.total,uniqueSignals:evidence.uniqueSignals.length,fresh:evidence.fresh,
          quality:!!html&&html.problems.length===0,duplicateRisk:'LOW',canonicalValid:html?.canonical===url,
          urlValid:url.startsWith(`${siteOrigin}/${locale}/partido/`)&&/-[a-f0-9]{16}$/.test(url),httpStatus:html?.status??0,indexFollow:html?.indexFollow??false,
          internalLinkSources:evidence.inboundSources,sitemapEligible:isMatchInSitemapWindow(f.kickoff,now)||row.retain_indexable===true,
          structuredDataValid:html?.structuredDataValid??false,localeValid:html?.alternates.some(a=>a.lang===languageTags[locale]&&a.href===url)??false,
          factual:true,placeholders:/^(TBD|Unknown|Team \d+)$/i.test(f.home.name)||/^(TBD|Unknown|Team \d+)$/i.test(f.away.name),
          emptyModules:false,serverRendered:(html?.primaryLength??0)>=150,englishLeak:false});
        state=gate.state;reasons=gate.reasons;
        if(!['SCHEDULED','FINISHED'].includes(f.status)){state='RETRYABLE_DATA_GAP';reasons=['UNSTABLE_FIXTURE_STATE'];}
        if(state==='PUBLISHED'&&!row.published_at&&remaining<=0){state='RETRYABLE_DATA_GAP';reasons=['DAILY_PUBLICATION_CAP'];}
      }
      const score=seoOpportunityScore(f,evidence,now);
      const hash=contentHash({publicId:f.publicId,home:f.home.name,away:f.away.name,competition:f.competitionName,kickoff:f.kickoff,status:f.status,
        venue:f.venue,standings:f.standings,results:row.results,homeScore:row.home_score,awayScore:row.away_score});
      if(row.previous_hash&&row.previous_hash!==hash&&refreshes>=config.maxAutomaticContentRefreshesPerDay){
        outcomes.push({url,score:score.total,state:'DEFERRED',reasons:['CONTENT_REFRESH_CAP']});continue;
      }
      await db.transaction(async tx=>{
        await tx.query(`INSERT INTO seo_geo_pages(fixture_id,url,score,tier,state,evidence,reasons,links,content_hash,content_changed_at,published_at,checked_at,config_version,locale)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,CASE WHEN $5='PUBLISHED' THEN $10::timestamptz END,$10,$11,$12)
          ON CONFLICT(fixture_id,locale) DO UPDATE SET url=EXCLUDED.url,score=$3,tier=$4,state=$5,evidence=$6::jsonb,reasons=$7::jsonb,links=$8::jsonb,
          content_changed_at=CASE WHEN seo_geo_pages.content_hash<>$9 OR (seo_geo_pages.state<>'PUBLISHED' AND $5='PUBLISHED') THEN $10 ELSE seo_geo_pages.content_changed_at END,
          content_hash=$9,checked_at=$10,published_at=COALESCE(seo_geo_pages.published_at,CASE WHEN $5='PUBLISHED' THEN $10::timestamptz END),config_version=$11`,
          [f.fixtureId,url,score.total,score.tier,state,JSON.stringify({...evidence,score}),JSON.stringify(reasons),JSON.stringify(links),hash,now,config.version,locale]);
        // Only proven managed URLs retain indexing beyond the legacy age window. No mass resurrection.
        if(state==='PUBLISHED')await tx.query('UPDATE seo_geo_pages SET retain_indexable=$2 WHERE fixture_id=$1 AND locale=$3',
          [f.fixtureId,evidence.clicks>0||evidence.impressions>=30,locale]);
        await recordSeoDecision(tx,runId,url,state,reasons.join(', '),{state:row.previous_state??'EXISTING_PRODUCT',hash:row.previous_hash??null},
          {state,hash,score},evidence);
        if(reasons.length===1&&reasons[0]==='INSUFFICIENT_INBOUND_LINKS')await recordSeoDecision(tx,runId,url,'INTERNAL_LINK_REPAIR',
          'All other gates passed. Add contextual links from existing team/competition hubs; verify rendered anchors before SEO publication.',
          {inbound:evidence.inboundSources},{state:'LINKS_STAGED_PRODUCT_ONLY'},evidence);
      });
      if(state==='PUBLISHED'&&!row.published_at)remaining--;
      // V2.1 owns automatic metadata changes exclusively: high confidence, caps, control and cooldown.
      // Existing stored metadata remains intact; factual content still uses the Match Center read model.
      if(row.previous_hash!==hash)refreshes++;
      outcomes.push({url,score:score.total,state,reasons});
    }
    for(const [url,promise] of audits){const a=await promise;if(!a){
      await db.query(`INSERT INTO seo_autopilot_technical(url,status,problems,audit,checked_at) VALUES($1,0,'["FETCH_FAILED"]'::jsonb,'{}'::jsonb,$2)
        ON CONFLICT(url) DO UPDATE SET status=0,problems='["FETCH_FAILED"]'::jsonb,audit='{}'::jsonb,checked_at=$2`,[url,now]);continue;}
      const sameTitle=[...audits.keys()].filter(other=>other!==url);
      const duplicate=await Promise.all(sameTitle.map(u=>audits.get(u)!));
      if(duplicate.some(other=>other?.title===a.title&&other?.url!==url))a.problems.push('DUPLICATE_TITLE');
      await db.query(`INSERT INTO seo_autopilot_technical(url,status,problems,audit,checked_at) VALUES($1,$2,$3::jsonb,$4::jsonb,$5)
        ON CONFLICT(url) DO UPDATE SET status=$2,problems=$3::jsonb,audit=$4::jsonb,checked_at=$5`,[url,a.status,JSON.stringify(a.problems),JSON.stringify(a),now]);
    }
    let gscHealth:GscHealth|null=null;
    // Start the lease at maintenance time, not at the potentially much earlier SEO run start.
    const sitemaps=options.maintainSitemaps===false?[]:await maintainSeoSitemaps(db,new Date(now.getTime()+Date.now()-started),options.fetcher,health=>{gscHealth=health;},
      {budgetMs:Math.max(1000,275_000-(Date.now()-started))}).catch(()=>{
        console.error(JSON.stringify({event:'gsc-sitemap',result:'UNKNOWN_ERROR',stage:'PERSIST',providerRequests:0}));
        return [{path:'/sitemap.xml',state:'MAINTENANCE_UNAVAILABLE'},{path:'/sports-sitemaps.xml',state:'MAINTENANCE_UNAVAILABLE'}];
      });
    const summary={state:'SUCCEEDED',runId,considered:candidates.length,evaluated:outcomes.length,published:outcomes.filter(o=>o.state==='PUBLISHED').length,
      outcomes,feedback,sitemaps,gscHealth,pageCrawlRequests:audits.size,providerRequests:0};
    await db.query("UPDATE seo_autopilot_runs SET state='SUCCEEDED',finished_at=now(),summary=$2::jsonb WHERE id=$1",[runId,JSON.stringify(summary)]);
    return summary;
  }catch{
    await db.query("UPDATE seo_autopilot_runs SET state='FAILED',finished_at=now(),summary=$2::jsonb WHERE id=$1",[runId,JSON.stringify({error:'SEO_AUTOPILOT_FAILED',outcomes,providerRequests:0})]);
    return {state:'FAILED',runId,error:'SEO_AUTOPILOT_FAILED',providerRequests:0};
  }
}
