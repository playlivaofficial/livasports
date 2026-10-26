/** Matched anonymous browser navigation; never reads or exports session content. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const origin=process.env.V35_QA_ORIGIN??'https://livasports.com';
assert.ok(['https://livasports.com','http://localhost:3351'].includes(origin)||/^https:\/\/livasports-[a-z0-9]+-nikapopkha3-4447s-projects\.vercel\.app$/.test(origin));
const phase=process.argv[2];assert.ok(['before','preview','after'].includes(phase));
const qa=await browserQA(),cases=[];
try{for(const width of [390,1440]){
 const page=await qa.newPage(width,900),reads=[],statuses=[];
 await page.c.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});"});
 page.c.on('Network.requestWillBeSent',e=>{const u=new URL(e.request.url);if(u.origin===origin&&u.pathname==='/api/auth/session')reads.push(1);});
 page.c.on('Network.responseReceived',e=>{const u=new URL(e.response.url);if(u.origin===origin&&u.pathname==='/api/auth/session')statuses.push(e.response.status);});
 await page.c.send('Page.navigate',{url:origin+'/en/sports/basketball/nba'});
 try{await page.wait('document.readyState==="complete"&&document.querySelectorAll(".auth-header-link").length===2&&!!document.querySelector(".ms-table")',60000);}catch{
  console.log(JSON.stringify({pageDiagnostic:await page.evaluate('({origin:location.origin,path:location.pathname,title:document.title,ready:document.readyState,headers:document.querySelectorAll(".auth-header-link").length,tables:document.querySelectorAll(".ms-table").length})'),failures:page.metrics.failed}));throw Error('PUBLIC_BROWSER_LOAD_FAILED');
 }await delay(1500);
 assert.ok(reads.length>0);assert.equal(reads.length,statuses.length);assert.ok(statuses.every(status=>status===200));
 const initialReads=reads.length;
 const targets=await page.evaluate('[...document.querySelectorAll(".auth-header-link")].map(a=>({href:a.getAttribute("href"),label:a.textContent}))');
 assert.ok(targets.every(target=>target.href==='/en/sign-in'&&target.label));
 console.log(JSON.stringify({phase,width,initialSessionRequests:initialReads}));
 // Use the visible control at each breakpoint; never click a hidden menu link.
 if(width===390){await page.click('#v2-main-menu summary');await delay(150);await page.click('#v2-main-menu .auth-header-link');}
 else await page.click('.v2-header-session .auth-header-link');
 await page.wait('location.pathname==="/en/sign-in"&&!!document.querySelector("form")',60000);
 assert.equal(page.metrics.providers,0);assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);
 cases.push({width,initialSessionRequests:initialReads,statusesBeforeNavigation:statuses.slice(0,initialReads),headerInstances:targets.length,signInNavigation:true,providers:0,errors:0});
 await page.c.send('Page.navigate',{url:'about:blank'});
}
 await mkdir('output/v3-qa/v35/performance/header-session',{recursive:true});const report={at:new Date().toISOString(),phase,origin,cases,measurement:'Fresh anonymous page at 390/1440; same NBA page and menu sign-in navigation. Counts, not cost or authenticated-user acceptance.'};await writeFile('output/v3-qa/v35/performance/header-session/'+phase+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await qa.close();}
