// Observe the real production clock. No replay, time override, quote writes or provider calls.
import {readFile,writeFile} from 'node:fs/promises';
import {browserQA} from './browser-qa-driver.mjs';
const base='https://livasports.com';const audit=JSON.parse(await readFile('output/m6-audit-private.json','utf8'));
const samples=audit.samples.filter(s=>s.slug==='premier-league'&&s.status==='SCHEDULED'&&Date.parse(s.kickoff)>Date.now()).slice(0,10);
const selections=samples.map(s=>({fixturePublicId:s.public_id,market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION'}));
const response=await fetch(base+'/api/slip/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locale:'br',selections})});
if(!response.ok)throw Error('REAL_BOUNDARY_SAMPLE_READ_FAILED');
const body=await response.json();const now=Date.now();
const eligible=body.selections.filter(s=>s.price&&Math.min(Date.parse(s.closesAt),Date.parse(s.price.expiresAt))-now>30000&&Math.min(Date.parse(s.closesAt),Date.parse(s.price.expiresAt))-now<12*60000);
eligible.sort((a,b)=>Math.min(Date.parse(a.closesAt),Date.parse(a.price.expiresAt))-Math.min(Date.parse(b.closesAt),Date.parse(b.price.expiresAt)));
const value=eligible[0];if(!value)throw Error('NO_NATURAL_BOUNDARY_SAMPLE');
const sample=samples.find(s=>s.public_id===value.selection.fixturePublicId);const boundary=Math.min(Date.parse(value.closesAt),Date.parse(value.price.expiresAt));
const browser=await browserQA();
try{
  const page=await browser.newPage();await page.navigate(base+sample.path+'#odds');
  await page.wait('!!document.querySelector(".slip-odds-button:not(:disabled)")');await page.click('.slip-odds-button:not(:disabled)');await page.click('.slip-trigger');
  await page.wait('!!document.querySelector(".slip-price")');await page.screenshot('output/m6-production-natural-boundary-before-390.png');
  console.info(JSON.stringify({stage:'WAITING_FOR_REAL_CLOCK',publicId:sample.public_id,kickoff:value.closesAt,expiresAt:value.price.expiresAt,boundary:new Date(boundary).toISOString()}));
  await page.wait('!!document.querySelector(".slip-item[data-state=MATCH_STARTED],.slip-item[data-state=STALE]")',Math.max(30000,boundary-Date.now()+30000));
  const state=await page.evaluate('document.querySelector(".slip-item").dataset.state');
  const retained=await page.evaluate('document.querySelectorAll(".slip-item").length===1&&JSON.parse(localStorage.getItem("livasports:guest-slip")).selections.length===1&&!document.querySelector(".slip-price")');
  const layout=await page.screenshot('output/m6-production-natural-boundary-after-390.png');
  const result={at:new Date().toISOString(),mode:'REAL_PRODUCTION_CLOCK',publicId:sample.public_id,boundary:new Date(boundary).toISOString(),state,retained,layout,metrics:page.metrics,
    pass:retained&&!layout.overflow&&page.metrics.providers===0&&page.metrics.errors.length===0&&page.metrics.failed.length===0};
  await writeFile('output/m6-production-natural-boundary-private.json',JSON.stringify(result,null,2));console.info(JSON.stringify(result));if(!result.pass)process.exitCode=1;
}finally{await browser.close();}
