import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const origin=process.env.V33_QA_ORIGIN??'http://localhost:3351';assert.ok(['http://localhost:3351','https://livasports.com'].includes(origin));
const mode=origin.includes('localhost')?'local':'production',dir=`output/v3-qa/v33/basketball/${mode}`;await mkdir(dir,{recursive:true});
const qa=await browserQA(),cases=[];
try{const page=await qa.newPage();await page.c.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});"});
 async function visit(path,width,theme){await page.viewport(width,width===1440?1000:844);await page.evaluate('window.__old=true');await page.c.send('Page.navigate',{url:origin+path});await page.wait('!window.__old&&document.readyState==="complete"&&!!document.querySelector("main")',60000);await page.evaluate(`localStorage.setItem('livasports:theme',${JSON.stringify(theme)});document.documentElement.dataset.theme=${JSON.stringify(theme)};window.dispatchEvent(new Event('livasports:theme-change'))`);await page.evaluate('document.fonts.ready.then(()=>true)');await delay(300);}
 const routes=['nba','euroleague'];
 for(const id of routes)for(const locale of ['en','mx','br'])for(const width of locale==='en'?[320,390,430,1440]:[390])for(const theme of ['light','dark']){
  const path=`/${locale}/${locale==='en'?'sports':locale==='br'?'esportes':'deportes'}/basketball/${id}`;await visit(path,width,theme);
  assert.equal(await page.evaluate('document.querySelectorAll(".bk-experience").length'),1);
  assert.equal(await page.evaluate('document.querySelectorAll(".bk-club").length'),id==='nba'?30:20);
  assert.equal(await page.evaluate('document.querySelectorAll(".ms-table tbody tr").length'),id==='nba'?0:20);
  assert.equal(await page.evaluate('[...document.links].filter(a=>a.pathname.startsWith(String.fromCharCode(47)+"go"+String.fromCharCode(47))).length'),0);
  const file=`${dir}/${id}-${locale}-${theme}-${width}.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false,path);assert.equal(layout.brokenImages,0);
  const metadata=await page.evaluate('({canonical:document.querySelector("link[rel=canonical]")?.href,lang:document.documentElement.lang})');assert.equal(metadata.canonical,'https://livasports.com'+path);assert.ok(metadata.lang.startsWith(locale==='en'?'en':locale==='br'?'pt':'es'));
  if(id==='nba'&&width===390){await page.evaluate(`document.querySelector('.bk-directory select').value='Atlantic';document.querySelector('.bk-directory select').dispatchEvent(new Event('change',{bubbles:true}))`);await delay(100);assert.equal(await page.evaluate('document.querySelectorAll(".bk-club").length'),5);await page.evaluate(`const input=document.querySelector('.bk-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Boston');input.dispatchEvent(new Event('input',{bubbles:true}));`);await delay(100);assert.equal(await page.evaluate('document.querySelectorAll(".bk-club").length'),1);}
  if(locale==='en'&&width===390){
   // Restore filters before capturing the complete real page.
   await visit(path,width,theme);
   const {cssContentSize}=await page.c.send('Page.getLayoutMetrics');assert.ok(cssContentSize.height<15000);
   const full=await page.c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height:cssContentSize.height,scale:1}});
   await writeFile(`${dir}/${id}-${theme}-full.png`,Buffer.from(full.data,'base64'));
   for(const section of ['standings','competitors','postseason']){await page.evaluate(`document.getElementById('${section}').scrollIntoView({block:'start',behavior:'instant'})`);await delay(100);await page.screenshot(`${dir}/${id}-${theme}-${section}.png`);}
  }
  cases.push({path,width,theme,file,layout,metadata});
 }
 const s=(await(await fetch(origin+'/api/public/sports/snapshots/euroleague')).json()).snapshot;assert.equal(s.observedAt,'2026-10-23');
 for(const locale of ['en','mx','br'])for(const theme of ['light','dark']){const path=`/${locale}/${locale==='en'?'sports':locale==='br'?'esportes':'deportes'}/basketball/euroleague/season/2026-27/entities/${s.entities[0].id}`;await visit(path,390,theme);assert.equal(await page.evaluate('document.querySelector("h1").textContent'),s.entities[0].name);assert.equal(await page.evaluate('document.querySelectorAll(".ms-table tbody tr").length'),1);const file=`${dir}/euroleague-club-${locale}-${theme}.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false);cases.push({path,width:390,theme,file,layout});}
 assert.equal(page.metrics.providers,0);assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);
 await writeFile(dir+'/browser.json',JSON.stringify({at:new Date().toISOString(),origin,cases,metrics:page.metrics,nbaCandidateUnpublished:true,filtersVerified:true},null,2));
 await writeFile(dir+'/review.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Basketball · actual ${mode} review</title><style>body{font:16px system-ui;background:#edf2ef;color:#16352b;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}figure{margin:0}img{max-width:100%;border:1px solid #abc}figcaption{padding:12px}</style><h1>Basketball · ${mode}</h1><p>EuroLeague: 20 reviewed clubs, dated 23 October 2026. NBA: verified 30-franchise directory; conflicting standings remain unpublished. No invented postseason bracket.</p><div class="grid">${cases.filter(c=>c.width===390).map(c=>`<figure><figcaption>${c.path} · ${c.theme}</figcaption><img loading="lazy" src="${c.file.split('/').at(-1)}"></figure>`).join('')}</div></html>`);
 console.log(JSON.stringify({passed:true,cases:cases.length,providerRequests:0,dir}));
}finally{await qa.close();}
