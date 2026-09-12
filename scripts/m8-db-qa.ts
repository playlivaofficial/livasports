// All synthetic commercial data and schema changes in rehearsal are rolled back.
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {databaseUrl,PostgresDatabaseClient,type DatabaseClient} from '../src/database/client';
import {configureCampaign,type CampaignConfiguration} from '../src/affiliate/configuration';
import {readCampaigns,readPageContext} from '../src/affiliate/repository';
import {recordClick,recordImpression} from '../src/affiliate/analytics';
import {affiliateHealth,pruneAffiliateAnalytics} from '../src/affiliate/operations';
import {offerDependencies,resolveOffer,publicOffer} from '../src/affiliate/service';
import {outboundRequest} from '../src/affiliate/server';
import {readSlipComparison} from '../src/odds/read-repository';
import {buildSlipComparison} from '../src/slip/comparison';
import type {VerifiedOffer} from '../src/affiliate/types';
import {SLIP_SCOPE} from '../src/slip/types';
const db=new PostgresDatabaseClient(databaseUrl()!),checks:Array<{name:string;pass:boolean;detail?:unknown}>=[];
const check=(name:string,pass:boolean,detail?:unknown)=>{checks.push({name,pass,detail});if(!pass)throw Error(name);};
async function baseline(){return (await db.query(`SELECT (SELECT count(*) FROM competitions WHERE enabled) AS competitions,(SELECT count(*) FROM fixtures) AS fixtures,(SELECT count(*) FROM teams) AS teams,(SELECT count(*) FROM players) AS players,(SELECT count(*) FROM odds_current) AS quotes,(SELECT count(*) FROM odds_history) AS history,(SELECT count(*) FROM odds_provider_requests) AS odds_http,(SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+(SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports_requests,(SELECT count(*) FROM affiliate_links) AS links,(SELECT count(*) FROM affiliate_clicks) AS clicks,(SELECT count(*) FROM profile_sponsor_campaigns) AS creatives`)).rows[0];}
try{
  const before=await baseline();const applied=(await db.query("SELECT 1 FROM schema_migrations WHERE filename='012_m8_affiliate_conversion.sql'")).rowCount===1;
  try{await db.transaction(async tx=>{
    await tx.query("SET LOCAL lock_timeout='5s'");
    if(!applied)await tx.query((await readFile('db/migrations/012_m8_affiliate_conversion.sql','utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
    check('additive migration executes',true);
    const adapter:DatabaseClient={query:tx.query.bind(tx),transaction:async work=>work(tx),close:async()=>{}};
    const now=Number((await tx.query('SELECT extract(epoch FROM now())*1000 AS now')).rows[0].now);
    const config:CampaignConfiguration={bookmaker:'betsson',locale:'br',operatorCampaignId:'LOCAL_QA_ROLLBACK_ONLY',destinationUrl:'https://betsson.bet.br/?approved=qa-only%2Bvalue&keep=one&keep=two',destinationType:'SPORTSBOOK',enabled:true,validFrom:new Date(now-60000).toISOString(),validUntil:new Date(now+3600000).toISOString(),placements:['slip_bookmaker_comparison','match_odds_table','competition_inline'],domains:['betsson.bet.br'],approvalReference:'LOCAL TEST: transaction rollback only'};
    const configured=await configureCampaign(adapter,config);await configureCampaign(adapter,config);
    const campaigns=await readCampaigns(tx,'br');const campaign=campaigns.find(c=>c.id===configured.campaignId)!;
    check('configuration idempotent and query values preserved',campaigns.filter(c=>c.id===configured.campaignId).length===1&&campaign.destination===config.destinationUrl);
    const ids=(await tx.query("SELECT f.public_id FROM fixtures f WHERE f.status='SCHEDULED' AND f.kickoff>now() AND EXISTS(SELECT 1 FROM odds_current o WHERE o.fixture_id=f.id) ORDER BY f.kickoff LIMIT 10")).rows.map(r=>r.public_id);
    const selections=ids.map(fixturePublicId=>({fixturePublicId,scope:SLIP_SCOPE,market:'MATCH_WINNER' as const,outcome:'HOME' as const,line:null}));
    let count=0;const counted={query:async(sql:string,values?:readonly unknown[])=>{count++;return tx.query(sql,values);}};
    const data=await readSlipComparison(counted,ids,'br'),comparison=buildSlipComparison(selections,'br',data.fixtures,data.bookmakers,now);
    check('ten-pick comparison retains exactly two queries',count===2,{queryCount:count});
    check('Betsson and Betano odds remain independent from affiliation',comparison.bookmakers.length===2&&comparison.bookmakers.every(b=>b.geoEligibility.eligible)&&comparison.bookmakers.find(b=>b.bookmakerId==='betano.bet.br')?.ctaState!=='ENABLED');
    const context={locale:'br' as const,pagePath:'/br',placement:'slip_bookmaker_comparison' as const,bookmaker:'betsson' as const,selections};
    check('real stale retained odds cannot enable commercial slip',await offerDependencies(tx).pricing(context,'betsson',now)===null);
    const page=(await readPageContext(tx,context))!;const offer:VerifiedOffer={campaign,context,page,expiresAt:now+300000,creative:null};
    const view=randomUUID(),key='LOCAL_QA_KEY_NO_PRODUCTION_USE'.repeat(2);const first=await recordClick(tx,offer,view,'QA_TEST',key,now);const duplicate=await recordClick(tx,offer,view,'QA_TEST',key,now);
    check('opaque click UUID and duplicate idempotency',!!first&&duplicate===null);
    await recordImpression(tx,offer,view,'QA_TEST');await recordImpression(tx,offer,view,'QA_TEST');
    const stored=(await tx.query('SELECT * FROM affiliate_clicks WHERE id=$1',[first])).rows[0];
    check('canonical context and minimized privacy storage',stored.campaign_id===campaign.id&&stored.placement_id===context.placement&&stored.selection_count===10&&stored.geo==='BR'&&stored.page_path==='/br'&&stored.referrer===null&&stored.user_agent===null&&stored.ip_hash===null&&JSON.stringify(stored.metadata)==='{}');
    check('one viewed impression',(await tx.query('SELECT count(*) AS n FROM affiliate_impressions WHERE id=$1',[view])).rows[0].n==='1');
    const health=await affiliateHealth(tx);const metric=health.metrics.find(m=>m.campaign_id===campaign.id)!;
    check('QA excluded from human CTR, postbacks remain unavailable',Number(metric.impressions)===0&&Number(metric.clicks)===0&&Number(metric.qa_clicks)===1&&Number(metric.qa_impressions)===1&&metric.ctr===null&&!health.postbackOperational&&!health.subIdPropagationOperational&&health.conversions.received_events==='0');
    check('operations masks private configuration',!JSON.stringify(health).includes('qa-only')&&!JSON.stringify(health).includes('LOCAL_QA_ROLLBACK_ONLY'));
    await tx.query("UPDATE affiliate_impressions SET occurred_at=now()-interval '31 days' WHERE id=$1",[view]);await tx.query("UPDATE affiliate_clicks SET clicked_at=now()-interval '91 days' WHERE id=$1",[first]);
    const pruned=await pruneAffiliateAnalytics(tx);check('bounded retention deletes old test analytics',Number(pruned.impressions)>=1&&Number(pruned.clicks)>=1);
    // Local transaction-only freshness replay: never visible to live readers and
    // fully rolled back. Existing prices, source mappings and identities remain exact.
    const freshSelections=selections.filter(s=>data.fixtures.get(s.fixturePublicId)?.snapshot.quotes.some(q=>q.bookmaker==='betsson'&&q.geoEligible&&q.market==='MATCH_WINNER'&&q.outcome==='HOME')).slice(0,3);
    check('real exact-source identities available for transaction replay',freshSelections.length>0);
    await tx.query("UPDATE odds_current SET status='ACTIVE',observed_at=now(),provider_updated_at=now(),last_successful_refresh_at=now() WHERE fixture_id IN (SELECT id FROM fixtures WHERE public_id=ANY($1::text[]))",[freshSelections.map(s=>s.fixturePublicId)]);
    const activeContext={...context,selections:freshSelections},deps=offerDependencies(counted);count=0;
    const active=await resolveOffer(activeContext,deps);check('complete current approved BR offer with bounded reads',!!active&&count===3,{queries:count,selections:freshSelections.length});
    const signed=publicOffer(active!,key),work:Array<()=>Promise<void>>=[];let wrote=false;const start=performance.now();
    const redirected=await outboundRequest(new Request('https://livasports.com'+signed.href+'&qa=1',{headers:{'sec-fetch-user':'?1','sec-fetch-mode':'navigate','sec-fetch-dest':'document'}}),'betsson','slip_bookmaker_comparison',{deps,key,geo:()=>true,defer:fn=>{work.push(fn);},click:async()=>{await new Promise(r=>setTimeout(r,250));wrote=true;},impression:async()=>{}});
    const redirectMs=Math.round(performance.now()-start);check('safe configured redirect does not await attribution writes',redirected.status===303&&redirected.headers.get('location')===config.destinationUrl&&!wrote&&work.length===1,{redirectMs});await work[0]();check('deferred attribution executes after response',wrote);
    throw Error('EXPECTED_M8_ROLLBACK');
  });}catch(error){if(!(error instanceof Error)||error.message!=='EXPECTED_M8_ROLLBACK')throw error;}
  const after=await baseline();check('all synthetic data rolled back; provider delta zero',JSON.stringify(before)===JSON.stringify(after),{before,after});
  const result={at:new Date().toISOString(),status:'PASS',mode:'ROLLED_BACK_DATABASE_REHEARSAL',checks};await writeFile('output/m8-db-qa-private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({status:'FAIL',code:error instanceof Error?error.message:'UNKNOWN',checks}));process.exitCode=1;}finally{await db.close();}
