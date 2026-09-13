// Read-only verification of the real privately configured campaign. No portal
// credentials, raw destinations or operator campaign IDs are emitted.
import {readFile,writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {parseCampaignConfiguration} from '../src/affiliate/configuration';
import {readCampaigns} from '../src/affiliate/repository';
import {geoAllowed} from '../src/affiliate/policy';
import {affiliateHealth} from '../src/affiliate/operations';
import {readSlipComparison} from '../src/odds/read-repository';
import {buildSlipComparison} from '../src/slip/comparison';
import {SLIP_SCOPE} from '../src/slip/types';
import {teamPath,playerPath} from '../src/profiles/routes';
import {configuredCampaignChecks,privateSerializationSafe,type QaCheck} from './g1-commercial-qa-checks';
const connection=new PostgresDatabaseClient(databaseUrl()!);
const checks:QaCheck[]=[];
const check=(name:string,pass:boolean)=>{checks.push({name,pass});if(!pass)throw Error('G1_CONFIGURATION_CHECK_FAILED');};
try{
  const config=parseCampaignConfiguration(JSON.parse(await readFile(process.env.LIVASPORTS_AFFILIATE_CONFIG_FILE??'.env.g1-affiliate-config.json','utf8')));
  check('secure configuration passes strict parser',!!config);
  if(!config)throw Error('G1_CONFIGURATION_CHECK_FAILED');
  const result=await connection.transaction(async tx=>{
  await tx.query('SET TRANSACTION READ ONLY');
  check('database enforces read-only QA', (await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only==='on');
  const columns=Number((await tx.query("SELECT count(*) AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='profile_sponsor_campaigns' AND column_name IN ('delivery_type','embed_source_url')")).rows[0].n);
  const migrations=Number((await tx.query("SELECT count(*) AS n FROM schema_migrations WHERE filename='013_g1_publisher_creatives.sql'")).rows[0].n);
  check('publisher schema exists with migration recorded exactly once',columns===2&&migrations===1);
  const db=tx;
  const countsSql=`SELECT (SELECT count(*) FROM competitions WHERE enabled) AS competitions,(SELECT count(*) FROM odds_provider_requests) AS odds_http,(SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+(SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports_requests`;
  const before=(await db.query(countsSql)).rows[0];
  const br=await readCampaigns(db,'br'),mx=await readCampaigns(db,'mx');
  for(const item of configuredCampaignChecks(config,br,mx,Date.now()))check(item.name,item.pass);
  const campaign=br.find(c=>c.enabled)!;
  check('edge GEO must match BR and missing GEO stays blocked',geoAllowed(new Request('https://livasports.com',{headers:{'x-vercel-ip-country':'BR'}}),'br',{VERCEL:'1'})&&!geoAllowed(new Request('https://livasports.com',{headers:{'x-vercel-ip-country':'MX'}}),'br',{VERCEL:'1'})&&!geoAllowed(new Request('https://livasports.com'),'br',{VERCEL:'1'}));
  const rows=(await db.query(`SELECT f.public_id FROM fixtures f WHERE f.status='SCHEDULED' AND f.kickoff>now() AND EXISTS(SELECT 1 FROM odds_current o JOIN bookmakers b ON b.id=o.bookmaker_id WHERE o.fixture_id=f.id AND b.provider_slug='betsson' AND o.market_code='MATCH_WINNER' AND o.outcome_code='HOME') ORDER BY f.kickoff LIMIT 10`)).rows;
  const selections=rows.map(r=>({fixturePublicId:r.public_id,scope:SLIP_SCOPE,market:'MATCH_WINNER' as const,outcome:'HOME' as const,line:null}));
  const data=await readSlipComparison(db,selections.map(s=>s.fixturePublicId),'BR');
  const comparison=buildSlipComparison(selections.slice(0,3),'br',data.fixtures,data.bookmakers,Date.now());
  check('Betano odds eligibility remains separate from CTA',comparison.bookmakers.some(b=>b.bookmakerId==='betano.bet.br'&&b.geoEligibility.eligible&&b.ctaState!=='ENABLED'));
  const health=await affiliateHealth(db);
  check('protected operations confirm this campaign and seven approved enabled creatives',health.campaigns.some(c=>c.id===campaign.id&&c.campaignEligibleNow&&c.approvedCreativeCount===7));
  check('health serialization excludes private configuration and tracking values',privateSerializationSafe(health,config));
  check('no fabricated conversion measurement',!health.postbackOperational&&!health.subIdPropagationOperational&&health.conversions.received_events==='0');
  const longTeam=(await db.query('SELECT public_id,name FROM teams WHERE public_id IS NOT NULL ORDER BY length(name) DESC LIMIT 1')).rows[0];
  const richPlayer=(await db.query('SELECT p.public_id,p.display_name FROM players p ORDER BY (SELECT count(*) FROM player_season_statistics s WHERE s.player_id=p.id) DESC,p.id LIMIT 1')).rows[0];
  const partialPlayer=(await db.query("SELECT public_id,display_name FROM players WHERE profile_state='PARTIAL' ORDER BY id LIMIT 1")).rows[0];
  const paths=[['finished','/br/jogo/vitoria-x-gremio-21e7f7a99e774c70'],['long-team',teamPath('br',longTeam.public_id,longTeam.name)],['rich-player',playerPath('br',richPlayer.public_id,richPlayer.display_name)],...(partialPlayer?[['partial-player',playerPath('br',partialPlayer.public_id,partialPlayer.display_name)]]:[])];
  const counts=(await db.query(countsSql)).rows[0];
  check('provider request counters remain unchanged',counts.odds_http===before.odds_http&&counts.sports_requests===before.sports_requests&&health.providerRequests===0);
  return {at:new Date().toISOString(),status:'PASS',checks,paths,selections,counts,comparison:comparison.bookmakers.map(b=>({bookmaker:b.bookmakerId,complete:b.complete,cta:b.ctaState})),schema:'PUBLISHER',readOnly:true,providerRequests:0,operatorCalls:0};
  });
  check('QA report serialization excludes private configuration and tracking values',privateSerializationSafe(result,config));
  await writeFile('output/g1-commercial-qa-private.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,counts:result.counts,comparison:result.comparison,schema:result.schema,readOnly:true,providerRequests:0,operatorCalls:0}));
}catch{console.error(JSON.stringify({status:'FAIL',checks}));process.exitCode=1;}finally{await connection.close();}
