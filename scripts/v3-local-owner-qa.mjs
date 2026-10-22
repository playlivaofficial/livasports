/** Authenticated local-only manual publishing test. Never uses a Production endpoint. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base='http://localhost:3351',directory='output/v3-qa/acceptance-2026-10-22';
const headers={Origin:base,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
const key=(await readFile('output/v3-qa/acceptance-2026-10-21/local-owner-key.txt','utf8')).trim();
const login=await fetch(base+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'login',key})});
assert.equal(login.status,200);headers.Cookie=login.headers.get('set-cookie').split(';')[0];
assert.equal((await fetch(base+'/api/owner/news')).status,401);
assert.equal((await fetch(base+'/api/owner/news/evidence')).status,401);
const state=await(await fetch(base+'/api/owner/news/automation',{headers})).json();assert.equal(state.paused,true);
const slug='local-owner-verification-'+Date.now();
const draft={slug,country:'international',sport:'basketball',competition:'nba',sourceName:'NBA Communications',sourceUrl:'https://pr.nba.com/international-players-2026-27-nba-rosters',sourcePublishedOn:'2026-10-20',image:'none',imageCaption:{en:'',es:'',pt:''},featured:false,
 title:{en:'NBA reports international roster representation',es:'La NBA informa sobre sus jugadores internacionales',pt:'NBA informa sobre jogadores internacionais'},
 summary:{en:'NBA Communications reports international representation on opening-night rosters.',es:'NBA Communications informa de la presencia internacional en las plantillas iniciales.',pt:'NBA Communications informa sobre a presença internacional nos elencos de abertura.'},
 body:{en:'NBA Communications reports 125 international players from 43 countries across six continents on opening-night rosters for the 2026-27 season.',es:'NBA Communications informa de 125 jugadores internacionales de 43 países de seis continentes en las plantillas iniciales de la temporada 2026-27.',pt:'NBA Communications informa que os elencos de abertura da temporada 2026-27 têm 125 jogadores internacionais de 43 países em seis continentes.'}};
let record;
async function action(action,extra={}){const response=await fetch(base+'/api/owner/news',{method:'POST',headers,body:JSON.stringify({action,slug,revision:record?.revision??0,...extra})});assert.equal(response.status,200,action);record=(await response.json()).record;}
try{
 await action('create',{draft});
 await action('save',{draft});
 assert.equal((await fetch(base+'/en/news/'+slug)).status,404);
 const blocked=await fetch(base+'/api/owner/news',{method:'POST',headers,body:JSON.stringify({action:'publish',slug,revision:record.revision})});assert.equal(blocked.status,409);
 await action('review',{confirmed:true});await action('publish');
 for(const [locale,section] of [['en','news'],['mx','noticias'],['br','noticias']]){
  const article=await fetch(`${base}/${locale}/${section}/${slug}`);assert.equal(article.status,200);assert.ok((await article.text()).includes(draft.sourceUrl));
  assert.ok((await(await fetch(`${base}/${locale}`)).text()).includes(slug));
 }
}finally{if(record)await action('archive');}
assert.equal((await fetch(base+'/en/news/'+slug)).status,404);
await mkdir(directory,{recursive:true});
const report={at:new Date().toISOString(),slug,localOnly:true,manualOwnerTest:true,aiGenerated:false,checks:['Owner authentication','anonymous protection','create/save','unreviewed publish rejected','review/publish','EN/ES/PT public routes','source attribution','homepage invalidation','archive removes public page'],paused:true,modelConfigured:state.modelConfigured,modelCalls:0};
await writeFile(directory+'/owner-rebuild-qa.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
