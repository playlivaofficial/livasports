// Exact private publisher configuration; all rehearsal changes are rolled back.
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {databaseUrl,PostgresDatabaseClient,type DatabaseClient} from '../src/database/client';
import {configureCampaign,parseCampaignConfiguration} from '../src/affiliate/configuration';
import {readCampaigns} from '../src/affiliate/repository';
import {offerDependencies,resolveOffer,publicOffer} from '../src/affiliate/service';
import {recordClick,recordImpression} from '../src/affiliate/analytics';
import {creativeRequest,type CommercialServices} from '../src/affiliate/server';
import {affiliateHealth} from '../src/affiliate/operations';
import type {Placement} from '../src/affiliate/types';
const db=new PostgresDatabaseClient(databaseUrl()!),checks:Array<{name:string;pass:boolean}>=[];
const check=(name:string,pass:boolean)=>{checks.push({name,pass});if(!pass)throw Error('PUBLISHER_REHEARSAL_FAILED');};
async function state(){return (await db.query(`SELECT (SELECT count(*) FROM profile_sponsor_campaigns) AS creatives,(SELECT count(*) FROM affiliate_clicks) AS clicks,(SELECT count(*) FROM affiliate_impressions) AS impressions,(SELECT count(*) FROM schema_migrations) AS migrations,(SELECT md5(string_agg(row_to_json(c)::text,'' ORDER BY c.id)) FROM affiliate_campaigns c) AS campaign_checksum`)).rows[0];}
try{
  const config=parseCampaignConfiguration(JSON.parse(await readFile('.env.g1-affiliate-config.json','utf8')));check('exact private publisher config passes strict validation',!!config&&config.creatives?.length===7);
  const before=await state();
  try{await db.transaction(async tx=>{
    await tx.query("SET LOCAL lock_timeout='5s'");
    if(!(await tx.query("SELECT 1 FROM schema_migrations WHERE filename='013_g1_publisher_creatives.sql'")).rowCount)await tx.query((await readFile('db/migrations/013_g1_publisher_creatives.sql','utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
    check('additive publisher migration executes',true);
    const adapter:DatabaseClient={query:tx.query.bind(tx),transaction:work=>work(tx),close:async()=>{}};
    const saved=await configureCampaign(adapter,config!);await configureCampaign(adapter,config!);
    const c=(await readCampaigns(tx,'br')).find(c=>c.id===saved.campaignId)!;
    check('idempotent exact source and dimension persistence',c.creatives.length===7&&config!.creatives!.every(s=>c.creatives.some(v=>v.id===s.id&&v.embedSourceUrl===s.embedSourceUrl&&v.width===s.width&&v.height===s.height&&v.delivery==='BETSSON_EMBED')));
    const contexts:Array<[Placement,string]>=[['home_top_banner','/br'],['home_right_rail','/br'],['mobile_inline','/br'],['match_right_rail','/br/jogo/flamengo-x-corinthians-48611d6f0a484f87'],['team_right_rail','/br/time/flamengo-b9c4f07b09aa447a'],['player_right_rail','/br/jogador/agustin-rossi-27e4e63b6336469b'],['profile_mobile_inline','/br/jogador/agustin-rossi-27e4e63b6336469b']];
    const baselineMetrics=(await affiliateHealth(tx)).metrics;
    const deps=offerDependencies(tx),key='LOCAL_PUBLISHER_REHEARSAL_KEY_NO_PRODUCTION_USE'.repeat(2);
    for(const [placement,pagePath] of contexts){
      const offer=await resolveOffer({locale:'br',pagePath,placement},deps);check('approved canonical publisher context '+placement,!!offer?.creative);
      const value=publicOffer(offer!,key,Date.now(),'anonymous');check('parent payload excludes private source '+placement,!JSON.stringify(value).includes('bannerflow.net')&&!JSON.stringify(value).includes('record.betsson.bet.br'));
      const services:CommercialServices={deps,key,geo:()=>true,defer:()=>{},click:async()=>{},impression:async()=>{}};
      const r=await creativeRequest(new Request('https://livasports.com/api/commercial/creative?offer='+value.token,{headers:{'sec-fetch-site':'same-origin','sec-fetch-dest':'iframe'}}),services);
      const body=await r.text();check('isolated exact-source publisher document '+placement,r.status===200&&body.includes(offer!.creative!.embedSourceUrl!.replaceAll('&','&amp;'))&&!r.headers.get('content-security-policy')?.includes('allow-same-origin'));
      if(placement==='home_top_banner'){
        const view=randomUUID(),at=Date.now();await recordImpression(tx,offer!,view,'QA_TEST');await recordImpression(tx,offer!,view,'QA_TEST');
        const id=await recordClick(tx,offer!,view,'QA_TEST',key,at,'EMBED_ACTIVATION'),duplicate=await recordClick(tx,offer!,view,'QA_TEST',key,at,'EMBED_ACTIVATION');
        check('embed activation deduplicates and never claims issued 303',!!id&&duplicate===null&&(await tx.query('SELECT redirect_status FROM affiliate_clicks WHERE id=$1',[id])).rows[0].redirect_status==='EMBED_ACTIVATION');
      }
    }
    const health=await affiliateHealth(tx),metrics=health.metrics.filter(m=>m.campaign_id===saved.campaignId);
    check('QA embed counts increase only QA totals',metrics.some(m=>{const before=baselineMetrics.find(b=>b.campaign_id===m.campaign_id&&b.placement===m.placement&&b.locale===m.locale&&b.geo===m.geo&&b.page_type===m.page_type);return Number(m.qa_clicks)-Number(before?.qa_clicks??0)===1&&Number(m.qa_embed_clicks)-Number(before?.qa_embed_clicks??0)===1&&Number(m.qa_impressions)-Number(before?.qa_impressions??0)===1&&Number(m.clicks)===Number(before?.clicks??0)&&Number(m.impressions)===Number(before?.impressions??0)&&m.ctr===(before?.ctr??null);}));
    throw Error('EXPECTED_G1_PUBLISHER_ROLLBACK');
  });}catch(error){if(!(error instanceof Error)||error.message!=='EXPECTED_G1_PUBLISHER_ROLLBACK')throw error;}
  check('entire commercial rehearsal rolled back',JSON.stringify(before)===JSON.stringify(await state()));
  await writeFile('output/g1-publisher-db-qa-private.json',JSON.stringify({at:new Date().toISOString(),status:'PASS',checks},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,rolledBack:true,providerRequests:0}));
}catch{console.error(JSON.stringify({status:'FAIL',checks}));process.exitCode=1;}finally{await db.close();}
