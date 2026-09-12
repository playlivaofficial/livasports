// Local-only controlled replay through the real production-build UI. No DB writes or provider calls.
import {writeFile,readFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
import {comparisonFixture} from '../src/slip/comparison-fixtures.test-support.ts';
import {buildSlipComparison} from '../src/slip/comparison.ts';
import {resolveSelection} from '../src/slip/resolution.ts';
import {buildComparison} from '../src/odds/comparison.ts';
const base='http://localhost:3300';if(process.argv[2]&&process.argv[2]!==base)throw Error('REPLAY_LOCAL_ONLY');
const milestone=process.argv.includes('--g1')?'g1':'m8';
const audit=JSON.parse(await readFile('output/m6-audit-private.json','utf8'));
const browser=await browserQA(),checks=[],layouts=[],events=[];let page,scenario='complete',price='2.10',expiryMs=900000,kickoffMs=3600000;
const check=(name,pass,detail)=>{checks.push({name,pass,detail});if(!pass)throw Error('QA_FAILED: '+name);};
function response(input){
  const now=Date.now(),f=comparisonFixture(input.selections.length,now);
  const data={...f.data,fixtures:new Map()};
  input.selections.forEach((s,i)=>{
    const r=f.data.fixtures.get(f.selections[i].fixturePublicId);r.fixture.publicId=s.fixturePublicId;r.fixture.competition='REPLAY LOCAL · '+(input.locale==='br'?'Dados de teste':'Datos de prueba');
    r.fixture.kickoff=new Date(now+kickoffMs).toISOString();r.snapshot.kickoff=r.fixture.kickoff;
    for(const q of r.snapshot.quotes){Object.assign(q,{market:s.market,outcome:s.outcome,line:s.line,providerKickoff:r.fixture.kickoff,observedAt:new Date(now-900000+expiryMs).toISOString(),lastSuccessfulRefreshAt:new Date(now-900000+expiryMs).toISOString(),providerUpdatedAt:new Date(now-900000+expiryMs).toISOString()});if(q.bookmaker==='betsson'&&i===0)q.decimalOdds=price;}
    if(scenario==='partial'&&i===1)r.snapshot.quotes.pop();
    if(scenario==='betsson-partial'&&i===1)r.snapshot.quotes.shift();
    if(scenario==='zero')r.snapshot.quotes=[];
    if(scenario==='stale'&&i===0)for(const q of r.snapshot.quotes)q.status='STALE';
    if(scenario==='suspended'&&i===0)for(const q of r.snapshot.quotes)q.status='SUSPENDED';
    if(scenario==='started'&&i===0){r.fixture.status='LIVE';r.snapshot.fixtureStatus='LIVE';}
    if(scenario==='tie')r.snapshot.quotes[1].decimalOdds=r.snapshot.quotes[0].decimalOdds;
    if(scenario==='long'){r.fixture.home='Club Atlético de la Asociación Deportiva de los Trabajadores de la Universidad Nacional';for(const q of r.snapshot.quotes)q.decimalOdds='1000';}
    if(input.locale==='mx')for(const q of r.snapshot.quotes)q.geoEligible=false;
    data.fixtures.set(s.fixturePublicId,r);
  });
  if(scenario==='single')data.bookmakers=data.bookmakers.slice(0,1);
  if(scenario==='none'||input.locale==='mx')data.bookmakers=[];
  return {locale:input.locale,resolvedAt:new Date(now).toISOString(),providerRequests:0,selections:input.selections.map(s=>resolveSelection(s,data.fixtures.get(s.fixturePublicId),now)),comparison:buildSlipComparison(input.selections,input.locale,data.fixtures,data.bookmakers,now)};
}
async function intercept(target){
  await target.c.send('Fetch.enable',{patterns:[{urlPattern:base+'/api/slip/compare'},{urlPattern:base+'/api/events'},{urlPattern:base+'/api/odds/*'},{urlPattern:base+'/api/commercial/offers'}]});
  target.c.on('Fetch.requestPaused',async e=>{
    if(e.request.url.endsWith('/api/events')){events.push(JSON.parse(e.request.postData));await target.c.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:204});return;}
    if(e.request.url.endsWith('/api/commercial/offers')){
      // Controlled local UI architecture test. No real destination is followed or configured.
      const offers=JSON.parse(e.request.postData).map(x=>x.locale==='br'&&x.bookmaker==='betsson'?{bookmaker:x.bookmaker,placement:x.placement,token:crypto.randomUUID(),href:'/go/betsson/'+x.placement+'?offer=LOCAL_QA_ONLY',resolvedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+Math.min(expiryMs,kickoffMs,300000)).toISOString(),destinationType:'SPORTSBOOK',creative:null}:null);
      await target.c.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({offers,providerRequests:0})).toString('base64')});return;
    }
    let body;
    if(e.request.url.includes('/api/odds/')){
      const f=comparisonFixture(1);const now=Date.now();const r=f.data.fixtures.values().next().value;r.snapshot.kickoff=new Date(now+3600000).toISOString();
      r.snapshot.quotes=['MATCH_WINNER','TOTAL_GOALS','BTTS'].flatMap(market=>(market==='MATCH_WINNER'?['HOME','DRAW','AWAY']:market==='TOTAL_GOALS'?['OVER','UNDER']:['YES','NO']).map(outcome=>({...r.snapshot.quotes[0],market,outcome,line:market==='TOTAL_GOALS'?2.5:null,providerKickoff:r.snapshot.kickoff,observedAt:new Date(now).toISOString(),providerUpdatedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString()})));
      r.snapshot.quotes.push(...r.snapshot.quotes.map(q=>({...q,bookmaker:'betano.bet.br',bookmakerName:'Betano BR',decimalOdds:'2.50'})));
      body={providerRequests:0,comparisons:['MATCH_WINNER','TOTAL_GOALS','BTTS'].map(m=>buildComparison(r.snapshot,m,now,{betsson:'LOCAL_QA_ONLY'}))};
    }else body=response(JSON.parse(e.request.postData));
    await target.c.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:scenario==='failure'?503:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
  });
}
async function seed(count){const selections=comparisonFixture(count).selections.map(s=>({...s,addedAt:new Date().toISOString()}));await page.evaluate(`localStorage.setItem('livasports:guest-slip',${JSON.stringify(JSON.stringify({version:1,selections}))});window.dispatchEvent(new StorageEvent('storage',{key:'livasports:guest-slip'}));`);}
async function reopen(){await page.key('Escape');await page.click('.slip-trigger');await page.wait('!!document.querySelector(".slip-item:not([data-state=PENDING])")');}
async function compare(){await page.click('.slip-compare-jump');await page.wait('!!document.querySelector(".slip-bookmaker")');}
async function capture(label,width=390){await page.viewport(width,width===1440?1000:844);await delay(100);
  await page.evaluate(`(()=>{let badge=document.getElementById('m7-qa-badge');if(!badge){badge=document.createElement('div');badge.id='m7-qa-badge';badge.style.cssText='position:fixed;top:53px;left:12px;z-index:1000;pointer-events:none;background:#513610;color:#ffe1a4;padding:3px 6px;font:10px sans-serif;border-radius:3px';document.body.appendChild(badge)}badge.textContent=location.pathname.startsWith('/mx')?'SIMULACIÓN LOCAL · DATOS DE PRUEBA':'SIMULAÇÃO LOCAL · DADOS DE TESTE';})()`);
  const layout=await page.screenshot(`output/${milestone}-replay-${label}-${width}.png`);layouts.push({label,...layout});check(`${label} no overflow ${width}`,!layout.overflow);
  check(`${label} header remains visible ${width}`,await page.evaluate('(()=>{const p=document.querySelector(".slip-panel"),h=document.querySelector(".slip-heading");return !p||(p.scrollTop===0&&h.getBoundingClientRect().top>=p.getBoundingClientRect().top)})()'));}
