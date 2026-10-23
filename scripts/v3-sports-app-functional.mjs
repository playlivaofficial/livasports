import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const b=await browserQA(),records=[];
try{const page=await b.newPage();
 for(const locale of ['en','mx','br'])for(const width of [320,390,430]){
  await page.viewport(width,844);await page.evaluate('window.__old=true');await page.c.send('Page.navigate',{url:'http://localhost:3351/'+locale});await page.wait('!window.__old && document.readyState==="complete" && !!document.querySelector(".sp-quick-table")',60000);
  for(const theme of ['light','dark']){await page.evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);await delay(50);
   const metrics=await page.evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,rows:document.querySelectorAll('.sp-quick-table li').length,tableBottom:document.querySelector('.sp-quick-table').getBoundingClientRect().bottom,bottomNavigationTop:document.querySelector('.v2-bottom-nav').getBoundingClientRect().top,links:[...document.querySelectorAll('.sp-quick-table li a,.sp-table-more')].map(a=>({height:a.getBoundingClientRect().height,href:a.getAttribute('href')})),date:document.querySelector('.sp-table-date time').getAttribute('datetime'),languages:[...document.querySelectorAll('select option')].map(o=>o.textContent),broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).length})`);
   assert.equal(metrics.overflow,false);assert.equal(metrics.rows,3);assert.equal(metrics.broken,0);assert.ok(metrics.links.every(a=>a.height>=44&&a.href.startsWith('/'+locale+'/')));if(width===390)assert.ok(metrics.tableBottom<=metrics.bottomNavigationTop);
   records.push({locale,width,theme,...metrics});
  }
 }
 await page.click('.sp-table-more');await page.wait('location.pathname.endsWith("/football/bundesliga") && document.querySelectorAll(".ms-table tbody tr").length===18',30000);assert.equal(await page.evaluate('document.querySelectorAll(".ms-table tbody tr").length'),18);
 assert.equal(page.metrics.providers,0);assert.deepEqual(page.metrics.errors,[]);assert.deepEqual(page.metrics.failed,[]);
 await writeFile('output/v3-qa/acceptance-2026-10-22/sports-app/functional.json',JSON.stringify({at:new Date().toISOString(),records,tableNavigationPassed:true,metrics:page.metrics},null,2));console.log(JSON.stringify({checks:records.length,tableNavigationPassed:true,errors:page.metrics.errors}));
}finally{await b.close();}
