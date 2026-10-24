import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {load} from 'cheerio';
const origin=process.env.V33_QA_ORIGIN??'http://localhost:3351';assert.ok(['http://localhost:3351','https://livasports.com'].includes(origin));
const payload=await(await fetch(origin+'/api/public/sports/snapshots/euroleague')).json(),snapshot=payload.snapshot;
assert.equal(snapshot.entities.length,20);assert.equal(snapshot.observedAt,'2026-10-23');assert.equal(payload.license,'CC-BY-SA-4.0');
assert.equal((await fetch(origin+'/api/public/sports/snapshots/nba')).status,404,'Conflicting NBA candidate must remain private');
const checks=[];
for(const locale of ['en','mx','br']){const prefix=`/${locale}/${locale==='en'?'sports':locale==='mx'?'deportes':'esportes'}/basketball`;
 const routes=[{path:prefix+'/nba',kind:'directory'},{path:prefix+'/euroleague',kind:'table'},{path:prefix+'/euroleague/season/2026-27',kind:'table'},...snapshot.entities.map(entity=>({path:prefix+'/euroleague/season/2026-27/entities/'+entity.id,kind:'profile',entity}))];
 for(const item of routes){const response=await fetch(origin+item.path);assert.equal(response.status,200,item.path);const $=load(await response.text());assert.equal($('link[rel=canonical]').attr('href'),'https://livasports.com'+item.path);assert.equal($('h1').length,1);assert.equal($('a[href^="/go/"]').length,0);assert.equal($('.ms-table tbody tr').length,item.kind==='directory'?0:item.kind==='profile'?1:20);
  if(item.kind==='directory'){assert.equal($('.bk-club').length,30);assert.equal($('.bk-club[href]').length,0);assert.ok($('meta[name=robots]').attr('content').includes('noindex'));}
  else{assert.ok($('main').text().includes('2026-10-23'));assert.ok($('.ms-source-links a').first().attr('href').includes('wikipedia.org'));if(item.entity)assert.equal($('h1').text(),item.entity.name);}
  checks.push({path:item.path,status:response.status,rows:$('.ms-table tbody tr').length,canonical:true});
 }
}
const dir=`output/v3-qa/v33/basketball/${origin.includes('localhost')?'local':'production'}`;await mkdir(dir,{recursive:true});await writeFile(dir+'/routes.json',JSON.stringify({at:new Date().toISOString(),origin,checks,paidProviderRequests:0},null,2));console.log(JSON.stringify({passed:true,routes:checks.length,dir}));
