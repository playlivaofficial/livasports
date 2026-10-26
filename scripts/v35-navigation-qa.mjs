import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const origin=process.env.V35_QA_ORIGIN??'https://livasports.com';assert.ok(['https://livasports.com','http://localhost:3351'].includes(origin));
const phase=process.argv[2];assert.ok(['before','after','local'].includes(phase));const out='output/v3-qa/v35/performance';await mkdir(out,{recursive:true});
const qa=await browserQA(),cases=[];
try{for(const path of ['/en/sports/american-football/nfl','/en/sports/football/bundesliga']){
 const page=await qa.newPage(390,844),requests=[];let bytes=0;
 await page.c.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});"});
 page.c.on('Network.requestWillBeSent',e=>{const u=new URL(e.request.url);if(u.origin===origin)requests.push({path:u.pathname,rsc:u.searchParams.has('_rsc'),prefetch:e.request.headers['Next-Router-Prefetch']==='1'||e.request.headers['next-router-prefetch']==='1'});});
 page.c.on('Network.loadingFinished',e=>{bytes+=e.encodedDataLength;});
 const start=Date.now();await page.c.send('Page.navigate',{url:origin+path});await page.wait('document.readyState==="complete"&&!!document.querySelector(".ms-table")',60000);
 const loadedMs=Date.now()-start;
 for(let y=0;y<12000;y+=700){await page.evaluate(`scrollTo(0,${y})`);await delay(180);if(requests.filter(r=>r.rsc).length>100)throw Error('QA_REQUEST_BOUND_EXCEEDED');if(await page.evaluate('scrollY+innerHeight>=document.documentElement.scrollHeight'))break;}
 await delay(1200);const browsing={requests:requests.length,rsc:requests.filter(r=>r.rsc).length,prefetch:requests.filter(r=>r.prefetch).length,encodedBytes:bytes,loadedMs};
 const href=await page.evaluate("document.querySelector('.ms-entity').getAttribute('href')");assert.ok(href.includes('/entities/'));console.log(JSON.stringify({phase,path,browsing}));await page.evaluate("document.querySelector('.ms-entity').click()");await page.wait(`location.pathname===${JSON.stringify(href)}&&!!document.querySelector('.cx-profile,.ax-profile')`,60000);
 assert.equal(page.metrics.providers,0);assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);
 cases.push({path,browsing,clickedCanonicalEntity:href,clickPassed:true});await page.c.send('Page.navigate',{url:'about:blank'});
}await writeFile(out+'/'+phase+'.json',JSON.stringify({at:new Date().toISOString(),origin,cases,measurement:'One fresh isolated browser page per path, same 390px scrolling sequence. Not a billable-cost estimate.'},null,2));console.log(JSON.stringify({phase,cases}));}finally{await qa.close();}
