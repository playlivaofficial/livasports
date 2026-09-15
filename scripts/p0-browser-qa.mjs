import {writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
import {comparisonFixture} from '../src/slip/comparison-fixtures.test-support.ts';
import {buildSlipComparison} from '../src/slip/comparison.ts';
import {resolveSelection} from '../src/slip/resolution.ts';

const base=process.argv[2]??'http://localhost:3300';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('P0_BROWSER_QA_SCOPE');
const phase=base.startsWith('https')?'production':'local';
const browser=await browserQA(),checks=[],layouts=[];let page,scenario='all-real';
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error(`P0_BROWSER_QA_FAILED: ${name}`);};

function comparisonResponse(input){
  const now=Date.now(),fixture=comparisonFixture(input.selections.length,now),data={...fixture.data,fixtures:new Map()};
  input.selections.forEach((selection,index)=>{
    const read=fixture.data.fixtures.get(fixture.selections[index].fixturePublicId);
    read.fixture.publicId=selection.fixturePublicId;read.fixture.kickoff=new Date(now+3600000).toISOString();read.snapshot.kickoff=read.fixture.kickoff;
    for(const quote of read.snapshot.quotes)Object.assign(quote,{market:selection.market,outcome:selection.outcome,line:selection.line,providerKickoff:read.fixture.kickoff,observedAt:new Date(now).toISOString(),providerUpdatedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString()});
    const suspended=scenario==='betano-proxy'?'betano.bet.br':scenario==='betsson-proxy'?'betsson':null;
    if(suspended&&index===0)for(const quote of read.snapshot.quotes)if(quote.bookmaker===suspended)quote.status='SUSPENDED';
    data.fixtures.set(selection.fixturePublicId,read);
  });
  return {locale:input.locale,resolvedAt:new Date(now).toISOString(),providerRequests:0,selections:input.selections.map(selection=>resolveSelection(selection,data.fixtures.get(selection.fixturePublicId),now)),comparison:buildSlipComparison(input.selections,input.locale,data.fixtures,data.bookmakers,now)};
}

async function seed(count){
  const selections=comparisonFixture(count).selections.map(selection=>({...selection,addedAt:new Date().toISOString()}));
  await page.evaluate(`localStorage.setItem('livasports:guest-slip',${JSON.stringify(JSON.stringify({version:1,selections}))});window.dispatchEvent(new StorageEvent('storage',{key:'livasports:guest-slip'}));`);
}

async function navigate(path){await page.navigate(base+path);check(`${path} no application failure`,page.metrics.failed.length===0);}

