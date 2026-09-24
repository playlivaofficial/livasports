/**
 * Growth Dashboard data-correctness QA.
 *
 *   tsx scripts/growth-dashboard-qa.ts --seed      # LOCAL DATABASE ONLY: seed a labelled synthetic dataset, then reconcile
 *   tsx scripts/growth-dashboard-qa.ts [--days=7]  # any database, read-only: reconcile the dashboard against independent SQL
 *
 * Reconciliation recomputes every headline number with deliberately different, hand-written SQL
 * (no shared CTEs with the dashboard), and proves that QA, OWNER and BOT traffic never reach the
 * human KPIs, that UTM attribution joins to the right Traffic Engine item, and that bookmaker clicks
 * reconcile with the affiliate click ledger. Exits non-zero on any mismatch.
 */
import {randomUUID} from 'node:crypto';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';
import {readGrowthReport,readWeeklyScorecard,DAY} from '../src/analytics/growth-report';

const args=new Set(process.argv.slice(2));
const days=Number([...args].find(arg=>arg.startsWith('--days='))?.split('=')[1]??7);
const url=databaseUrl();if(!url)throw new Error('DATABASE_URL is required');
const db=new PostgresDatabaseClient(url);
const hex=()=>randomUUID().replace(/-/g,'').slice(0,16);
const sid=()=>`qa${randomUUID().replace(/-/g,'')}`.slice(0,40);

