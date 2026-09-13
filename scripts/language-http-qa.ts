import {writeFileSync} from 'node:fs';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {matchPath} from '../src/localization/interface';
const base=process.argv[2]??'http://localhost:3300';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_SCOPE');
const db=new PostgresDatabaseClient(databaseUrl()!);const checks:Array<{name:string;pass:boolean}>=[];
function check(name:string,pass:boolean){checks.push({name,pass});if(!pass)throw Error(name);}
try{
  const sample=await db.transaction(async tx=>{
    await tx.query('SET TRANSACTION READ ONLY');
    check('read-only enforced',(await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only==='on');
    return (await tx.query(`SELECT f.public_id,h.name AS home,a.name AS away FROM fixtures f JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id
      WHERE f.status='FINISHED' AND EXISTS(SELECT 1 FROM fixture_statistics s WHERE s.fixture_id=f.id)
      AND EXISTS(SELECT 1 FROM fixture_lineups l WHERE l.fixture_id=f.id) ORDER BY f.kickoff DESC LIMIT 1`)).rows[0];
  });
  check('stored completed match with lineups and statistics exists',!!sample);
  const paths=(['br','mx','en'] as const).map(locale=>matchPath(locale,sample.public_id,sample.home,sample.away));
  writeFileSync('output/g1-language-sports-sample.json',JSON.stringify({paths}));
  for(let i=0;i<paths.length;i++){
    const response=await fetch(base+paths[i]);const html=await response.text();
    check(`completed match ${i} response`,response.status===200);check(`completed match ${i} statistics`,html.includes('class="stat-row"'));
    check(`completed match ${i} lineups`,html.includes('class="lineup-team"'));check(`completed match ${i} player links`,html.includes(i===2?'/en/player/':i===1?'/mx/jugador/':'/br/jogador/'));
  }
  for(const [path,lang] of [['/en/match/invalid','en'],['/br/jogo/invalid','pt-BR'],['/mx/partido/invalid','es-MX'],['/br/not-a-page','pt-BR'],['/mx/not-a-page','es-MX'],['/en/not-a-page','en']]){
    const response=await fetch(base+path);const html=await response.text();check(`localized missing route ${lang}`,response.status===404&&html.includes(`lang="${lang}"`)&&html.includes('noindex'));
  }
  const xml=await fetch(base+'/sitemap.xml').then(response=>response.text());
  check('sitemap includes all 3 home routes',['br','mx','en'].every(locale=>xml.includes(`<loc>https://livasports.com/${locale}</loc>`)));
  check('sitemap includes English match/team/player',['/en/match/','/en/team/','/en/player/'].every(path=>xml.includes(path)));
  const entries=xml.match(/<url>[\s\S]*?<\/url>/g)??[];
  check('every sitemap entry declares 4 alternatives',entries.length>12&&entries.every(entry=>['pt-BR','es-MX','en','x-default'].every(lang=>entry.includes(`hreflang="${lang}"`))));
  const cross=await fetch(base+'/language',{method:'POST',headers:{origin:'https://unrelated.example'},body:new URLSearchParams({locale:'en',returnTo:'/en'}),redirect:'manual'});
  check('cross-origin preference write rejected',cross.status===403&&!cross.headers.has('set-cookie'));
  const phase=base.startsWith('https')?'production':'local';writeFileSync(`output/g1-language-${phase}-http-private.json`,JSON.stringify({status:'PASS',checks,sitemapEntries:entries.length,providerRequests:0}));
  console.log(JSON.stringify({status:'PASS',phase,checks:checks.length,sitemapEntries:entries.length,providerRequests:0}));
}finally{await db.close();}
