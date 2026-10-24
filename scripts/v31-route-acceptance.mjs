// Read-only acceptance of the application's reviewed records, never an upstream data fetch.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
const origin=process.env.V31_QA_ORIGIN??'http://localhost:3351';
assert.ok(['http://localhost:3351','https://livasports.com'].includes(origin));
const dir=`output/v3-qa/v31/batch1/${origin.includes('localhost')?'local':'production'}`;
await mkdir(dir,{recursive:true});
const routes=[],records=[];
for(const id of ['colombia-primera-a','bundesliga','nhl']){
 const r=await fetch(origin+'/api/public/sports/snapshots/'+id);assert.equal(r.status,200);const payload=await r.json(),s=payload.snapshot;
 const baseline=JSON.parse(await readFile(`output/v3-qa/v31/batch1/${id}-published.json`,'utf8'));
 assert.deepEqual(s,baseline.snapshot,'Reviewed dataset must remain unchanged');
 records.push({id,season:s.season,cutoff:s.observedAt,entities:s.entities.length,source:s.sourceUrl,license:payload.license,snapshotHash:createHash('sha256').update(JSON.stringify(s)).digest('hex')});
 for(const locale of ['en','mx','br']){
  const base=`/${locale}/${locale==='en'?'sports':locale==='mx'?'deportes':'esportes'}/${s.sport}/${id}`;
  routes.push({path:base,s,locale});
  const season=s.season.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  for(const entity of s.entities)routes.push({path:`${base}/season/${season}/entities/${encodeURIComponent(entity.id)}`,s,locale,entity});
 }
}
const evidence=[];let index=0;
async function worker(){while(index<routes.length){const {path,s,locale,entity}=routes[index++],r=await fetch(origin+path),html=await r.text();assert.equal(r.status,200,path);const $=load(html);
 assert.equal($('.cx-experience').length,1,path);assert.equal($('link[rel=canonical]').attr('href'),'https://livasports.com'+path);assert.ok($('html').attr('lang').startsWith(locale==='mx'?'es':locale==='br'?'pt':'en'));
 assert.ok($('.cx-date time').text().includes(s.observedAt.slice(0,10)));if(entity)assert.equal($('h1').text(),entity.name);
 const rows=s.tables.flatMap(t=>t.rows).filter(row=>!entity||row.entityId===entity.id),actual=$('.ms-table tbody tr');assert.equal(actual.length,rows.length,path);
 for(const [i,row] of rows.entries()){
  const tr=$(actual[i]),name=s.entities.find(e=>e.id===row.entityId).name;assert.ok(tr.find('th').text().includes(name));
  const fields=s.sport==='ice-hockey'?['points','played','wins','losses','overtimeLosses','goalsFor','goalsAgainst','goalDifference']:['points','played','won','drawn','lost','goalsFor','goalsAgainst','goalDifference'];
  const cells=tr.children('td').map((_,td)=>$(td).text()).get();assert.equal(cells[0],String(row.rank));
  for(const [j,key]of fields.entries())assert.equal(cells[j+1],String(key==='goalDifference'&&s.sport==='ice-hockey'?row.goalsFor-row.goalsAgainst:row[key]),path+' '+key);
 }
 const news=$('#coverage a[href*="/news/"],#coverage a[href*="/noticias/"]').length;if(s.competitionId==='colombia-primera-a'&&(!entity||entity.name==='América de Cali'))assert.ok(news>0,'Approved league/cup story missing: '+path);
 assert.ok($('.ms-source-links a').toArray().some(a=>$(a).attr('href')===s.sourceUrl));
 evidence.push({path,status:r.status,rows:rows.length,sourceCutoff:s.observedAt,newsLinks:news,canonical:$('link[rel=canonical]').attr('href'),robots:$('meta[name=robots]').attr('content')});
}}
await Promise.all([worker(),worker(),worker()]);
await writeFile(dir+'/routes.json',JSON.stringify({at:new Date().toISOString(),origin,passed:true,records,routes:evidence.sort((a,b)=>a.path.localeCompare(b.path)),paidProviderRequests:0},null,2));
console.log(JSON.stringify({passed:true,routes:evidence.length,records,directory:dir}));
