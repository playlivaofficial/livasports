// Read-only verification of the real privately configured campaign. No portal
// credentials, raw destinations or operator campaign IDs are emitted.
import {readFile,writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {parseCampaignConfiguration} from '../src/affiliate/configuration';
import {readCampaigns} from '../src/affiliate/repository';
import {campaignDestination,geoAllowed} from '../src/affiliate/policy';
import {affiliateHealth} from '../src/affiliate/operations';
import {readSlipComparison} from '../src/odds/read-repository';
import {buildSlipComparison} from '../src/slip/comparison';
import {SLIP_SCOPE} from '../src/slip/types';
import {teamPath,playerPath} from '../src/profiles/routes';
const db=new PostgresDatabaseClient(databaseUrl()!);
const checks:Array<{name:string;pass:boolean}>=[];
const check=(name:string,pass:boolean)=>{checks.push({name,pass});if(!pass)throw Error('G1_CONFIGURATION_CHECK_FAILED');};
try{
  const config=parseCampaignConfiguration(JSON.parse(await readFile(process.env.LIVASPORTS_AFFILIATE_CONFIG_FILE??'.env.g1-affiliate-config.json','utf8')));
  check('secure configuration passes strict parser',!!config);
  const br=await readCampaigns(db,'br'),mx=await readCampaigns(db,'mx');
  const active=br.filter(c=>c.enabled),campaign=active[0];
  check('one dedicated approved BR Betsson campaign',active.length===1&&campaign.bookmaker==='betsson'&&campaign.approved&&campaign.geoEligible&&campaign.affiliateApproved&&campaign.operatorCampaignId===config!.operatorCampaignId);
  check('exact portal destination preserved in server database',campaign.destination===config!.destinationUrl);
  check('honest sportsbook capability and three odds/slip placements',campaign.destinationType==='SPORTSBOOK'&&campaign.placements.length===3&&['match_odds_table','match_slip_comparison','slip_bookmaker_comparison'].every(p=>campaign.placements.includes(p as never)));
  const context={locale:'br' as const,pagePath:'/br',placement:'slip_bookmaker_comparison' as const,bookmaker:'betsson' as const};
  check('current campaign/domain validation passes',campaignDestination(campaign,context,Date.now())===config!.destinationUrl);
  check('no unverified banner delivery enabled',campaign.creatives.every(c=>!c.enabled));
  check('MX and Betano remain commercially independent',mx.every(c=>!c.enabled)&&br.filter(c=>c.bookmaker==='betano.bet.br').every(c=>!c.enabled)&&campaignDestination(campaign,{...context,locale:'mx'},Date.now())===null);
  check('edge GEO must match BR',geoAllowed(new Request('https://livasports.com',{headers:{'x-vercel-ip-country':'BR'}}),'br',{VERCEL:'1'})&&!geoAllowed(new Request('https://livasports.com',{headers:{'x-vercel-ip-country':'MX'}}),'br',{VERCEL:'1'}));
  const rows=(await db.query(`SELECT f.public_id FROM fixtures f WHERE f.status='SCHEDULED' AND f.kickoff>now() AND EXISTS(SELECT 1 FROM odds_current o JOIN bookmakers b ON b.id=o.bookmaker_id WHERE o.fixture_id=f.id AND b.provider_slug='betsson' AND o.market_code='MATCH_WINNER' AND o.outcome_code='HOME') ORDER BY f.kickoff LIMIT 10`)).rows;
  const selections=rows.map(r=>({fixturePublicId:r.public_id,scope:SLIP_SCOPE,market:'MATCH_WINNER' as const,outcome:'HOME' as const,line:null}));
  const data=await readSlipComparison(db,selections.map(s=>s.fixturePublicId),'br');
  const comparison=buildSlipComparison(selections.slice(0,3),'br',data.fixtures,data.bookmakers,Date.now());
  check('Betano odds eligibility remains separate from CTA',comparison.bookmakers.some(b=>b.bookmakerId==='betano.bet.br'&&b.geoEligibility.eligible&&b.ctaState!=='ENABLED'));
  const health=await affiliateHealth(db),serialized=JSON.stringify(health);
  check('protected operations confirm eligibility without destination',health.campaigns.some(c=>c.campaignEligibleNow)&&!serialized.includes(config!.destinationUrl)&&!serialized.includes('operatorCampaignId'));
  check('no fabricated conversion measurement',!health.postbackOperational&&!health.subIdPropagationOperational&&health.conversions.received_events==='0');
  const longTeam=(await db.query('SELECT public_id,name FROM teams WHERE public_id IS NOT NULL ORDER BY length(name) DESC LIMIT 1')).rows[0];
  const richPlayer=(await db.query('SELECT p.public_id,p.display_name FROM players p ORDER BY (SELECT count(*) FROM player_season_statistics s WHERE s.player_id=p.id) DESC,p.id LIMIT 1')).rows[0];
  const partialPlayer=(await db.query("SELECT public_id,display_name FROM players WHERE profile_state='PARTIAL' ORDER BY id LIMIT 1")).rows[0];
  const paths=[['finished','/br/jogo/vitoria-x-gremio-21e7f7a99e774c70'],['long-team',teamPath('br',longTeam.public_id,longTeam.name)],['rich-player',playerPath('br',richPlayer.public_id,richPlayer.display_name)],...(partialPlayer?[['partial-player',playerPath('br',partialPlayer.public_id,partialPlayer.display_name)]]:[])];
  const counts=(await db.query(`SELECT (SELECT count(*) FROM competitions WHERE enabled) AS competitions,(SELECT count(*) FROM odds_provider_requests) AS odds_http,(SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+(SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports_requests`)).rows[0];
  const result={at:new Date().toISOString(),status:'PASS',checks,paths,selections,counts,comparison:comparison.bookmakers.map(b=>({bookmaker:b.bookmakerId,complete:b.complete,cta:b.ctaState})),operatorCalls:0};
  await writeFile('output/g1-commercial-qa-private.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,counts,comparison:result.comparison,operatorCalls:0}));
}catch{console.error(JSON.stringify({status:'FAIL',checks}));process.exitCode=1;}finally{await db.close();}
