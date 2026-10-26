import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const origin=process.env.V35_QA_ORIGIN??'http://localhost:3351';assert.ok(['http://localhost:3351','https://livasports.com'].includes(origin));
const dir='output/v3-qa/v35/'+(origin.startsWith('https:')?'production':'local')+'/identities';await mkdir(dir,{recursive:true});
const qa=await browserQA(),cases=[];
try{const page=await qa.newPage();
 await page.c.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});"});
 for(const locale of ['en','mx','br'])for(const width of locale==='en'?[320,390,1440]:[390])for(const theme of ['light','dark']){
  const path=`/${locale}/${locale==='en'?'sports':locale==='mx'?'deportes':'esportes'}/basketball/nba`;
  await page.viewport(width,width<=390?844:1000);await page.evaluate('window.__old=true');await page.c.send('Page.navigate',{url:origin+path});await page.wait('!window.__old&&document.readyState==="complete"&&document.querySelectorAll(".ms-table tbody tr").length===30',60000);
  await page.evaluate(`localStorage.setItem('livasports:theme',${JSON.stringify(theme)});document.documentElement.dataset.theme=${JSON.stringify(theme)};window.dispatchEvent(new Event('livasports:theme-change'));`);
  const found=await page.evaluate('Array.from(document.querySelectorAll("[data-identity]")).map(x=>x.dataset.identity)');
  for(const id of ['lakers','nets']){assert.equal(found.filter(x=>x===id).length,2);}
  assert.equal(await page.evaluate('document.querySelectorAll("[data-source-order]").length'),1);
  if(locale==='en')for(const id of ['lakers','nets']){
   await page.evaluate(`document.querySelector('.ms-table [data-identity="${id}"]').closest('tr').scrollIntoView({block:'center',behavior:'instant'})`);await delay(150);
   await page.wait(`Array.from(document.querySelectorAll('.ms-table [data-identity="${id}"] img')).every(x=>x.complete&&x.naturalWidth>0)`);
   const file=`${dir}/table-${id}-${theme}-${width}.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);
  }
  const href=await page.evaluate('document.querySelector(".bk-club [data-identity=lakers]").closest("a").getAttribute("href")');
  await page.evaluate('document.querySelector(".bk-club [data-identity=lakers]").closest("a").click()');await page.wait(`location.pathname===${JSON.stringify(href)}&&!!document.querySelector('.bk-profile')`,60000);
  await page.wait('document.querySelector(".bk-title [data-identity=lakers] img")?.naturalWidth>0');
  await page.evaluate('document.fonts.ready.then(()=>true)');
  assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('.cx-record dt,.cx-record dd')).every(element=>{const range=document.createRange();range.selectNodeContents(element);const text=range.getBoundingClientRect(),cell=element.parentElement.getBoundingClientRect();return text.left>=cell.left&&text.right<=cell.right;})`),true,'Profile statistic text must stay within its own cell');
  assert.ok(await page.evaluate('document.querySelector("h1").textContent==="Los Angeles Lakers"'));assert.equal(await page.evaluate(`document.querySelectorAll('a[href^="/go/"]').length`),0);
  const file=`${dir}/profile-${locale}-${theme}-${width}.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);cases.push({path,profile:href,width,theme,file,layout});
 }
 assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);assert.equal(page.metrics.providers,0);
 await writeFile(dir+'/acceptance.json',JSON.stringify({at:new Date().toISOString(),origin,cases,errors:[],providerRequests:0},null,2));console.log(JSON.stringify({origin,cases:cases.length,errors:0,providerRequests:0}));
}finally{await qa.close();}
