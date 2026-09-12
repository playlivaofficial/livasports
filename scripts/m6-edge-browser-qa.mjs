// LOCAL ONLY, explicitly labelled replay. No test prices are written to the database.
// Real-provider add/replace/persistence is covered separately by m6-browser-qa.mjs.
import {readFile,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base='http://localhost:3300';
if(process.argv[2]&&process.argv[2]!==base)throw Error('REPLAY_IS_LOCAL_ONLY');
const audit=JSON.parse(await readFile('output/m6-audit-private.json','utf8'));
const samples=audit.samples.slice(0,8);const browser=await browserQA();const checks=[];
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error('QA_FAILED: '+name);};
let page;
try{
  page=await browser.newPage();let states=['CURRENT'],price='2.10',expires=3600000,kickoff=7200000,fail=false;
  await page.c.send('Fetch.enable',{patterns:[{urlPattern:base+'/api/slip/resolve'},{urlPattern:base+'/api/events'}]});
  page.c.on('Fetch.requestPaused',async event=>{
    if(event.request.url.endsWith('/api/events')){await page.c.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:204});return;}
    const input=JSON.parse(event.request.postData);const now=Date.now();
    const body={locale:input.locale,resolvedAt:new Date(now).toISOString(),providerRequests:0,selections:input.selections.map((selection,i)=>{
      const sample=samples.find(s=>s.public_id===selection.fixturePublicId)??samples[i];const state=states[i]??'UNAVAILABLE';
      return {selection,fixture:state==='UNAVAILABLE'?null:{publicId:sample.public_id,home:sample.home,away:sample.away,competition:'LOCAL QA REPLAY — '+sample.slug,kickoff:new Date(now+kickoff).toISOString(),status:state==='MATCH_FINISHED'?'FINISHED':'SCHEDULED'},state,reason:null,closesAt:new Date(now+kickoff).toISOString(),
        price:state==='CURRENT'?{decimalOdds:price,bookmaker:'betano.bet.br',bookmakerName:'LOCAL QA REPLAY',best:false,expiresAt:new Date(now+expires).toISOString()}:null};
    })};
    await page.c.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:fail?503:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(fail?{error:'LOCAL_REPLAY_FAILURE'}:body)).toString('base64')});
  });
  async function seed(count=1,version=1){
    const saved={version,selections:samples.slice(0,count).map((s,i)=>({fixturePublicId:s.public_id,scope:'FULL_TIME_REGULATION',market:i%3===1?'TOTAL_GOALS':i%3===2?'BTTS':'MATCH_WINNER',outcome:i%3===1?'OVER':i%3===2?'YES':'HOME',line:i%3===1?2.5:null,addedAt:new Date().toISOString()}))};
    await page.evaluate(`localStorage.setItem('livasports:guest-slip',${JSON.stringify(JSON.stringify(saved))});window.dispatchEvent(new StorageEvent('storage',{key:'livasports:guest-slip'}));`);
  }
  async function reopen(){await page.key('Escape');await page.click('.slip-trigger');}
  await page.navigate(base+'/br');await seed();await page.click('.slip-trigger');await page.wait('!!document.querySelector(".slip-price")');
  price='2.35';await reopen();await page.wait('!!document.querySelector("[data-state=PRICE_CHANGED]")');
  check('price changes use new reference, never stored price',await page.evaluate('document.querySelector(".slip-price").textContent==="2,35"&&!localStorage.getItem("livasports:guest-slip").includes("2.35")'));
  await page.screenshot('output/m6-local-replay-price-change-390.png');
  expires=1500;await reopen();await page.wait('!!document.querySelector(".slip-price")');await page.wait('!!document.querySelector("[data-state=STALE]")');
  check('open drawer expiry removes price but preserves intent',await page.evaluate('!document.querySelector(".slip-price")&&document.querySelectorAll(".slip-item").length===1'));
  await page.screenshot('output/m6-local-replay-stale-390.png');
  expires=3600000;kickoff=1500;await reopen();await page.wait('!!document.querySelector(".slip-price")');await page.wait('!!document.querySelector("[data-state=MATCH_STARTED]")');
  check('kickoff closes existing price without deleting intent',await page.evaluate('!document.querySelector(".slip-price")'));
  await page.screenshot('output/m6-local-replay-started-390.png');
  kickoff=7200000;states=['STALE'];await reopen();await page.wait('!!document.querySelector("[data-state=STALE]")');
  kickoff=1500;await reopen();await page.wait('!!document.querySelector("[data-state=MATCH_STARTED]")');check('already-stale selection advances at kickoff',true);
  kickoff=7200000;states=['SUSPENDED','CLOSED','MATCH_FINISHED','UNAVAILABLE'];await seed(4);await page.wait('document.querySelectorAll(".slip-item").length===4&&!!document.querySelector("[data-state=SUSPENDED]")');
  for(const state of states)check(`visible ${state}`,await page.evaluate(`!!document.querySelector('[data-state=${state}]')`));
  for(const width of [375,390,430,768,1440]){await page.viewport(width,width===1440?1000:844);const layout=await page.screenshot(`output/m6-local-replay-states-${width}.png`);check(`unavailable states no overflow ${width}`,!layout.overflow);}
  await page.viewport(390);await seed(1);states=['CURRENT'];await reopen();await page.wait('!!document.querySelector(".slip-price")');
  await page.c.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await page.wait('!document.querySelector(".slip-price")&&document.querySelector(".slip-notice")?.textContent.includes("Sem conexão")');
  const offlineReads=page.metrics.slipReads;await delay(61000);check('offline drawer does not poll for 61s',page.metrics.slipReads===offlineReads);
  await page.c.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await page.wait('!!document.querySelector(".slip-price")');check('online recovery resolves current price',true);
  fail=true;await reopen();await page.wait('!!document.querySelector(".slip-notice")');check('read failure retains intent and hides price',await page.evaluate('document.querySelectorAll(".slip-item").length===1&&!document.querySelector(".slip-price")'));
  fail=false;await reopen();await page.wait('!!document.querySelector(".slip-price")');
  const hidden=await browser.newPage();await hidden.navigate(base+'/br');await hidden.activate();
  check('real background tab is hidden',await page.evaluate('document.visibilityState==="hidden"'));
  const hiddenReads=page.metrics.slipReads;await delay(61000);check('hidden drawer does not poll for 61s',page.metrics.slipReads===hiddenReads);
  await page.activate();await page.wait('!!document.querySelector(".slip-price")');await page.key('Escape');
  const closedReads=page.metrics.slipReads;await delay(61000);check('closed drawer does not poll for 61s',page.metrics.slipReads===closedReads);
  await seed(1,99);await page.click('.slip-trigger');check('future schema fails safely without overwriting saved data',await page.evaluate('!!document.querySelector(".slip-empty")&&!!document.querySelector(".slip-notice")&&JSON.parse(localStorage.getItem("livasports:guest-slip")).version===99'));
  const emptyReads=page.metrics.slipReads;await delay(61000);check('empty drawer does not poll for 61s',page.metrics.slipReads===emptyReads);
  check('no replay JavaScript or provider errors',page.metrics.providers===0&&page.metrics.errors.length===0);
  // A single intentionally replayed 503 is expected, not a real application failure.
  check('only injected read failure',page.metrics.failed.length===1&&page.metrics.failed[0].status===503);
  console.info(JSON.stringify({status:'PASS',mode:'LOCAL_ONLY_REPLAY',checks}));
  await writeFile('output/m6-local-edge-qa-private.json',JSON.stringify({status:'PASS',mode:'LOCAL_ONLY_REPLAY',checks,metrics:page.metrics},null,2));
}catch(error){console.error(error.message);if(page)await page.screenshot('output/m6-local-edge-failure.png').catch(()=>{});process.exitCode=1;}finally{await browser.close();}
