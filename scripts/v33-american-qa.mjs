import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const origin=process.env.V33_QA_ORIGIN??'http://localhost:3351';assert.ok(['http://localhost:3351','https://livasports.com'].includes(origin));
const mode=origin.includes('localhost')?'local':'production',dir=`output/v3-qa/v33/american/${mode}`;await mkdir(dir,{recursive:true});
const qa=await browserQA(),cases=[];
try{
 const page=await qa.newPage();await page.c.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});"});
 async function visit(path,width,theme){await page.viewport(width,width===1440?1000:844);await page.evaluate('window.__old=true');await page.c.send('Page.navigate',{url:origin+path});await page.wait('!window.__old&&document.readyState==="complete"&&!!document.querySelector("main")',60000);await page.evaluate(`localStorage.setItem('livasports:theme',${JSON.stringify(theme)});document.documentElement.dataset.theme=${JSON.stringify(theme)};window.dispatchEvent(new Event('livasports:theme-change'))`);await page.evaluate('document.fonts.ready.then(()=>true)');await delay(150);}
 for(const id of ['mlb','nfl','nhl']){
  const s=(await(await fetch(origin+'/api/public/sports/snapshots/'+id)).json()).snapshot;assert.equal(s.entities.length,id==='mlb'?30:32);if(id==='nhl')assert.ok(s.observedAt.startsWith('2026-10-20'));
  for(const locale of ['en','mx','br'])for(const width of locale==='en'?[320,390,430,1440]:[390])for(const theme of ['light','dark']){
   const path=`/${locale}/${locale==='en'?'sports':locale==='br'?'esportes':'deportes'}/${s.sport}/${id}`;await visit(path,width,theme);
   assert.equal(await page.evaluate('document.querySelectorAll(".ax-experience").length'),1);assert.equal(await page.evaluate('document.querySelectorAll(".bk-club").length'),s.entities.length);assert.equal(await page.evaluate('document.querySelectorAll(".ms-table tbody tr").length'),s.entities.length);
   const file=`${dir}/${id}-${locale}-${theme}-${width}.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false,path);assert.equal(layout.brokenImages,0);
   assert.equal(await page.evaluate('document.querySelector("link[rel=canonical]").href'),'https://livasports.com'+path);
   if(locale==='en'&&width===390){const full=await page.c.send('Page.getLayoutMetrics');const shot=await page.c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height:full.cssContentSize.height,scale:1}});await writeFile(`${dir}/${id}-${theme}-full.png`,Buffer.from(shot.data,'base64'));
    await page.evaluate('document.querySelectorAll(".cx-filters button")[1].click()');await delay(100);assert.equal(await page.evaluate('document.querySelectorAll(".cx-conference:not([hidden]) .ms-table tbody tr").length'),id==='mlb'?15:16);
    await page.evaluate(`document.querySelector('.bk-directory select').selectedIndex=1;document.querySelector('.bk-directory select').dispatchEvent(new Event('change',{bubbles:true}))`);await delay(100);assert.ok(await page.evaluate('document.querySelectorAll(".bk-club").length')<s.entities.length);
    await page.evaluate(`document.getElementById('standings').scrollIntoView({block:'start',behavior:'instant'})`);await page.screenshot(`${dir}/${id}-${theme}-standings.png`);
   }
   cases.push({path,width,theme,file,layout});
  }
  for(const locale of ['en','mx','br'])for(const theme of ['light','dark']){
   const token=s.season.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
   const path=`/${locale}/${locale==='en'?'sports':locale==='br'?'esportes':'deportes'}/${s.sport}/${id}/season/${token}/entities/${s.entities[0].id}`;await visit(path,390,theme);assert.equal(await page.evaluate('document.querySelector("h1").textContent'),s.entities[0].name);assert.equal(await page.evaluate('document.querySelectorAll(".ms-table tbody tr").length'),1);const file=`${dir}/${id}-profile-${locale}-${theme}.png`,layout=await page.screenshot(file);assert.equal(layout.overflow,false);cases.push({path,width:390,theme,file,layout});
  }
 }
 assert.equal(page.metrics.providers,0);assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);
 await writeFile(dir+'/browser.json',JSON.stringify({at:new Date().toISOString(),origin,cases,metrics:page.metrics,filtersVerified:true},null,2));
 await writeFile(dir+'/review.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>American sports · ${mode}</title><style>body{font:16px system-ui;background:#edf2ef;color:#16352b;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}figure{margin:0}img{max-width:100%;border:1px solid #abc}</style><h1>American sports · ${mode}</h1><p>NFL: result cutoff unconfirmed. MLB: regular-season archive, not postseason. NHL: preserved 20 October snapshot.</p><div class="grid">${cases.filter(c=>c.width===390&&c.path.startsWith('/en')).map(c=>`<figure><figcaption>${c.path} · ${c.theme}</figcaption><img loading="lazy" src="${c.file.split('/').at(-1)}"></figure>`).join('')}</div></html>`);
 console.log(JSON.stringify({passed:true,cases:cases.length,providerRequests:0,dir}));
}finally{await qa.close();}
