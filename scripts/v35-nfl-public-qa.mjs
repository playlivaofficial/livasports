/** Only inspect the publicly published local honor story, never private review drafts. */
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {browserQA} from './browser-qa-driver.mjs';
const slug='announcement-ca75eeec71daa7d22202ce77',origin='http://localhost:3351',dir='output/v3-qa/v35/newsroom/public';
await mkdir(dir,{recursive:true});const qa=await browserQA(),cases=[];
try{
 const page=await qa.newPage(390,844);
 for(const locale of ['en','mx','br']){
  const path=`/${locale}/${locale==='en'?'news':'noticias'}/${slug}`;
  const response=await fetch(origin+path);assert.equal(response.status,200);
  const html=await response.text();assert.ok(html.includes('Larry Fitzgerald'));assert.ok(html.includes('https://livasports.com'+path));
  await page.evaluate('window.old=true');await page.c.send('Page.navigate',{url:origin+path});
  await page.wait('!window.old&&document.readyState==="complete"&&!!document.querySelector("main")',60000);
  assert.ok(await page.evaluate('document.querySelector("main").innerText.includes("Larry Fitzgerald")'));
  assert.ok(await page.evaluate('[...document.querySelectorAll("main a")].some(a=>a.href.includes("azcardinals.com/news/"))'));
  for(const theme of ['light','dark']){
   await page.evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
   const file=`${dir}/${locale}-${theme}-390.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);
   cases.push({path,theme,file,canonical:true,sourceAttribution:true});
  }
  const home=await fetch(origin+'/'+locale);assert.equal(home.status,200);assert.ok((await home.text()).includes(slug),'HOMEPAGE_PUBLICATION_MISSING');
 }
 await page.viewport(1440,1000);await page.evaluate('window.old=true');await page.c.send('Page.navigate',{url:origin+'/en'});
 await page.wait('!window.old&&document.readyState==="complete"&&!!document.querySelector("main")',60000);
 assert.ok(await page.evaluate(`!!document.querySelector('main a[href*="${slug}"]')`));
 await page.screenshot(dir+'/homepage-1440.png');
 assert.equal(page.metrics.providers,0);assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);
 await writeFile(dir+'/acceptance.json',JSON.stringify({at:new Date().toISOString(),cases,homepageAllLanguages:true,metrics:page.metrics},null,2));console.log(JSON.stringify({cases:cases.length,homepageAllLanguages:true,modelCalls:0}));
}finally{await qa.close();}
