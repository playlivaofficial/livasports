// Public local app only. No login, private drafts, model calls or mutations.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {browserQA,delay} from './browser-qa-driver.mjs';
const origin=process.env.V3_QA_ORIGIN??'http://localhost:3351';
assert.ok(origin==='http://localhost:3351'||origin==='https://livasports.com'||/^https:\/\/livasports-[a-z0-9]+-nikapopkha3-4447s-projects\.vercel\.app$/.test(origin),'Only the existing LivaSports app may be tested');
const dir=`output/v3-qa/acceptance-2026-10-23/${origin.includes('localhost')?'nfl-editorial':origin==='https://livasports.com'?'production':'staged'}`;
await mkdir(dir,{recursive:true});
const browser=await browserQA(),evidence=[];
try{
 const page=await browser.newPage();
 if(origin.endsWith('.vercel.app')){
  // Official CLI uses authorized deployment protection access. Keep its returned
  // host-scoped cookie in memory; never save headers, tokens, or a browser profile.
  assert.ok(process.env.V3_QA_VERCEL_CLI,'Official Vercel CLI path required');
  const result=spawnSync(process.execPath,[process.env.V3_QA_VERCEL_CLI,'curl','/api/internal/health','--deployment',origin,'--scope','nikapopkha3-4447s-projects','--','--silent','--show-error','--dump-header','-','--header','x-vercel-set-bypass-cookie: true'],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(result.status,0,'Deployment authorization failed');
  const cookies=[...result.stdout.matchAll(/^set-cookie:\s*([^=;\r\n]+)=([^;\r\n]*)/gim)];
  assert.ok(cookies.length,'Deployment did not issue a scoped browser cookie');
  for(const [,name,value] of cookies)await page.c.send('Network.setCookie',{name,value,url:origin,secure:true,httpOnly:true});
 }
 for(const [locale,sports,news] of [['en','sports','news'],['mx','deportes','noticias'],['br','esportes','noticias']]){
  for(const [name,path] of [['home',`/${locale}`],['article',`/${locale}/${news}/announcement-7d5e8ce810e3fb0372ae7765`],['colombia',`/${locale}/${sports}/football/colombia-primera-a`],['nhl',`/${locale}/${sports}/ice-hockey/nhl`],['nfl',`/${locale}/${sports}/american-football/nfl`]]){
   for(const theme of ['light','dark']){
    await page.viewport(390,844);await page.evaluate('window.__oldDocument=true');
    await page.c.send('Page.navigate',{url:origin+path});
    await page.wait('!window.__oldDocument && document.readyState==="complete" && !!document.querySelector("main")',60000);
    await page.evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);await delay(250);
    if(name==='colombia'){assert.equal(await page.evaluate('document.querySelectorAll(".ms-table tbody tr").length'),20);assert.ok(await page.evaluate('!!document.querySelector(".sw-table-help")'));}
    if(name==='nhl'){assert.equal(await page.evaluate('document.querySelectorAll(".ms-table tbody tr").length'),32);assert.equal(await page.evaluate('document.querySelectorAll(".ms-table").length'),4);assert.ok(await page.evaluate('document.body.innerText.includes("2026-10-20")'));}
    if(name==='article')assert.ok(await page.evaluate('document.querySelector(".ed-article-byline").innerText.includes("DIMAYOR")'));
    const file=`${dir}/${name}-${locale}-${theme}-390.png`,layout=await page.screenshot(file);
    assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);evidence.push({path,theme,width:390,file,layout});
   }
  }
 }
 for(const width of [320,360,375,430])for(const locale of ['en','mx','br'])for(const theme of ['light','dark']){
  await page.viewport(width,844);await page.evaluate('window.__oldDocument=true');
  await page.c.send('Page.navigate',{url:origin+'/'+locale});
  await page.wait('!window.__oldDocument && document.readyState==="complete" && !!document.querySelector("main")',60000);
  await page.evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);await delay(250);
  const file=`${dir}/home-${locale}-${theme}-${width}.png`,layout=await page.screenshot(file);
  assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);evidence.push({path:'/'+locale,theme,width,file,layout});
 }
 for(const theme of ['light','dark']){
  await page.viewport(1440,1000);await page.evaluate('window.__oldDocument=true');await page.c.send('Page.navigate',{url:origin+'/en'});
  await page.wait('!window.__oldDocument && document.readyState==="complete" && !!document.querySelector("main")',60000);
  await page.evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);await delay(250);
  const file=`${dir}/home-en-${theme}-1440.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false);evidence.push({path:'/en',theme,width:1440,file,layout});
 }
 assert.deepEqual(page.metrics.errors,[]);assert.equal(page.metrics.providers,0);
 await writeFile(dir+'/evidence.json',JSON.stringify({at:new Date().toISOString(),evidence,metrics:page.metrics,nflPublishedArticleAvailable:false},null,2));
}finally{await browser.close();}
