import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const origin=process.env.V34_QA_ORIGIN??'http://localhost:3351';assert.ok(['http://localhost:3351','https://livasports.com'].includes(origin));
const production=origin.startsWith('https:'),dir=`output/v3-qa/v34/${production?'production':'local'}/browser`;await mkdir(dir,{recursive:true});
const qa=await browserQA(),cases=[];
try{
 const page=await qa.newPage();
 async function visit(path,width,theme){await page.viewport(width,width===1440?1000:844);await page.evaluate('window.__old=true');await page.c.send('Page.navigate',{url:origin+path});await page.wait('!window.__old&&document.readyState==="complete"&&!!document.querySelector("main")',60000);await page.evaluate(`localStorage.setItem('livasports:theme',${JSON.stringify(theme)});document.documentElement.dataset.theme=${JSON.stringify(theme)};window.dispatchEvent(new Event('livasports:theme-change'))`);await page.evaluate('document.fonts.ready.then(()=>true)');await delay(200);}
 for(const locale of ['en','mx','br'])for(const width of locale==='en'?[390,1440]:[390])for(const theme of ['light','dark'])for(const id of ['nfl','nhl','directory']){
  const ns=locale==='en'?'sports':locale==='br'?'esportes':'deportes';const path=`/${locale}/${ns}`+(id==='directory'?'':id==='nfl'?'/american-football/nfl':'/ice-hockey/nhl');await visit(path,width,theme);
  if(id!=='directory'){assert.equal(await page.evaluate('document.querySelectorAll(".ms-table tbody tr").length'),32);assert.ok(await page.evaluate('document.body.innerText.includes("2026")'));}
  if(id==='nhl')assert.equal(await page.evaluate('Array.from(document.querySelectorAll(".ms-table th")).some(x=>x.textContent.trim()==="RW")'),false);
  if(id==='directory')assert.ok(await page.evaluate('document.querySelectorAll(".ms-competition-card footer time").length')>=11);
  assert.equal(await page.evaluate('Array.from(document.links).some(a=>a.getAttribute("href")?.startsWith("/go/"))'),false);
  const file=`${dir}/${id}-${locale}-${theme}-${width}.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);cases.push({path,width,theme,file,layout});
 }
 // Authenticate normally; never copy a browser profile, signing secret, or existing session.
 const secretText=await readFile(production?'../../output/hardening-owner-permanent-key.txt':'output/v3-qa/acceptance-2026-10-21/local-owner-key.txt','utf8');
 const key=production?secretText.match(/^PERMANENT_OWNER_KEY=(.+)$/m)?.[1].trim():secretText.trim();assert.ok(key);
 await visit('/owner/sports',1440,'light');
 assert.equal(await page.evaluate('Array.from(document.querySelectorAll("section")).some(x=>x.getAttribute("aria-label")==="Operational sports coverage")'),false);
 const status=await page.evaluate(`fetch('/api/owner/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',key:${JSON.stringify(key)}})}).then(r=>r.status)`);assert.equal(status,200);
 await visit('/owner/sports',1440,'light');assert.equal(await page.evaluate('Array.from(document.querySelectorAll("section")).some(x=>x.getAttribute("aria-label")==="Operational sports coverage")'),true);
 const coverage=await page.evaluate("fetch('/api/owner/sports').then(async r=>({status:r.status,cache:r.headers.get('cache-control'),coverage:(await r.json()).coverage}))");
 assert.equal(coverage.status,200);assert.match(coverage.cache,/private.*no-store/);assert.equal(coverage.coverage.length,64);assert.equal(coverage.coverage.find(r=>r.competitionId==='nhl').tableRows,32);
 await page.screenshot(`${dir}/owner-coverage-1440.png`);await page.evaluate("fetch('/api/owner/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})})");
 assert.equal(await page.evaluate("fetch('/api/owner/sports').then(r=>r.status)"),401);
 const errors=page.metrics.errors;assert.equal(errors.length,0);assert.equal(page.metrics.providers,0);assert.equal(page.metrics.failed.length,0);
 const result={at:new Date().toISOString(),origin,cases,owner:{normalLogin:true,privateNoStore:true,unauthorizedRejected:true,logout:true,coverage:coverage.coverage},runtimeErrors:errors,providerRequests:page.metrics.providers};await writeFile(`${dir}/acceptance.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({origin,cases:cases.length,ownerPassed:true,providerRequests:0,runtimeErrors:0}));
}finally{await qa.close();}
