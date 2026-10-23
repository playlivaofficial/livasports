// Public local app only. No login, private drafts, model calls or mutations.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const dir='output/v3-qa/acceptance-2026-10-23/nfl-editorial',browser=await browserQA(),evidence=[];
try{
 const page=await browser.newPage();
 for(const [locale,sports,news] of [['en','sports','news'],['mx','deportes','noticias'],['br','esportes','noticias']]){
  for(const [name,path] of [['home',`/${locale}`],['article',`/${locale}/${news}/announcement-7d5e8ce810e3fb0372ae7765`],['colombia',`/${locale}/${sports}/football/colombia-primera-a`],['nfl',`/${locale}/${sports}/american-football/nfl`]]){
   for(const theme of ['light','dark']){
    await page.viewport(390,844);await page.evaluate('window.__oldDocument=true');
    await page.c.send('Page.navigate',{url:'http://localhost:3351'+path});
    await page.wait('!window.__oldDocument && document.readyState==="complete" && !!document.querySelector("main")',60000);
    await page.evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);await delay(250);
    if(name==='colombia'){assert.equal(await page.evaluate('document.querySelectorAll(".ms-table tbody tr").length'),20);assert.ok(await page.evaluate('!!document.querySelector(".sw-table-help")'));}
    if(name==='article')assert.ok(await page.evaluate('document.querySelector(".ed-article-byline").innerText.includes("DIMAYOR")'));
    const file=`${dir}/${name}-${locale}-${theme}-390.png`,layout=await page.screenshot(file);
    assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);evidence.push({path,theme,width:390,file,layout});
   }
  }
 }
 for(const theme of ['light','dark']){
  await page.viewport(1440,1000);await page.evaluate('window.__oldDocument=true');await page.c.send('Page.navigate',{url:'http://localhost:3351/en'});
  await page.wait('!window.__oldDocument && document.readyState==="complete" && !!document.querySelector("main")',60000);
  await page.evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);await delay(250);
  const file=`${dir}/home-en-${theme}-1440.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false);evidence.push({path:'/en',theme,width:1440,file,layout});
 }
 assert.deepEqual(page.metrics.errors,[]);assert.equal(page.metrics.providers,0);
 await writeFile(dir+'/evidence.json',JSON.stringify({at:new Date().toISOString(),evidence,metrics:page.metrics,nflPublishedArticleAvailable:false},null,2));
}finally{await browser.close();}