try{
  page=await browser.newPage();await intercept(page);await page.navigate(base+'/br');await page.click('.slip-trigger');
  for(const width of [375,390,430,768,1440])await capture('empty',width);
  await seed(1);await page.wait('!!document.querySelector(".slip-combined")');await compare();await capture('one');
  check('one selection explanation',await page.evaluate('document.querySelector("#slip-comparison").textContent.includes("Uma seleção")'));
  await seed(3);await page.wait('document.querySelectorAll(".slip-item").length===3&&document.querySelector(".slip-bookmaker header span")?.textContent==="3/3"');await compare();
  check('two complete totals and independent Betano best',await page.evaluate('document.querySelectorAll(".slip-combined").length===2&&document.querySelector(".slip-bookmaker.is-best").dataset.bookmaker==="betano.bet.br"'));
  check('Betsson CTA sponsored, Betano absent, no destination leak',await page.evaluate('document.querySelectorAll(".slip-bookmaker-cta").length===1&&document.querySelector(".slip-bookmaker-cta").rel.includes("sponsored")&&!document.querySelector(".slip-bookmaker-cta").href.includes("partner")'));
  check('honest destination and localized commission disclosure',await page.evaluate('document.querySelector("#slip-comparison").textContent.includes("Abre o site da casa")&&document.querySelector("#slip-comparison").textContent.includes("Isso não altera a ordem das odds")'));
  for(const width of [375,390,430,768,1440]){await compare();await capture('both-complete',width);await page.evaluate('document.querySelector(".slip-bookmaker:last-of-type").scrollIntoView({block:"end",behavior:"instant"})');await capture('both-complete-bottom',width);}
  for(const state of ['partial','betsson-partial','single','zero','stale','suspended','started','tie']){
    scenario=state;await reopen();await compare();await capture(state);
    const actual=await page.evaluate('({totals:document.querySelectorAll(".slip-combined").length,best:document.querySelectorAll(".slip-best-label").length,cta:document.querySelectorAll(".slip-bookmaker-cta").length,missing:document.querySelectorAll(".slip-missing li").length,text:document.querySelector("#slip-comparison").textContent})');
    if(['partial','betsson-partial','single'].includes(state))check(`${state} one total no best`,actual.totals===1&&actual.best===0);
    if(['zero','stale','suspended','started'].includes(state))check(`${state} no total or CTA`,actual.totals===0&&actual.cta===0&&actual.missing>0);
    if(state==='tie')check('tie is labeled honestly',actual.best===2&&actual.text.includes('Empate na melhor'));
  }
  scenario='complete';price='2.35';await reopen();await compare();check('quote update recomputes bookmaker total',await page.evaluate('document.querySelector("[data-bookmaker=betsson] .slip-combined strong").textContent==="6,77"'));
  price='2.10';expiryMs=1800;await reopen();await compare();await page.wait('document.querySelectorAll(".slip-combined").length===0');check('open drawer expiry withdraws all totals and CTAs',await page.evaluate('!document.querySelector(".slip-bookmaker-cta")&&document.querySelectorAll(".slip-item").length===3'));await capture('natural-expiry');
  expiryMs=900000;kickoffMs=1800;await reopen();await compare();await page.wait('document.querySelectorAll(".slip-combined").length===0&&document.querySelector("#slip-comparison").textContent.includes("Partida iniciada")');check('clock kickoff invalidates retained intent',true);await capture('clock-kickoff');
  kickoffMs=3600000;scenario='long';await seed(10);await reopen();await compare();
  for(const width of [375,390,430,768,1440]){await compare();await capture('ten-long',width);check(`ten controls reachable ${width}`,await page.evaluate('(()=>{const b=document.querySelector(".slip-item:last-child .slip-remove");b.scrollIntoView({block:"nearest"});const r=b.getBoundingClientRect();return r.height>=44&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b})()'));}
  await page.click('.slip-item:last-child .slip-remove');await page.wait('document.querySelectorAll(".slip-item").length===9');check('remove keeps keyboard focus',await page.evaluate('document.activeElement.classList.contains("slip-remove")'));
  await page.key('Escape');await page.reload();check('refresh persists canonical intent without prices',await page.evaluate('document.querySelector(".slip-trigger .slip-count").textContent==="9"&&!localStorage.getItem("livasports:guest-slip").includes("decimalOdds")'));
  await page.navigate(base+'/mx');await page.click('.slip-trigger');await page.wait('document.querySelector("#slip-comparison")?.textContent.includes("No hay casas verificadas")');await page.click('.slip-compare-jump');await capture('mx');
  check('MX preserves intent without BR price or CTA',await page.evaluate('document.querySelectorAll(".slip-item").length===9&&!document.querySelector(".slip-combined")&&!document.querySelector(".slip-bookmaker-cta")&&!document.querySelector(".slip-price")'));
  // Real M6 controls using locally replayed current M5 odds on a real Match Center route.
  scenario='complete';await page.key('Escape');await seed(0);await page.navigate(base+audit.samples[0].path+'#odds');await page.evaluate('document.querySelector("#odds").scrollIntoView({block:"center"})');await page.wait('!!document.querySelector(".slip-odds-button:not(:disabled)")');
  await page.wait('!!document.querySelector("#odds a[rel~=sponsored]")');
  for(const width of [375,390,430,768,1440]){await page.viewport(width,width===1440?1000:844);await page.evaluate('document.querySelector("#odds").scrollIntoView({block:"start",behavior:"instant"})');await capture('match-cta',width);}
  await page.evaluate('document.querySelector(".slip-odds-button").focus()');await page.key('Enter');
  check('keyboard add through existing M6 button',await page.evaluate('document.querySelector(".slip-trigger .slip-count").textContent==="1"'));
  for(const market of ['TOTAL_GOALS','BTTS']){await page.click('#odds-tab-'+market);await page.click('.slip-odds-button');await page.wait('!!document.querySelector(".slip-confirm")');await page.click('.slip-confirm button');await page.wait(`document.querySelector('.slip-item')?.dataset.selection.includes('${market}')`);check(`explicit ${market} replacement remains one intent`,await page.evaluate('document.querySelectorAll(".slip-item").length===1'));await page.key('Escape');}
  const keep=JSON.parse(await page.evaluate('localStorage.getItem("livasports:guest-slip")')).selections[0];const ten=[keep,...comparisonFixture(9).selections.map(s=>({...s,addedAt:new Date().toISOString()}))];
  await page.evaluate(`localStorage.setItem('livasports:guest-slip',${JSON.stringify(JSON.stringify({version:1,selections:ten}))});window.dispatchEvent(new StorageEvent('storage',{key:'livasports:guest-slip'}));`);
  await page.navigate(base+audit.samples[1].path+'#odds');await page.evaluate('document.querySelector("#odds").scrollIntoView({block:"center"})');await page.wait('!!document.querySelector(".slip-odds-button:not(:disabled)")');await page.click('.slip-odds-button');
  check('eleventh selection rejected',await page.evaluate('document.querySelector(".slip-trigger .slip-count").textContent==="10"&&document.querySelector(".slip-feedback").textContent.includes("10")'));
  await page.click('.slip-trigger');await page.wait('document.querySelectorAll(".slip-item").length===10');await page.click('.slip-summary button');await page.click('.slip-confirm button');await page.wait('!!document.querySelector(".slip-empty")');check('clear retains M6 confirmation',true);
  await seed(3);await page.wait('document.querySelectorAll(".slip-combined").length===2');
  await page.c.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await page.wait('!document.querySelector(".slip-combined")&&!document.querySelector(".slip-bookmaker-cta")');
  const offlineReads=page.metrics.slipReads;console.info('M7 lifecycle: observing offline for 61 seconds');await delay(61000);check('offline comparison zero polling for 61s',page.metrics.slipReads===offlineReads);
  await page.c.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await page.wait('document.querySelectorAll(".slip-combined").length===2');check('online restores newly resolved totals',true);
  scenario='failure';await page.key('Escape');await page.click('.slip-trigger');await page.wait('!!document.querySelector(".slip-notice")');check('failed read retains intent and removes totals/CTA',await page.evaluate('document.querySelectorAll(".slip-item").length===3&&!document.querySelector(".slip-combined")&&!document.querySelector(".slip-bookmaker-cta")'));
  scenario='complete';await reopen();await page.wait('document.querySelectorAll(".slip-combined").length===2');
  const second=await browser.newPage();await intercept(second);await second.navigate(base+'/br');await second.activate();
  check('background is hidden',await page.evaluate('document.visibilityState==="hidden"'));const hiddenReads=page.metrics.slipReads;
  console.info('M7 lifecycle: observing hidden for 61 seconds');await delay(61000);check('hidden comparison zero polling for 61s',page.metrics.slipReads===hiddenReads);
  await second.click('.slip-trigger');await second.wait('document.querySelectorAll(".slip-item").length===3');await second.click('.slip-remove');await page.activate();await page.wait('document.querySelectorAll(".slip-item").length===2&&document.querySelector(".slip-bookmaker header span")?.textContent==="2/2"');check('two-tab intent sync recomputes coverage',true);
  await page.key('Escape');const closedReads=page.metrics.slipReads;console.info('M7 lifecycle: observing closed for 61 seconds');await delay(61000);check('closed comparison zero polling for 61s',page.metrics.slipReads===closedReads);
  await seed(0);await page.click('.slip-trigger');const emptyReads=page.metrics.slipReads;console.info('M7 lifecycle: observing empty for 61 seconds');await delay(61000);check('empty comparison zero polling for 61s',page.metrics.slipReads===emptyReads);
  check('no browser provider request',page.metrics.providers===0);check('no JavaScript error or unexpected application failure',page.metrics.errors.length===0&&page.metrics.failed.length===1&&page.metrics.failed[0].status===503);
  check('comparison analytics recorded after actual visibility',events.some(e=>e.eventName==='slip_comparison_view')&&events.some(e=>e.eventName==='slip_best_price_view'));
  check('visible M8 impressions are separately classified QA',events.some(e=>e.eventName==='affiliate_impression')&&events.filter(e=>e.eventName==='affiliate_impression').every(e=>e.qa===true));
  const result={status:'PASS',mode:'LOCAL_CONTROLLED_REPLAY',checks,layouts,metrics:page.metrics,analytics:events.filter(e=>e.placement==='slip-comparison').length};
  await writeFile(`output/${milestone}-browser-qa-private.json`,JSON.stringify(result,null,2));console.info(JSON.stringify({status:result.status,mode:result.mode,checks,metrics:page.metrics}));
}catch(error){console.error(error.message);if(page)await page.screenshot(`output/${milestone}-replay-failure.png`).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
