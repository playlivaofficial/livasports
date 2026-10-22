// Public local application only; isolated browser, no Owner cookies.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const directory='output/v3-qa/acceptance-2026-10-22/news-visual-article-refresh';
const slug='announcement-7d5e8ce810e3fb0372ae7765';
const browser=await browserQA(),evidence=[];
try{
 const page=await browser.newPage();
 for(const [name,path] of [['home','/en'],['dimayor','/en/news/'+slug]]){
  for(const [width,theme] of [[390,'light'],[390,'dark'],[1440,'light']]){
   await page.viewport(width,width===1440?1000:844);
   // V3 has no retired My Slip trigger: wait for the actual page document.
   await page.evaluate('window.__qaOldDocument=true');
   await page.c.send('Page.navigate',{url:'http://localhost:3351'+path});
   await page.wait('!window.__qaOldDocument && document.readyState==="complete" && !!document.querySelector("main")',60000);
   await page.evaluate(`document.documentElement.setAttribute('data-theme',${JSON.stringify(theme)})`);
   await delay(800);
   assert.ok(await page.evaluate(`document.body.innerText.includes('América de Cali')`));
   const file=`${directory}/${name}-${theme}-${width}.png`;
   const layout=await page.screenshot(file);
   assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);
   evidence.push({name,path,width,theme,file,layout});
  }
 }
 assert.equal(page.metrics.providers,0);assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);
 await mkdir(directory,{recursive:true});
 await writeFile(directory+'/evidence.json',JSON.stringify({at:new Date().toISOString(),evidence,metrics:page.metrics},null,2));
}finally{await browser.close();}
