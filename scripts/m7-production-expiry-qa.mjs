// Observe real quote expiry on production without changing clocks or responses.
import {readFile,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const evidence=JSON.parse(await readFile('output/m7-production-prices-private.json','utf8')),sample=evidence.samples['3'];
const verifyExpired=process.argv.includes('--verify-expired');
const browser=await browserQA(),checks=[];let page;
function check(name,pass,detail){checks.push({name,pass,detail});if(!pass)throw Error('QA_FAILED: '+name);}
try{
  const expires=sample.value.comparison.bookmakers.map(b=>({id:b.bookmakerId,at:Math.min(...b.selectionQuotes.map(q=>Date.parse(q.expiresAt)))})).sort((a,b)=>a.at-b.at);
  page=await browser.newPage();await page.navigate('https://livasports.com/br');
  // Use the same production-server time reference as the application. Host clocks
  // can differ; performance.now() measures elapsed time without wall-clock jumps.
  const timing=await page.evaluate(`(async()=>{const start=performance.now();const r=await fetch('/api/slip/compare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locale:'br',selections:[]})});const b=await r.json();return {server:Date.parse(b.resolvedAt),local:Date.now(),roundTrip:performance.now()-start}})()`);
  const received=performance.now(),serverNow=()=>timing.server+performance.now()-received;
  check('production clock calibration bounded',Number.isFinite(timing.server)&&timing.roundTrip<1500,{...timing,serverAheadMs:timing.server-timing.local});
  check(verifyExpired?'real saved sample has now expired':'bounded real future expiry',verifyExpired?expires.every(e=>e.at<serverNow()):expires[0].at>serverNow()+10000&&expires[1].at<serverNow()+20*60*1000&&expires[1].at-expires[0].at>3000);
  const stored={version:1,selections:sample.selections.map(s=>({...s,addedAt:new Date().toISOString()}))};
  await page.evaluate(`localStorage.setItem('livasports:guest-slip',${JSON.stringify(JSON.stringify(stored))});window.dispatchEvent(new StorageEvent('storage',{key:'livasports:guest-slip'}));`);
  await page.click('.slip-trigger');await page.wait(verifyExpired?`document.querySelectorAll('.slip-bookmaker[data-complete=false]').length===2`:`document.querySelectorAll('.slip-bookmaker[data-complete=true]').length===2`);await page.click('.slip-compare-jump');
  check(verifyExpired?'saved real observation proves both books complete before expiry':'two real complete books before natural expiry',sample.value.comparison.bookmakers.every(b=>b.complete&&Date.parse(sample.value.resolvedAt)<Math.min(...b.selectionQuotes.map(q=>Date.parse(q.expiresAt)))));
  await page.evaluate(`window.__qaExpiryTransitions=[];new MutationObserver(()=>{const state=[...document.querySelectorAll('.slip-bookmaker')].map(b=>({id:b.dataset.bookmaker,complete:b.dataset.complete,total:b.querySelector('.slip-combined strong')?.textContent??null,best:!!b.querySelector('.slip-best-label')}));const signature=JSON.stringify(state);if(signature!==window.__qaExpiryLast){window.__qaExpiryLast=signature;window.__qaExpiryTransitions.push({at:new Date().toISOString(),state})}}).observe(document.querySelector('.slip-comparison'),{subtree:true,attributes:true,childList:true,characterData:true});`);
  console.log(JSON.stringify({state:'OBSERVING_NATURAL_EXPIRY',expires:expires.map(e=>({...e,at:new Date(e.at).toISOString()}))}));
  for(let i=verifyExpired?expires.length-1:0;i<expires.length;i++){
    while(serverNow()<expires[i].at+1200)await delay(Math.min(30000,expires[i].at+1200-serverNow()));
    const state=await page.evaluate(`[...document.querySelectorAll('.slip-bookmaker')].map(b=>({id:b.dataset.bookmaker,complete:b.dataset.complete,total:b.querySelector('.slip-combined strong')?.textContent??null,best:!!b.querySelector('.slip-best-label')}))`);
    check(`natural expiry stage ${i+1} clears expired total and all best labels`,state.every(b=>!b.best&&(expires.slice(0,i+1).some(e=>e.id===b.id)?b.complete==='false'&&b.total===null:b.complete==='true'&&b.total!==null)),state);
    const layout=await page.screenshot(`output/m7-production-${verifyExpired?'expired-verification':'natural-expiry-'+(i+1)}-390.png`);check(`expiry stage ${i+1} layout`,!layout.overflow&&!layout.brokenImages);
  }
  const selections=await page.evaluate(`JSON.parse(localStorage.getItem('livasports:guest-slip')).selections.length`);check('natural expiry preserves saved intent',selections===3);
  check('natural expiry no runtime/provider failures',page.metrics.providers===0&&page.metrics.errors.length===0&&page.metrics.failed.length===0);
  const transitions=await page.evaluate('window.__qaExpiryTransitions');
  const result={at:new Date().toISOString(),status:'PASS',mode:verifyExpired?'REAL_PRODUCTION_BEFORE_AFTER_EXPIRY':'REAL_PRODUCTION_NATURAL_EXPIRY',checks,transitions,metrics:page.metrics};await writeFile('output/m7-production-expiry-private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){console.error(error.message);if(page){await writeFile('output/m7-expiry-failure-private.json',JSON.stringify({checks,transitions:await page.evaluate('window.__qaExpiryTransitions??[]'),metrics:page.metrics},null,2));await page.screenshot('output/m7-production-expiry-failure.png').catch(()=>{});}process.exitCode=1;}finally{await browser.close();}
