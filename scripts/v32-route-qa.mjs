// Public SSR acceptance. Compare to reviewed archives, never query a paid provider.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {load} from 'cheerio';
const origin=process.env.V32_QA_ORIGIN??'http://localhost:3351';assert.ok(['http://localhost:3351','https://livasports.com'].includes(origin));
const dir=`output/v3-qa/v32/${origin.includes('localhost')?'local':'production'}`;await mkdir(dir,{recursive:true});
const guides=['liga-mx','peru-liga-1','champions-league','europa-league','conference-league','liga-expansion-mx','peru-liga-2','copa-peru','peru-copa-de-la-liga','copa-bicentenario','copa-mx','leagues-cup','campeon-de-campeones','campeones-cup'];
const cases=[],datasets=[];
for(const id of ['premier-league','la-liga','serie-a','ligue-1']){
 const r=await fetch(origin+'/api/public/sports/snapshots/'+id);assert.equal(r.status,200);const p=await r.json(),s=p.snapshot;const expected=JSON.parse(await readFile(`output/v3-qa/v32/source-review/${id}-snapshot.json`,'utf8'));assert.deepEqual(s,expected);assert.equal(p.license,'CC0-1.0');datasets.push({id,results:s.events.length,clubs:s.entities.length,cutoff:s.observedAt,mode:s.mode});
 for(const locale of ['en','mx','br']){const base=`/${locale}/${locale==='en'?'sports':locale==='mx'?'deportes':'esportes'}/football/${id}`;cases.push({path:base,locale,s});for(const entity of s.entities)cases.push({path:base+'/season/2026-27/entities/'+entity.id,locale,s,entity});}
}
for(const id of guides)for(const locale of ['en','mx','br'])cases.push({path:`/${locale}/${locale==='en'?'sports':locale==='mx'?'deportes':'esportes'}/football/${id}`,locale});
for(const item of cases){const r=await fetch(origin+item.path);assert.equal(r.status,200,item.path);const $=load(await r.text());assert.equal($('link[rel="canonical"]').attr('href'),'https://livasports.com'+item.path);assert.ok($('html').attr('lang').startsWith(item.locale==='en'?'en':item.locale==='br'?'pt':'es'));assert.equal($('h1').length,1);assert.equal($('a[href^="/go/"]').length,0);assert.equal($('.ms-table').length,0);
 if(item.s){const events=item.s.events.filter(e=>!item.entity||e.homeId===item.entity.id||e.awayId===item.entity.id);assert.equal($('.cx-result').length,events.length,item.path);assert.ok($('main').text().includes('2026-09-20'));if(item.entity)assert.equal($('h1').text(),item.entity.name);else assert.equal($('.cx-team-card').length,item.s.entities.length);
  for(const event of events){const home=item.s.entities.find(e=>e.id===event.homeId).name,away=item.s.entities.find(e=>e.id===event.awayId).name;const match=$('.cx-result').toArray().filter(n=>$(n).find('time').attr('datetime')===event.date&&$(n).text().includes(home)&&$(n).text().includes(away));assert.equal(match.length,1);assert.deepEqual($(match[0]).find('.cx-score>strong').map((_,n)=>Number($(n).text())).get(),[event.scores.home,event.scores.away]);}
 }else{assert.equal($('.fx-experience').length,1);assert.equal($('.cx-result').length,0);assert.ok($('meta[name=robots]').attr('content').includes('noindex'));}
}
await writeFile(dir+'/routes.json',JSON.stringify({at:new Date().toISOString(),origin,routes:cases.map(({path})=>path),datasets,passed:true},null,2));console.log(JSON.stringify({passed:true,routes:cases.length,datasets}));
