/** Read-only baseline audit. No sports providers, mutations, credentials or user records. */
import {writeFile,mkdir} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {readSeoReport,readSeoSearchReport} from '../src/seo/report';
import {load} from 'cheerio';
import {readGrowthFixtures} from '../src/growth/repository';
import {scoreFixture} from '../src/growth/scoring';
import {buildShortlist} from '../src/growth/shortlist';

const url=databaseUrl();
if(!url)throw Error('DATABASE_NOT_CONFIGURED');
const db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:30_000});
try{
  if(process.argv.includes('--prominence')){
    const days=[];
    const brazilIds=new Set((await db.query(`SELECT f.id FROM fixtures f JOIN competitions c ON c.id=f.competition_id
      JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      WHERE f.kickoff BETWEEN now()-interval '1 day' AND now()+interval '14 days'
      AND EXISTS(SELECT 1 FROM countries co WHERE co.iso2='BR' AND co.id IN(c.country_id,ht.country_id,at.country_id))`)).rows.map(r=>String(r.id)));
    for(let offset=0;offset<7;offset++){
      const at=new Date(Date.now()+offset*86_400_000),fixtures=await readGrowthFixtures(db,at);
      const top=buildShortlist(fixtures.map(f=>scoreFixture(f.signals,at))).content;
      days.push({day:at.toISOString().slice(0,10),candidates:fixtures.length,topCount:top.length,
        brazilCount:top.filter(f=>brazilIds.has(f.fixtureId)).length,
        top:top.map(f=>({id:f.publicId,competition:f.competitionSlug,score:f.total,brazil:brazilIds.has(f.fixtureId)}))});
    }
    const result={capturedAt:new Date().toISOString(),method:'Forward seven-day sensitivity audit using current stored fixtures/signals and existing scorer, not historical observed rankings. Future odds freshness is evaluated at each date. No writes or generation.',days,providerRequests:0};
    await writeFile('output/seo-ctr/prominence-window.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
    await db.close();process.exit(0);
  }
  const search=await readSeoSearchReport(db),technical=await readSeoReport(db);
  const priorities=(await db.query(`SELECT p.priority_rank,p.priority_score,p.active,p.updated_at,p.canonical_url,
    c.slug,c.display_name_pt_br,f.kickoff,f.status,ht.name AS home,at.name AS away
    FROM growth_seo_priorities p JOIN fixtures f ON f.id=p.fixture_id JOIN competitions c ON c.id=f.competition_id
    JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
    ORDER BY p.active DESC,p.updated_at DESC,p.priority_rank LIMIT 150`)).rows;
  const inventory=(await db.query(`SELECT c.slug,c.display_name_pt_br,count(*)::int AS fixtures,
    min(f.kickoff) AS first_kickoff,max(f.kickoff) AS last_kickoff
    FROM fixtures f JOIN competitions c ON c.id=f.competition_id
    WHERE f.kickoff>=now() AND f.kickoff<now()+interval '7 days' AND f.status='SCHEDULED'
    GROUP BY c.slug,c.display_name_pt_br ORDER BY fixtures DESC`)).rows;
  const migrations=(await db.query('SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 3')).rows;
  const pages=[];
  for(const page of search.topPages){
    const response=await fetch(page.key,{headers:{'user-agent':'LivaSportsSeoAudit/1.0'},redirect:'manual'});
    const $=load(await response.text());
    pages.push({url:page.key,status:response.status,title:$('title').text(),description:$('meta[name="description"]').attr('content'),
      canonical:$('link[rel="canonical"]').attr('href'),robots:$('meta[name="robots"]').attr('content'),h1:$('h1').text(),
      hreflang:$('link[hreflang]').map((_,e)=>({lang:$(e).attr('hreflang'),href:$(e).attr('href')})).get(),
      structuredData:$('script[type="application/ld+json"]').map((_,e)=>JSON.parse($(e).text())).get()});
  }
  const candidates=(await db.query(`SELECT f.public_id,f.status,f.kickoff,c.slug,ht.name AS home,at.name AS away,
    (SELECT count(*)::int FROM fixture_lineups l WHERE l.fixture_id=f.id) AS lineups,
    (SELECT count(*)::int FROM fixture_statistics s WHERE s.fixture_id=f.id) AS statistics,
    (SELECT count(*)::int FROM standings_current sc WHERE sc.season_id=f.season_id) AS standings
    FROM fixtures f JOIN competitions c ON c.id=f.competition_id
    JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
    WHERE f.public_id=ANY($1::text[])`,[pages.map(p=>p.url.slice(-16))])).rows;
  const now=new Date().toISOString();
  const evidence={capturedAt:now,search,technical,priorities,inventory,migrations,pages,candidates,providerRequests:0};
  await mkdir('output/seo-ctr',{recursive:true});
  const path=`output/seo-ctr/before-${now.replaceAll(':','-')}.json`;
  await writeFile(path,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({path,pages,candidates},null,2));
}catch(error){console.error(JSON.stringify({error:(error as {code?:string}).code??'AUDIT_FAILED'}));process.exitCode=1;}
finally{await db.close();}
