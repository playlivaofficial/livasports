// Own application only; isolated browser, public reviewed data, no model/provider calls.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const origin=process.env.V31_QA_ORIGIN??'http://localhost:3351';
assert.ok(['http://localhost:3351','https://livasports.com'].includes(origin));
const before=process.argv.includes('--before'),dir=`output/v3-qa/v31/batch1/${before?'before':origin.includes('localhost')?'local':'production'}`;
await mkdir(dir,{recursive:true});
const ids=['colombia-primera-a','bundesliga','nhl'],snapshots=[];
for(const id of ids){const r=await fetch(origin+'/api/public/sports/snapshots/'+id);assert.equal(r.status,200);const {snapshot}=await r.json();snapshots.push(snapshot);}
const browser=await browserQA(),cases=[];
try{const page=await browser.newPage();
await page.c.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});"});
async function visit(path,width,theme){await page.viewport(width,width===1440?1000:844);await page.evaluate('window.__old=true');await page.c.send('Page.navigate',{url:origin+path});await page.wait('!window.__old&&document.readyState==="complete"&&!!document.querySelector("main")',60000);await page.evaluate(`localStorage.setItem('livasports:theme',${JSON.stringify(theme)});document.documentElement.dataset.theme=${JSON.stringify(theme)};window.dispatchEvent(new Event('livasports:theme-change'))`);await page.evaluate('document.fonts.ready.then(()=>true)');await page.wait('[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0&&r.left<innerWidth&&r.right>0}).every(i=>i.complete&&i.naturalWidth>0)',30000);await delay(1250);}
for(const snapshot of snapshots){
 const season=snapshot.season.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const entity=snapshot.entities.find(e=>e.name==='América de Cali')??snapshot.entities[0];
 for(const locale of before?['en']:['en','mx','br'])for(const kind of ['competition','entity'])for(const theme of ['light','dark'])for(const width of before?[390,1440]:locale==='en'&&kind==='competition'?[320,360,375,390,430,768,1440]:[390,1440]){
  const base=`/${locale}/${locale==='en'?'sports':locale==='br'?'esportes':'deportes'}/${snapshot.sport}/${snapshot.competitionId}`,path=kind==='entity'?`${base}/season/${season}/entities/${encodeURIComponent(entity.id)}`:base;
  await visit(path,width,theme);if(!before){assert.equal(await page.evaluate('!!document.querySelector(".cx-experience")'),true);const expectedRows=kind==='entity'?snapshot.tables.reduce((n,t)=>n+t.rows.filter(r=>r.entityId===entity.id).length,0):snapshot.tables.reduce((n,t)=>n+t.rows.length,0);assert.equal(await page.evaluate('document.querySelectorAll(".ms-table tbody tr").length'),expectedRows);assert.ok(await page.evaluate(`document.body.innerText.includes(${JSON.stringify(snapshot.observedAt.slice(0,10))})`));
   const meta=await page.evaluate('({canonical:document.querySelector("link[rel=canonical]")?.href,lang:document.documentElement.lang,robots:document.querySelector("meta[name=robots]")?.content})');assert.equal(meta.canonical,'https://livasports.com'+path);assert.ok(meta.lang.startsWith(locale==='mx'?'es':locale==='br'?'pt':'en'));
  }
  const file=`${dir}/${snapshot.competitionId}-${kind}-${locale}-${theme}-${width}.png`;const layout=await page.screenshot(file);assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);cases.push({path,theme,width,file,layout});
 }
}
if(!before){await visit('/en/sports/ice-hockey/nhl',390,'light');await page.evaluate('[...document.querySelectorAll(".cx-filters button")].find(b=>b.textContent==="Western").click()');assert.equal(await page.evaluate('[...document.querySelectorAll(".cx-conference")].filter(x=>!x.hidden).length'),1);assert.equal(await page.evaluate('document.querySelector(".cx-conference:not([hidden])").getAttribute("aria-label")'),'Western');
const anchor=await page.evaluate('document.querySelector(".cx-team-card").getAttribute("href")');await visit(anchor,390,'light');assert.ok(await page.evaluate('!!document.querySelector(".cx-record")'));
}
assert.equal(page.metrics.providers,0);assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);await writeFile(dir+'/evidence.json',JSON.stringify({at:new Date().toISOString(),origin,before,cases,metrics:page.metrics,conferenceFilter:!before},null,2));console.log(JSON.stringify({passed:true,cases:cases.length,directory:dir}));
}finally{await browser.close();}