try{
  page=await browser.newPage();
  await page.c.send('Network.setBlockedURLs',{urls:['*://api.sportmonks.com/*','*://api.oddspapi.io/*']});
  await page.c.send('Fetch.enable',{patterns:[{urlPattern:base+'/api/slip/compare'},{urlPattern:base+'/api/commercial/offers'},{urlPattern:base+'/api/events'}]});
  page.c.on('Fetch.requestPaused',async event=>{
    try{
      if(event.request.url.endsWith('/api/events')){await page.c.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:204});return;}
      const input=JSON.parse(event.request.postData),body=event.request.url.endsWith('/api/commercial/offers')?{offers:input.map(context=>context.bookmaker==='betsson'?{bookmaker:'betsson',placement:context.placement,token:'P0_QA_ONLY',href:`/go/betsson/${context.placement}?offer=P0_QA_ONLY`,expiresAt:new Date(Date.now()+300000).toISOString(),resolvedAt:new Date().toISOString(),destinationType:'SPORTSBOOK',creative:null}:null),providerRequests:0}:comparisonResponse(input);
      await page.c.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
    }catch{await page.c.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'}).catch(()=>{});}
  });

  for(const zone of ['Asia/Tbilisi','America/Sao_Paulo','Europe/London','America/Mexico_City']){
    await page.c.send('Emulation.setTimezoneOverride',{timezoneId:zone});
    for(const name of ['livasports_time_zone','livasports_device_time_zone'])await page.c.send('Network.deleteCookies',{name,url:base});
    await navigate('/en');await page.wait(`document.querySelector('main')?.dataset.timeZone===${JSON.stringify(zone)}`,30000);
    check(`${zone} device timezone`,await page.evaluate(`Intl.DateTimeFormat().resolvedOptions().timeZone===document.querySelector('main').dataset.timeZone`));
  }

  for(const [locale,path] of [['br','/br'],['mx','/mx'],['en','/en']]){
    await navigate(path);check(`${locale} neutral home Upcoming`,await page.evaluate(`document.querySelector('main')?.dataset.boardView==='upcoming'`));
    check(`${locale} 34 competition links`,await page.evaluate(`document.querySelectorAll('a.competition-nav-row[href*="competition="]').length===34`));
    check(`${locale} country grouping`,await page.evaluate(`document.querySelectorAll('[data-competition-country]').length===16`));
    check(`${locale} domestic flag assets`,await page.evaluate(`document.querySelectorAll('[data-competition-country="BR"] img[src*="flagcdn.com/br.svg"]').length===6`));
    check(`${locale} international marks`,await page.evaluate(`document.querySelectorAll('[data-competition-country^="INT-"] .competition-nav-flag').length===7`));
  }
  await navigate('/en?view=live');check('explicit Live preserved',await page.evaluate(`document.querySelector('main')?.dataset.boardView==='live'`));
  await navigate('/en/football?view=results');check('explicit Results preserved',await page.evaluate(`document.querySelector('main')?.dataset.boardView==='results'`));
  check('finished rows remove odds cells',await page.evaluate(`document.querySelectorAll('.fixture-row[data-status="FINISHED"]').length>0&&document.querySelectorAll('.fixture-row[data-status="FINISHED"] .odds-slot').length===0`));
  check('finished-only groups remove odds header',await page.evaluate(`[...document.querySelectorAll('.competition-section')].filter(section=>section.querySelector('.fixture-row')).every(section=>section.dataset.oddsLayout!=='none'||!section.querySelector('.board-odds-heading'))`));

  await navigate('/en/football?competition=premier-league&season=invalid-season');
  check('competition defaults Fixtures',await page.evaluate(`document.querySelector('[data-competition-tab="fixtures"]')?.getAttribute('aria-current')==='page'`));
  check('invalid season falls back',await page.evaluate(`!!document.querySelector('#competition-season option:checked')&&!/Unable to load this page/i.test(document.querySelector('main').innerText)`));
  check('recent results adjacent to fixtures',await page.evaluate(`!!document.querySelector('.sports-fixtures-recent')`));

  await navigate('/br');await seed(5);
  for(const current of ['all-real','betano-proxy','betsson-proxy']){
    scenario=current;await page.reload();await page.click('.slip-trigger');await page.wait(`document.querySelectorAll('.slip-bookmaker').length===2&&document.querySelectorAll('.slip-combined').length===2`,30000);
    const state=await page.evaluate(`({cards:[...document.querySelectorAll('.slip-bookmaker')].map(card=>({book:card.dataset.bookmaker,estimated:card.dataset.estimated,coverage:card.querySelector('header span')?.textContent})),disclaimers:document.querySelectorAll('.slip-estimated-disclaimer').length,proxies:document.querySelectorAll('.slip-proxy-legs li').length,text:document.querySelector('#slip-comparison').textContent})`);
    check(`${current} both totals`,state.cards.length===2&&state.cards.every(card=>card.coverage==='5/5'));
    check(`${current} disclaimer on every card`,state.disclaimers===2);
    if(current==='all-real')check('all-real has no proxy legs',state.proxies===0&&state.cards.every(card=>card.estimated==='false'));
    else check(`${current} disclosed proxy`,state.proxies===1&&state.cards.filter(card=>card.estimated==='true').length===1&&/Cotação aproximada/.test(state.text));
    check(`${current} safe CTA copy`,/Ver odds na Betsson/.test(state.text)&&!/Get\s+\d|Obter\s+\d/.test(state.text));
  }

  for(const width of [375,390,430,768,1024,1440]){
    await page.viewport(width,width===1440?1000:844);await navigate('/br');
    const home=await page.screenshot(`output/p0-browser-${phase}-home-${width}.png`);layouts.push({page:'home',...home});check(`home ${width} no overflow`,!home.overflow);
    await navigate('/br/futebol?competition=premier-league');
    const hub=await page.screenshot(`output/p0-browser-${phase}-competition-${width}.png`);layouts.push({page:'competition',...hub});check(`competition ${width} no overflow`,!hub.overflow);
  }
  check('no browser provider requests',page.metrics.providers===0);check('no browser runtime errors',page.metrics.errors.length===0);check('no server failures',page.metrics.failed.length===0);
  const result={status:'PASS',phase,checks:checks.length,layouts:layouts.length,maxCLS:Math.max(...layouts.map(row=>row.cls??0)),providerRequests:page.metrics.providers,runtimeErrors:page.metrics.errors.length};
  await writeFile(`output/p0-browser-${phase}-private.json`,JSON.stringify({result,checks,layouts},null,2));console.info(JSON.stringify(result));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await delay(100);await browser.close();}
