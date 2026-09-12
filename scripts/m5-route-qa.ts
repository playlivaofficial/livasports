import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {matchPath} from '../src/match-center/routes';
import {teamPath,playerPath} from '../src/profiles/routes';
const base=process.argv[2]??'http://localhost:3300';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw new Error('Unexpected QA target');
const db=new PostgresDatabaseClient(databaseUrl()!);
const results:Array<Record<string,unknown>>=[];
function check(name:string,pass:boolean,detail:unknown){results.push({name,pass,detail});}
async function usage(){return (await db.query(`SELECT (SELECT count(*) FROM odds_provider_requests) AS odds,
  (SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+
  (SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports`)).rows[0];}
async function page(path:string,expected=200){const start=performance.now();const response=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  const text=await response.text();check(path,response.status===expected,{status:response.status,milliseconds:Math.round(performance.now()-start),location:response.headers.get('location')});return {response,text};}
try{
  const before=await usage();
  const registry=(await db.query('SELECT slug FROM competitions WHERE enabled ORDER BY slug')).rows.map(r=>r.slug);
  check('enabled canonical registry',registry.length===34,{count:registry.length});
  await page('/',307);
  for(const path of ['/br','/br/futebol','/br/ao-vivo','/br/jogos/hoje','/mx','/mx/futbol','/mx/en-vivo','/mx/partidos/hoy']){
    const {text}=await page(path);
    if(path==='/br'||path==='/mx'){
      const navigation=[...text.matchAll(/class="competition-tab" href="#competition-([^"]+)"/g)].map(m=>m[1]);
      check(`${path} complete navigation`,navigation.length===34&&registry.every(slug=>navigation.includes(slug)),{count:navigation.length,missing:registry.filter(slug=>!navigation.includes(slug))});
    }
  }
  const fixtures=(await db.query(`SELECT f.id,f.public_id,f.kickoff,f.status,h.name AS home,a.name AS away,c.slug,
    EXISTS(SELECT 1 FROM odds_current o WHERE o.fixture_id=f.id) AS has_odds,
    (SELECT count(*) FROM fixture_events e WHERE e.fixture_id=f.id) AS events,
    (SELECT count(*) FROM fixture_statistics s WHERE s.fixture_id=f.id) AS statistics,
    (SELECT count(*) FROM fixture_lineups l WHERE l.fixture_id=f.id) AS lineups
    FROM fixtures f JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id JOIN competitions c ON c.id=f.competition_id
    WHERE f.public_id IN ('efb9eb4236e54aa8','870fc8e482f5466c','21e7f7a99e774c70','d84bf20ef5df4551')
    OR (c.slug='brasileirao-serie-a' AND f.status='SCHEDULED' AND NOT EXISTS(SELECT 1 FROM odds_current o WHERE o.fixture_id=f.id)) ORDER BY f.kickoff LIMIT 8`)).rows;
  for(const fixture of fixtures){
    const locale=fixture.slug==='liga-mx'?'mx':'br';const path=matchPath(locale,fixture.public_id,fixture.home,fixture.away);
    const {text}=await page(path);
    check(`${fixture.public_id} persisted kickoff in SSR`,text.includes(fixture.kickoff.toISOString()),{kickoff:fixture.kickoff,status:fixture.status});
    const {text:state}=await page(`/api/matches/${fixture.public_id}?locale=${locale}`);const parsed=JSON.parse(state);
    check(`${fixture.public_id} canonical status`,parsed.status===fixture.status&&parsed.providerRequests===0,{status:parsed.status,providerRequests:parsed.providerRequests});
    const {text:odds}=await page(`/api/odds/${fixture.id}?locale=${locale}`);const view=JSON.parse(odds);
    check(`${fixture.public_id} scoped comparison`,view.comparisons?.length===3&&view.providerRequests===0,{markets:view.comparisons?.map((c:{market:string})=>c.market),providerRequests:view.providerRequests});
    if(fixture.status!=='SCHEDULED'||fixture.kickoff.getTime()<=Date.now()||locale==='mx')check(`${fixture.public_id} no ineligible active prices`,view.comparisons.every((c:{eligiblePrices:number})=>c.eligiblePrices===0),{state:fixture.status,locale});
    check(`${fixture.public_id} no unconfigured CTA`,!text.includes('href="/go/'),{hasOdds:fixture.has_odds,events:fixture.events,statistics:fixture.statistics,lineups:fixture.lineups,path});
  }
  for(const locale of ['br','mx'] as const){
    const team=(await db.query('SELECT public_id,name FROM teams WHERE public_id=$1',[locale==='br'?'b9c4f07b09aa447a':'c018c002ecd546a0'])).rows[0];
    await page(teamPath(locale,team.public_id,team.name));
    const player=(await db.query('SELECT public_id,display_name FROM players WHERE public_id=$1',['27e4e63b6336469b'])).rows[0];
    await page(playerPath(locale,player.public_id,player.display_name));
  }
  await page('/br/jogo/wrong-slug-efb9eb4236e54aa8',308);
  await page('/br/jogo/not-a-match-0000000000000000',404);
  await page('/mx/partido/not-a-match-0000000000000000',404);
  await page('/api/odds/not-a-uuid',400);
  await page('/go/betsson?fixtureId=efb9eb42-36e5-4aa8-9b0d-05cbe62b9dd3&locale=br&market=MATCH_WINNER',404);
  const {text:sitemap}=await page('/sitemap.xml');check('sitemap retains match/team/player URLs',sitemap.includes('/br/jogo/')&&sitemap.includes('/br/time/')&&sitemap.includes('/br/jogador/'),{});
  const {text:health}=await page('/api/internal/health');check('healthy DB application',JSON.parse(health).status==='ok',{});
  if(base.startsWith('https:')){const www=await fetch('https://www.livasports.com/br',{redirect:'manual'});check('HTTPS www to apex',[301,308].includes(www.status)&&www.headers.get('location')==='https://livasports.com/br',{status:www.status,location:www.headers.get('location')});}
  const after=await usage();check('normal navigation provider delta zero',JSON.stringify(before)===JSON.stringify(after),{before,after});
  const correction=(await db.query(`SELECT count(*) AS verified,count(*) FILTER(WHERE f.kickoff=(m.metadata->'m5KickoffCorrection'->>'after')::timestamptz) AS still_exact,
    count(*) FILTER(WHERE f.status='SCHEDULED' AND f.kickoff>now()) AS still_upcoming,count(*) FILTER(WHERE f.status='SCHEDULED' AND f.kickoff<=now()) AS kickoff_elapsed,
    count(*) FILTER(WHERE f.status<>'SCHEDULED') AS provider_status_changed FROM provider_entity_mappings m JOIN fixtures f ON f.id=m.livasports_entity_id
    WHERE m.provider='SPORTMONKS' AND m.entity_type='FIXTURE' AND m.metadata ? 'm5KickoffCorrection'`)).rows[0];
  check('source-confirmed correction preserved',correction.verified==='50'&&correction.still_exact==='50',correction);
  const report={at:new Date().toISOString(),base,pass:results.every(r=>r.pass),results};
  await writeFile(`output/m5-${base.startsWith('https:')?'production':'local'}-qa-private.json`,JSON.stringify(report,null,2));
  console.info(JSON.stringify(report));if(!report.pass)process.exitCode=1;
}catch{console.error('M5 route QA failed; no credentials logged');process.exitCode=1;}finally{await db.close();}
