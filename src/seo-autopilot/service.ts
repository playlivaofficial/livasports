import 'server-only';
import type {DatabaseClient} from '@/database/client';
import {isMatchInSitemapWindow,siteOrigin} from '@/seo/policy';
import {SEO_AUTOPILOT as config} from './config';
import {acquireSeoRun,readSeoInventory,recordSeoDecision} from './repository';
import {contentHash,seoInternalLinkEngine,seoOpportunityScore,seoPublishGate,type PublishState} from './policy';
import {crawlSeoUrl,type HtmlAudit} from './crawl';
import {maintainSeoSitemaps} from './sitemaps';
import {optimizeSeoClusters} from './feedback';
import {PostgresMatchCenterRepository} from '@/match-center/repository';
import {factualMatchContent} from './content';
import type {MatchCenterView} from '@/match-center/types';

export async function runSeoAutopilot(db:DatabaseClient,options:{now?:Date;fetcher?:typeof fetch;maintainSitemaps?:boolean}={}){
  const now=options.now??new Date(),started=Date.now(),day=now.toISOString().slice(0,10);
  if(!config.enabled)return {state:'DISABLED',providerRequests:0};
  const runId=await acquireSeoRun(db,now);if(!runId)return {state:'ALREADY_RUNNING',providerRequests:0};
  const outcomes:Array<{url:string;score:number;state:string;reasons:string[]}>=[];
  const audits=new Map<string,Promise<HtmlAudit|null>>();
  const audit=(url:string)=>{let promise=audits.get(url);if(!promise){promise=crawlSeoUrl(url,options.fetcher).catch(()=>null);audits.set(url,promise);}return promise;};
  try{
    const feedback=await optimizeSeoClusters(db,runId,now);
    const candidates=await readSeoInventory(db,now);
    const used=(await db.query(`SELECT count(*)::int AS n FROM seo_autopilot_pages WHERE published_at>=$1::date AND published_at<$1::date+interval '1 day'`,[day])).rows[0];
    const titleUsed=Number((await db.query(`SELECT count(*)::int AS n FROM seo_autopilot_decisions WHERE action='FACTUAL_METADATA' AND created_at>=$1::date AND created_at<$1::date+interval '1 day'`,[day])).rows[0].n);
    const refreshed=Number((await db.query(`SELECT count(*)::int AS n FROM seo_autopilot_decisions WHERE created_at>=$1::date AND created_at<$1::date+interval '1 day'
      AND previous_state->>'hash' IS DISTINCT FROM new_state->>'hash' AND new_state ? 'hash'`,[day])).rows[0].n);
    let remaining=config.maxNewIndexablePagesPerDay-Number(used.n),refreshes=refreshed,titlesRemaining=config.maxAutomaticTitleChangesPerDay-titleUsed;
    const oldest=(a:typeof candidates[number],b:typeof candidates[number])=>(a.row.checked_at?new Date(String(a.row.checked_at)).getTime():0)-(b.row.checked_at?new Date(String(b.row.checked_at)).getTime():0)||b.score.total-a.score.total;
    // Reserve maintenance slots so new inventory cannot starve already-published lifecycle updates.
    const linkRepair=(c:typeof candidates[number])=>['["INSUFFICIENT_INBOUND_LINKS"]','["DAILY_PUBLICATION_CAP"]'].includes(JSON.stringify(c.row.previous_reasons));
    const queue=[...candidates.filter(c=>c.row.published_at).sort(oldest).slice(0,4),...candidates.filter(c=>!c.row.published_at)
      .sort((a,b)=>Number(linkRepair(b))-Number(linkRepair(a))||oldest(a,b)).slice(0,8)];
    for(const candidate of queue.slice(0,config.maxCandidatesPerRun)){
      if(Date.now()-started>200_000)break;
      const {signals:f,evidence,row,destinationUrl:url}=candidate;
      const links=seoInternalLinkEngine(f,candidates.map(c=>({signals:c.signals,score:c.score.total})));
      let state:PublishState='PRODUCT_ONLY',reasons=['BELOW_OPPORTUNITY_THRESHOLD'];
      let html:HtmlAudit|null=null;
      if(candidate.score.total>=config.tierBThreshold){
        html=await audit(url);
        const sources=await Promise.all(links.filter(l=>l.relation!=='FIXTURE').map(l=>audit(siteOrigin+l.href)));
        evidence.inboundSources=sources.filter(s=>s?.status===200&&s.indexFollow&&s.links.includes(url)).length;
        if(html&&sources.some(s=>s!==null&&s.status>=400))html.problems.push('BROKEN_INTERNAL_LINK');
        const gate=seoPublishGate({score:candidate.score.total,uniqueSignals:evidence.uniqueSignals.length,fresh:evidence.fresh,
          quality:!!html&&html.problems.length===0,duplicateRisk:'LOW',canonicalValid:html?.canonical===url,
          urlValid:/^https:\/\/livasports.com\/br\/jogo\/.+-[a-f0-9]{16}$/.test(url),httpStatus:html?.status??0,indexFollow:html?.indexFollow??false,
          internalLinkSources:evidence.inboundSources,sitemapEligible:isMatchInSitemapWindow(f.kickoff,now)||row.retain_indexable===true,
          structuredDataValid:html?.structuredDataValid??false,localeValid:html?.alternates.some(a=>a.lang==='pt-BR'&&a.href===url)??false,
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
        await tx.query(`INSERT INTO seo_autopilot_pages(fixture_id,url,score,tier,state,evidence,reasons,links,content_hash,content_changed_at,published_at,checked_at,config_version)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,CASE WHEN $5='PUBLISHED' THEN $10::timestamptz END,$10,$11)
          ON CONFLICT(fixture_id) DO UPDATE SET score=$3,tier=$4,state=$5,evidence=$6::jsonb,reasons=$7::jsonb,links=$8::jsonb,
          content_changed_at=CASE WHEN seo_autopilot_pages.content_hash<>$9 OR (seo_autopilot_pages.state<>'PUBLISHED' AND $5='PUBLISHED') THEN $10 ELSE seo_autopilot_pages.content_changed_at END,
          content_hash=$9,checked_at=$10,published_at=COALESCE(seo_autopilot_pages.published_at,CASE WHEN $5='PUBLISHED' THEN $10::timestamptz END),config_version=$11`,
          [f.fixtureId,url,score.total,score.tier,state,JSON.stringify({...evidence,score}),JSON.stringify(reasons),JSON.stringify(links),hash,now,config.version]);
        // Only proven managed URLs retain indexing beyond the legacy age window. No mass resurrection.
        if(state==='PUBLISHED')await tx.query('UPDATE seo_autopilot_pages SET retain_indexable=$2 WHERE fixture_id=$1',
          [f.fixtureId,evidence.clicks>0||evidence.impressions>=30]);
        await recordSeoDecision(tx,runId,url,state,reasons.join(', '),{state:row.previous_state??'EXISTING_PRODUCT',hash:row.previous_hash??null},
          {state,hash,score},evidence);
        if(reasons.length===1&&reasons[0]==='INSUFFICIENT_INBOUND_LINKS')await recordSeoDecision(tx,runId,url,'INTERNAL_LINK_REPAIR',
          'All other gates passed. Add contextual links from existing team/competition hubs; verify rendered anchors before SEO publication.',
          {inbound:evidence.inboundSources},{state:'LINKS_STAGED_PRODUCT_ONLY'},evidence);
      });
      if(state==='PUBLISHED'&&!row.published_at)remaining--;
      if(state==='PUBLISHED'&&titlesRemaining>0&&!row.previous_title&&!row.has_experiment&&(score.tier==='A'||evidence.impressions>=100)){
        const repository=new PostgresMatchCenterRepository(db),header=await repository.header(f.publicId,'br');
        if(header){
          const form=await repository.form(header);
          const meta={providerUpdatedAt:null,lastSuccessfulRefreshAt:null,snapshotAt:null};
          const data:Pick<MatchCenterView,'header'|'form'|'standings'|'statistics'>={header,form:{...meta,state:'AVAILABLE',data:form},standings:{...meta,state:'NO_DATA_IN_WINDOW',data:[]},statistics:{...meta,state:'NO_DATA_IN_WINDOW',data:[]}};
          const metadata=factualMatchContent(data);
          await db.transaction(async tx=>{
            await tx.query('UPDATE seo_autopilot_pages SET title=$2,description=$3,metadata_changed_at=$4,content_changed_at=$4 WHERE fixture_id=$1',[f.fixtureId,metadata.title,metadata.description,now]);
            await recordSeoDecision(tx,runId,url,'FACTUAL_METADATA','Source-backed existing-page title; no keyword variant. Existing experiments excluded.',
              {title:html?.title??null},{title:metadata.title,description:metadata.description,template:'FACTUAL_PT_BR_V1'},evidence);
          });titlesRemaining--;
        }
      }
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
    const sitemaps=options.maintainSitemaps===false?[]:await maintainSeoSitemaps(db,now,options.fetcher);
    const summary={state:'SUCCEEDED',runId,considered:candidates.length,evaluated:outcomes.length,published:outcomes.filter(o=>o.state==='PUBLISHED').length,
      outcomes,feedback,sitemaps,pageCrawlRequests:audits.size,providerRequests:0};
    await db.query("UPDATE seo_autopilot_runs SET state='SUCCEEDED',finished_at=now(),summary=$2::jsonb WHERE id=$1",[runId,JSON.stringify(summary)]);
    return summary;
  }catch{
    await db.query("UPDATE seo_autopilot_runs SET state='FAILED',finished_at=now(),summary=$2::jsonb WHERE id=$1",[runId,JSON.stringify({error:'SEO_AUTOPILOT_FAILED',outcomes,providerRequests:0})]);
    return {state:'FAILED',runId,error:'SEO_AUTOPILOT_FAILED',providerRequests:0};
  }
}
