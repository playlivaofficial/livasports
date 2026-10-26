import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const origin=process.env.V34_QA_ORIGIN??'http://localhost:3351';assert.ok(['http://localhost:3351','https://livasports.com'].includes(origin));
const production=origin.startsWith('https:'),dir=`output/v3-qa/v34/${production?'production':'local'}/context`;await mkdir(dir,{recursive:true});
const stories=[{id:'dimayor',slug:'announcement-7d5e8ce810e3fb0372ae7765',selector:'.sw-club-context',entity:'América de Cali'},...production?[]:[{id:'nfl',slug:'announcement-5f37cb99b94aed894e27c050',selector:'.ed-sports-context',entity:'Arizona Cardinals'}]];
const qa=await browserQA(),cases=[];
try{
 const page=await qa.newPage();
 for(const story of stories)for(const locale of ['en','mx','br'])for(const width of locale==='en'?[390,1440]:[390])for(const theme of ['light','dark']){
  await page.viewport(width,width===1440?1000:844);await page.evaluate('window.__previous=true');const path=`/${locale}/${locale==='en'?'news':'noticias'}/${story.slug}`;
  await page.c.send('Page.navigate',{url:origin+path});await page.wait(`!window.__previous&&document.readyState==='complete'&&!!document.querySelector(${JSON.stringify(story.selector)})`,60000);
  await page.evaluate(`localStorage.setItem('livasports:theme',${JSON.stringify(theme)});document.documentElement.dataset.theme=${JSON.stringify(theme)};document.querySelector(${JSON.stringify(story.selector)}).scrollIntoView({block:'center'})`);await delay(300);
  assert.ok(await page.evaluate(`document.querySelector(${JSON.stringify(story.selector)}).innerText.includes(${JSON.stringify(story.entity)})`));
  const links=await page.evaluate(`Array.from(document.querySelector(${JSON.stringify(story.selector)}).querySelectorAll('a')).map(a=>a.getAttribute('href'))`);assert.ok(links.some(h=>h.startsWith('/'+locale+'/')&&h.includes('/entities/')));assert.ok(links.every(h=>!h.startsWith('/go/')));
  if(story.id==='nfl'){assert.equal(await page.evaluate("document.querySelector('.ed-match-identities a').dataset.artwork"),'text-only');assert.equal(await page.evaluate("document.querySelectorAll('.ed-match-identities img').length"),0);}
  const file=`${dir}/${story.id}-${locale}-${theme}-${width}.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false);assert.equal(layout.brokenImages,0);cases.push({path,width,theme,links,file});
 }
 assert.equal(page.metrics.providers,0);assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);
 const report={at:new Date().toISOString(),origin,cases,providerRequests:0,runtimeErrors:0};await writeFile(`${dir}/acceptance.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({origin,cases:cases.length,passed:true}));
}finally{await qa.close();}
