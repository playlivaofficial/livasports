import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const origin=process.env.V35_QA_ORIGIN??'http://localhost:3351';assert.ok(['http://localhost:3351','https://livasports.com'].includes(origin));
const dir='output/v3-qa/v35/'+(origin.startsWith('https:')?'production':'local')+'/browser';await mkdir(dir,{recursive:true});const qa=await browserQA(),cases=[];
try{const page=await qa.newPage();
 await page.c.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});"});
 for(const locale of ['en','mx','br'])for(const width of locale==='en'?[390,1440]:[390])for(const theme of ['light','dark']){
  const path=`/${locale}/${locale==='en'?'sports':locale==='mx'?'deportes':'esportes'}/basketball/nba`;
  await page.viewport(width,width===390?844:1000);await page.evaluate('window.__old=true');await page.c.send('Page.navigate',{url:origin+path});await page.wait('!window.__old&&document.readyState==="complete"&&document.querySelectorAll(".ms-table tbody tr").length===30',60000);
  await page.evaluate(`localStorage.setItem('livasports:theme',${JSON.stringify(theme)});document.documentElement.dataset.theme=${JSON.stringify(theme)};window.dispatchEvent(new Event('livasports:theme-change'));`);await page.evaluate('document.fonts.ready.then(()=>true)');await delay(200);
  assert.equal(await page.evaluate('document.querySelectorAll("[data-source-order]").length'),1);assert.equal(await page.evaluate('document.querySelectorAll(".bk-club[href]").length'),30);
  assert.ok(await page.evaluate('document.body.innerText.includes("2026-10-26")'));assert.equal(await page.evaluate('Array.from(document.links).some(a=>a.getAttribute("href")?.startsWith("/go/"))'),false);
  const file=`${dir}/nba-${locale}-${theme}-${width}.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);
  cases.push({path,width,theme,file,rows:30,sourceOrderLabel:true,layout});
  if(locale==='en'){await page.evaluate('document.querySelector(".ms-table-card").scrollIntoView({block:"start",behavior:"instant"})');await delay(150);const tableLayout=await page.screenshot(`${dir}/nba-table-${theme}-${width}.png`);assert.equal(tableLayout.overflow,false);}
  if(locale==='en'&&width===390){const href=await page.evaluate('document.querySelector(".ms-entity").getAttribute("href")');await page.evaluate('document.querySelector(".ms-entity").click()');await page.wait(`location.pathname===${JSON.stringify(href)}&&!!document.querySelector('.bk-profile')`,60000);assert.ok(await page.evaluate('document.body.innerText.includes("Detroit Pistons")'));const profile=await page.screenshot(`${dir}/nba-detroit-${theme}-390.png`);assert.equal(profile.overflow,false);}
 }
 assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);assert.equal(page.metrics.providers,0);
 const report={at:new Date().toISOString(),origin,cases,canonicalProfilesPassed:2,errors:[],providerRequests:0};await writeFile(dir+'/nba-acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify({origin,cases:cases.length,canonicalProfilesPassed:2,errors:0,providerRequests:0}));
}finally{await qa.close();}