async function seed(now:Date){
  const host=new URL(url!).hostname;
  if(!['localhost','127.0.0.1'].includes(host))throw new Error('--seed is refused outside a local database');
  const sport=(await db.query<{id:string}>(`SELECT id FROM sports WHERE code='FOOTBALL'`)).rows[0]!.id;
  const existing=(await db.query<{id:string}>(`SELECT id FROM competitions WHERE slug='brasileirao-serie-a' LIMIT 1`)).rows[0]?.id;
  const comp=existing??(await db.query<{id:string}>(`INSERT INTO competitions(sport_id,name,slug,canonical_name,display_name_pt_br,display_name_es_mx,competition_type,region,competition_group,coverage_status,season_strategy)
    VALUES($1,'Brasileirão Série A','brasileirao-serie-a','Brasileirão Série A','Brasileirão Série A','Brasileirão Série A','DOMESTIC_LEAGUE','SOUTH_AMERICA','BRAZIL','SUPPORTED','STANDARD')
    RETURNING id`,[sport])).rows[0]!.id;
  const team=async(name:string)=>(await db.query<{id:string;public_id:string}>(`INSERT INTO teams(sport_id,name,public_id) VALUES($1,$2,$3) RETURNING id,public_id`,[sport,name,hex()])).rows[0]!;
  const [fla,pal,cor,sao]=await Promise.all(['Flamengo','Palmeiras','Corinthians','São Paulo'].map(team));
  const fixture=async(home:{id:string},away:{id:string})=>(await db.query<{id:string;public_id:string}>(`INSERT INTO fixtures(sport_id,competition_id,home_team_id,away_team_id,kickoff,status,public_id)
    VALUES($1,$2,$3,$4,$5,'SCHEDULED',$6) RETURNING id,public_id`,[sport,comp,home.id,away.id,new Date(now.getTime()+2*DAY),hex()])).rows[0]!;
  const f1=await fixture(fla!,pal!),f2=await fixture(cor!,sao!);
  const bookmaker=(await db.query<{id:string}>(`SELECT id FROM bookmakers WHERE provider_slug='betano.bet.br'`)).rows[0]!.id;
  const link=(await db.query<{id:string}>(`INSERT INTO affiliate_links(bookmaker_id,country_id,destination_url) SELECT $1,id,'https://example.invalid/qa' FROM countries WHERE iso2='BR' RETURNING id`,[bookmaker])).rows[0]!.id;
  // A Traffic Engine item for f1 with TikTok + Reels channels, so UTM attribution has something real to join to.
  const item=(await db.query<{id:string}>(`INSERT INTO growth_content_items(fixture_id,revision,generator_version,source_hash,trigger_source,priority_score,score_breakdown,ranking_reasons,fixture_snapshot,content_pack,canonical_url,created_at)
    VALUES($1,1,2,$2,'AUTOMATIC',80,'[]','[]',$3,$4,$5,$6) RETURNING id`,[f1.id,'a'.repeat(64),JSON.stringify({home:{publicId:fla!.public_id},away:{publicId:pal!.public_id}}),
    JSON.stringify({story:{angle:'DERBY_RIVALRY'},platforms:{TIKTOK:{template:'MATCH_CLASH',creative:{version:'PREMIUM_1',family:'CHARACTER_FOOTBALL_WORLD',scenery:['STADIUM_NIGHT'],characters:'LIVA_ORIGINAL',hookFamily:'DERBY_RIVALRY:Dia de rivalidade',ctaFamily:'Abre e monta seu bilhete'}},
      INSTAGRAM_REELS:{template:'MATCH_CLASH',creative:{version:'PREMIUM_1',family:'CREST_EDITORIAL',scenery:['TUNNEL_BIGMATCH'],characters:'NONE',hookFamily:'DERBY_RIVALRY:Um clássico em foco',ctaFamily:'Seu guia para a rodada'}}}}),
    `https://livasports.com/br/jogo/x-${f1.public_id}`,new Date(now.getTime()-3*DAY)])).rows[0]!.id;
  for(const channel of ['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS','EDITORIAL'])await db.query(`INSERT INTO growth_content_channels(content_item_id,channel,status,tracked_url,published_at) VALUES($1,$2,$3,$4,$5)`,
    [item,channel,channel==='TIKTOK'?'PUBLISHED':'DRAFT',`https://livasports.com/br/jogo/x-${f1.public_id}?utm_source=x`,channel==='TIKTOK'?new Date(now.getTime()-2*DAY):null]);

  interface Plan {traffic:'HUMAN'|'QA'|'OWNER'|'BOT';referrer:string;host?:string;utm?:{source:string;medium:string;campaign:string;content:string};landing:string;page:string;
    fixture?:{id:string;public_id:string};steps:string[];outbound?:number;eventTraffic?:'HUMAN';daysAgo:number;}
  const te=(source:string)=>({source,medium:'social',campaign:'traffic_engine_v1',content:`match_${f1.public_id}`});
  const plans:Plan[]=[
    // Current week, human.
    ...Array.from({length:6},(_,i)=>({traffic:'HUMAN' as const,referrer:'google_organic',host:'www.google.com',landing:`/br/jogo/x-${f1.public_id}`,page:'match',fixture:f1,steps:['match_viewed','odds_selected','slip_created','slip_leg_added','bookmaker_comparison_viewed'],outbound:i<2?1:0,daysAgo:1+i%3})),
    ...Array.from({length:4},(_,i)=>({traffic:'HUMAN' as const,referrer:'social',host:'www.tiktok.com',utm:te('tiktok'),landing:`/br/jogo/x-${f1.public_id}`,page:'match',fixture:f1,steps:['match_viewed','odds_selected','slip_leg_added'],outbound:i===0?1:0,daysAgo:1})),
    ...Array.from({length:2},()=>({traffic:'HUMAN' as const,referrer:'social',utm:te('instagram'),landing:`/br/jogo/x-${f1.public_id}`,page:'match',fixture:f1,steps:['match_viewed'],daysAgo:2})),
    ...Array.from({length:3},()=>({traffic:'HUMAN' as const,referrer:'direct',landing:'/br',page:'home',fixture:f2,steps:['match_viewed'],daysAgo:2})),
    {traffic:'HUMAN',referrer:'social',host:'www.youtube.com',landing:`/br/jogo/y-${f2.public_id}`,page:'match',fixture:f2,steps:['match_viewed','odds_selected'],daysAgo:3},
    {traffic:'HUMAN',referrer:'referral',host:'blog.example.com',landing:'/br/futebol',page:'football',steps:[],daysAgo:4},
    // Excluded traffic: QA, bots and the owner. The owner's redirect is mislabelled HUMAN at event level on purpose.
    ...Array.from({length:3},()=>({traffic:'QA' as const,referrer:'direct',landing:`/br/jogo/x-${f1.public_id}`,page:'match',fixture:f1,steps:['match_viewed','odds_selected','slip_leg_added'],outbound:1,daysAgo:1})),
    ...Array.from({length:5},()=>({traffic:'BOT' as const,referrer:'unknown',landing:'/br',page:'home',steps:['match_viewed'],daysAgo:1})),
    {traffic:'OWNER',referrer:'direct',landing:`/br/jogo/x-${f1.public_id}`,page:'match',fixture:f1,steps:['match_viewed','odds_selected','slip_leg_added'],outbound:1,eventTraffic:'HUMAN',daysAgo:1},
    // Previous week, human.
    ...Array.from({length:5},(_,i)=>({traffic:'HUMAN' as const,referrer:'google_organic',host:'www.google.com',landing:`/br/jogo/x-${f1.public_id}`,page:'match',fixture:f1,steps:['match_viewed','odds_selected'],outbound:i===0?1:0,daysAgo:8+i%3})),
    ...Array.from({length:2},()=>({traffic:'HUMAN' as const,referrer:'direct',landing:'/br',page:'home',steps:[],daysAgo:9})),
  ];
  for(const plan of plans){
    const session=sid(),anon=sid(),start=new Date(now.getTime()-plan.daysAgo*DAY-3600_000);
    await db.query(`INSERT INTO analytics_sessions(session_id,anonymous_id,started_at,last_seen_at,traffic_class,visitor_kind,locale,geo,landing_path,landing_page_type,referrer_class,referrer_host,utm_source,utm_medium,utm_campaign,utm_content,engaged)
      VALUES($1,$2,$3,$3,$4,'NEW','br','BR',$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[session,anon,start,plan.traffic,plan.landing,plan.page,plan.referrer,plan.host??null,plan.utm?.source??null,plan.utm?.medium??null,plan.utm?.campaign??null,plan.utm?.content??null,plan.steps.length>0]);
    const event=async(name:string,offset:number,extra:{bookmaker?:string;id?:string;traffic?:string}={})=>db.query(`INSERT INTO analytics_events(event_id,event_name,source,occurred_at,session_id,anonymous_id,traffic_class,locale,geo,page_type,canonical_path,referrer_class,utm_source,utm_campaign,utm_content,competition_id,fixture_id,bookmaker)
      VALUES($1,$2,$3,$4,$5,$6,$7,'br','BR',$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[extra.id??randomUUID(),name,name==='outbound_redirect_completed'?'server':'client',new Date(start.getTime()+offset*1000),session,anon,extra.traffic??plan.traffic,plan.page,plan.landing,
        plan.referrer==='unknown'?'unknown':plan.referrer,plan.utm?.source??null,plan.utm?.campaign??null,plan.utm?.content??null,plan.fixture?comp:null,plan.fixture?.id??null,extra.bookmaker??null]);
    await event('page_viewed',1);
    for(const [index,step] of plan.steps.entries())await event(step,10+index*10);
    for(let click=0;click<(plan.outbound??0);click++){
      const clickId=randomUUID();
      await event('affiliate_cta_clicked',100,{bookmaker:'betano.bet.br'});
      // Shared UUID between ledger and analytics, exactly as the redirect path writes it.
      await db.query(`INSERT INTO affiliate_clicks(id,affiliate_link_id,bookmaker_id,fixture_id,clicked_at,locale,geo,page_type,page_path,traffic_class) VALUES($1,$2,$3,$4,$5,'br','BR','MATCH',$6,$7)`,
        [clickId,link,bookmaker,plan.fixture?.id??null,new Date(start.getTime()+110_000),plan.landing,plan.traffic==='QA'?'QA_TEST':'HUMAN_CLICK']);
      await event('outbound_redirect_completed',110,{bookmaker:'betano.bet.br',id:clickId,traffic:plan.eventTraffic??(plan.traffic==='QA'?'QA':plan.traffic)});
    }
  }
  console.info(JSON.stringify({event:'seeded',sessions:plans.length,fixtures:[f1.public_id,f2.public_id],growthItem:item}));
}

async function independent(from:Date,to:Date){
  const p=[from.toISOString(),to.toISOString()];
  const one=async(sql:string)=>Number((await db.query<{v:number}>(sql,p)).rows[0]?.v??0);
  const humanEvents=(name:string)=>`SELECT count(*)::int AS v FROM analytics_sessions s, analytics_events e WHERE e.session_id=s.session_id AND s.traffic_class='HUMAN' AND e.traffic_class='HUMAN'
    AND s.started_at>=$1 AND s.started_at<$2 AND e.event_name='${name}'`;
  return {
    sessions:await one(`SELECT count(*)::int AS v FROM analytics_sessions WHERE traffic_class='HUMAN' AND started_at>=$1 AND started_at<$2`),
    organicSessions:await one(`SELECT count(*)::int AS v FROM analytics_sessions WHERE traffic_class='HUMAN' AND started_at>=$1 AND started_at<$2 AND referrer_class IN ('google_organic','bing_organic','other_search') AND coalesce(utm_source,'') NOT IN ('tiktok','instagram','youtube','editorial_social')`),
    tiktokSessions:await one(`SELECT count(*)::int AS v FROM analytics_sessions WHERE traffic_class='HUMAN' AND started_at>=$1 AND started_at<$2 AND (utm_source='tiktok' OR referrer_host LIKE '%tiktok.com')`),
    matchViews:await one(humanEvents('match_viewed')),oddsInteractions:await one(humanEvents('odds_selected')),slipAdds:await one(humanEvents('slip_leg_added')),
    outboundRedirects:await one(humanEvents('outbound_redirect_completed')),
    ownerOrQaRedirectsLabelledHuman:await one(`SELECT count(*)::int AS v FROM analytics_events e JOIN analytics_sessions s ON s.session_id=e.session_id WHERE e.event_name='outbound_redirect_completed' AND e.traffic_class='HUMAN' AND s.traffic_class<>'HUMAN' AND e.occurred_at>=$1 AND e.occurred_at<$2`),
    ledgerHumanClicks:await one(`SELECT count(*)::int AS v FROM affiliate_clicks WHERE traffic_class='HUMAN_CLICK' AND clicked_at>=$1 AND clicked_at<$2`),
    excluded:Object.fromEntries((await db.query<{traffic_class:string;v:number}>(`SELECT traffic_class,count(*)::int AS v FROM analytics_sessions WHERE started_at>=$1 AND started_at<$2 GROUP BY 1`,p)).rows.map(row=>[row.traffic_class,row.v])),
    tiktokAttributedClicks:await one(`SELECT count(*)::int AS v FROM analytics_sessions s JOIN analytics_events e ON e.session_id=s.session_id AND e.event_name='outbound_redirect_completed' AND e.traffic_class='HUMAN'
      WHERE s.traffic_class='HUMAN' AND s.started_at>=$1 AND s.started_at<$2 AND s.utm_campaign='traffic_engine_v1' AND s.utm_source='tiktok'`),
  };
}

async function main(){
  const now=new Date();
  if(args.has('--seed'))await seed(now);
  const to=now,from=new Date(now.getTime()-days*DAY);
  const [report,truth]=await Promise.all([readGrowthReport(db,{from,to},now),independent(from,to)]);
  const tiktok=report.acquisition.find(row=>row.bucket==='tiktok')?.sessions??0;
  const engineTiktok=report.trafficEngine.filter(row=>row.channel==='TIKTOK').reduce((sum,row)=>sum+row.clicks,0);
  const checks:Array<[string,number,number]>=[
    ['sessions (HUMAN only)',report.current.sessions,truth.sessions],
    ['organic sessions',report.current.organicSessions,truth.organicSessions],
    ['TikTok sessions (UTM or referrer)',tiktok,truth.tiktokSessions],
    ['match views',report.current.matchViews,truth.matchViews],
    ['odds interactions',report.current.oddsInteractions,truth.oddsInteractions],
    ['slip adds',report.current.slipAdds,truth.slipAdds],
    ['bookmaker outbound redirects',report.current.outboundRedirects,truth.outboundRedirects],
    ['owner/QA redirects excluded by session',report.quality.excludedOutboundBySession,truth.ownerOrQaRedirectsLabelledHuman],
    ['ledger HUMAN_CLICK clicks',report.quality.reconciliation.ledgerHumanClicks,truth.ledgerHumanClicks],
    ['Traffic Engine TikTok clicks via UTM join',engineTiktok,truth.tiktokAttributedClicks],
    ['funnel start = sessions',report.funnel[0]!.sessions,truth.sessions],
  ];
  const failures=checks.filter(([,a,b])=>a!==b);
  console.table(checks.map(([name,dashboard,sql])=>({check:name,dashboard,independentSql:sql,ok:dashboard===sql})));
  console.info(JSON.stringify({window:{from:from.toISOString(),to:to.toISOString()},trafficClasses:truth.excluded,reconciliation:report.quality.reconciliation,
    humanSessionsInKpis:report.current.sessions,nonHumanSessionsExcluded:Object.entries(truth.excluded).filter(([k])=>k!=='HUMAN').reduce((s,[,v])=>s+Number(v),0),flags:report.quality.flags},null,2));
  const weekly=await readWeeklyScorecard(db,now,{},now);
  console.info(JSON.stringify({weekly:{week:weekly.week.label,complete:weekly.complete,metrics:weekly.metrics,winners:weekly.scored.winners.length,watchlist:weekly.scored.watchlist.length,weak:weekly.scored.weak.length}}));
  if(failures.length){console.error(JSON.stringify({event:'reconciliation-failed',failures}));process.exitCode=1;}
  else console.info(JSON.stringify({event:'reconciled',checks:checks.length}));
}
main().finally(()=>db.close());
