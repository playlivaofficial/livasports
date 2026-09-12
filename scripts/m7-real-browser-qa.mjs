// Local M7 production build, REAL persisted sports/odds reads. Only telemetry is stubbed:
// the additive production analytics migration is intentionally pending the authorized release.
import {readFile,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base='http://localhost:3300';const audit=JSON.parse(await readFile('output/m6-audit-private.json','utf8'));
const stored={version:1,selections:audit.samples.slice(0,10).map(s=>({fixturePublicId:s.public_id,market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION',addedAt:new Date().toISOString()}))};
const browser=await browserQA(),checks=[];let page;
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error('QA_FAILED: '+name);};
try{
  page=await browser.newPage();await page.c.send('Fetch.enable',{patterns:[{urlPattern:base+'/api/events'}]});
  page.c.on('Fetch.requestPaused',e=>page.c.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:204}));
  await page.navigate(base+'/br/jogo/flamengo-x-corinthians-48611d6f0a484f87');
  await page.evaluate(`localStorage.setItem('livasports:guest-slip',${JSON.stringify(JSON.stringify(stored))});window.dispatchEvent(new StorageEvent('storage',{key:'livasports:guest-slip'}));window.__qaSpaMarker=true;`);
  await page.click('.slip-trigger');await page.wait('document.querySelectorAll(".slip-item:not([data-state=PENDING])").length===10');
  for(const width of [375,390,430,768,1440]){
    await page.viewport(width,width===1440?1000:844);
    check(`tenth removal reachable ${width}`,await page.evaluate('(()=>{const b=document.querySelector(".slip-item:last-child .slip-remove");b.scrollIntoView({block:"nearest"});const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b})()'));
    check(`44px targets ${width}`,await page.evaluate('[...document.querySelectorAll(".slip-remove,.slip-trigger,.slip-icon-button")].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44})'));
    await page.click('.slip-compare-jump');const layout=await page.screenshot(`output/m7-real-ten-${width}.png`);check(`real state no overflow ${width}`,!layout.overflow);
    check(`fixed header intact ${width}`,await page.evaluate('document.querySelector(".slip-panel").scrollTop===0'));
  }
  await page.viewport(390);await page.click('.slip-item:last-child .slip-remove');await page.wait('document.querySelectorAll(".slip-item").length===9');check('removal focus',await page.evaluate('document.activeElement.classList.contains("slip-remove")'));
  await page.key('Escape');await page.click('a[href="/br/time/flamengo-b9c4f07b09aa447a"]');await page.wait(`location.pathname.startsWith('/br/time/')&&!!document.querySelector('a[href^="/br/jogador/"]')`);
  check('Match Center to team SPA preserves slip',await page.evaluate('window.__qaSpaMarker&&document.querySelector(".slip-trigger .slip-count").textContent==="9"'));
  const team=await page.evaluate('location.pathname');await page.click('a[href="/br/jogador/agustin-rossi-27e4e63b6336469b"]');await page.wait('location.pathname.startsWith("/br/jogador/")');await delay(300);
  check('team to player SPA preserves slip',await page.evaluate('window.__qaSpaMarker&&document.querySelector(".slip-trigger .slip-count").textContent==="9"'));const player=await page.evaluate('location.pathname');
  await page.evaluate('history.back()');await page.wait(`location.pathname===${JSON.stringify(team)}`);await page.evaluate('history.forward()');await page.wait(`location.pathname===${JSON.stringify(player)}`);
  check('back/forward preserve intent',await page.evaluate('document.querySelector(".slip-trigger .slip-count").textContent==="9"'));
  await page.click('a[href^="/mx"]');await page.wait('location.pathname.startsWith("/mx")');await page.click('.slip-trigger');await page.wait('document.querySelectorAll(".slip-item:not([data-state=PENDING])").length===9');
  check('real MX relocalizes and has no BR prices',await page.evaluate('document.querySelector(".slip-panel").textContent.includes("Mi boleto")&&!document.querySelector(".slip-price")&&!document.querySelector(".slip-combined")&&!document.querySelector(".slip-bookmaker-cta")'));
  await page.click('.slip-compare-jump');await page.screenshot('output/m7-real-mx-390.png');
  await page.navigate(base+'/br?slip=unavailable');await page.wait('!!document.querySelector(".slip-panel")&&document.querySelector(".slip-inline-feedback")?.textContent.includes("Não foi possível abrir")');check('rejected outbound reopens saved slip with localized explanation',true);
  await page.screenshot('output/m7-real-outbound-fallback-390.png');
  check('no provider/browser/runtime failures',page.metrics.providers===0&&page.metrics.errors.length===0&&page.metrics.failed.length===0);
  const result={at:new Date().toISOString(),status:'PASS',mode:'REAL_DATA_LOCAL_BUILD_TELEMETRY_STUB_ONLY',checks,metrics:page.metrics};await writeFile('output/m7-real-browser-private.json',JSON.stringify(result,null,2));console.info(JSON.stringify(result));
}catch(error){console.error(error.message);if(page)await page.screenshot('output/m7-real-failure.png').catch(()=>{});process.exitCode=1;}finally{await browser.close();}
