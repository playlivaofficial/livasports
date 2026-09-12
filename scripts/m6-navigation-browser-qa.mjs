import {readFile,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base=process.argv[2]??'http://localhost:3300';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_ORIGIN_NOT_ALLOWED');
const prefix=`output/m6-${base.startsWith('https')?'production':'local'}`;
const audit=JSON.parse(await readFile('output/m6-audit-private.json','utf8'));
const stored={version:1,selections:audit.samples.slice(0,10).map(s=>({fixturePublicId:s.public_id,market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION',addedAt:new Date().toISOString()}))};
const browser=await browserQA();const checks=[];let page;
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error('QA_FAILED: '+name);};
try{
  page=await browser.newPage();await page.navigate(base+'/br/jogo/flamengo-x-corinthians-48611d6f0a484f87');
  await page.evaluate(`localStorage.setItem('livasports:guest-slip',${JSON.stringify(JSON.stringify(stored))});window.dispatchEvent(new StorageEvent('storage',{key:'livasports:guest-slip'}));window.__qaSpaMarker=true;`);
  await page.click('.slip-trigger');await page.wait('document.querySelectorAll(".slip-item:not([data-state=PENDING])").length===10');
  for(const width of [375,390,430,768,1440]){
    await page.viewport(width,width===1440?1000:844);
    check(`last item reachable ${width}`,await page.evaluate('(()=>{const b=document.querySelector(".slip-item:last-child .slip-remove");b.scrollIntoView({block:"nearest"});const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()'));
    check(`44px controls ${width}`,await page.evaluate('[...document.querySelectorAll(".slip-remove,.slip-icon-button,.slip-trigger")].every(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.width>=44})'));
    const layout=await page.screenshot(`${prefix}-ten-scrolled-${width}.png`);check(`scrolled no overflow ${width}`,!layout.overflow);
  }
  await page.viewport(390);await page.click('.slip-item:last-child .slip-remove');await page.wait('document.querySelectorAll(".slip-item").length===9');
  check('last remove preserves meaningful keyboard focus',await page.evaluate('document.activeElement.classList.contains("slip-remove")'));
  await page.key('Escape');await page.click('a[href="/br/time/flamengo-b9c4f07b09aa447a"]');
  await page.wait(`location.pathname.startsWith('/br/time/')&&!!document.querySelector('a[href^="/br/jogador/"]')`);
  check('Match Center to team is SPA and preserves slip',await page.evaluate('window.__qaSpaMarker&&document.querySelector(".slip-trigger .slip-count").textContent==="9"'));
  const teamPath=await page.evaluate('location.pathname');await page.click('a[href="/br/jogador/agustin-rossi-27e4e63b6336469b"]');
  await page.wait('location.pathname.startsWith("/br/jogador/")');await delay(500);
  check('team to player is SPA and preserves slip',await page.evaluate('window.__qaSpaMarker&&document.querySelector(".slip-trigger .slip-count").textContent==="9"'));
  const playerPath=await page.evaluate('location.pathname');
  await page.evaluate('history.back()');await page.wait(`location.pathname===${JSON.stringify(teamPath)}`);await delay(500);
  check('back retains intent',await page.evaluate('document.querySelector(".slip-trigger .slip-count").textContent==="9"'));
  await page.evaluate('history.forward()');await page.wait(`location.pathname===${JSON.stringify(playerPath)}`);await delay(500);
  check('forward retains intent',await page.evaluate('document.querySelector(".slip-trigger .slip-count").textContent==="9"'));
  await page.screenshot(`${prefix}-player-persistence-390.png`);
  await page.click('a[href^="/mx"]');await page.wait('location.pathname.startsWith("/mx")');await delay(500);await page.click('.slip-trigger');
  await page.wait('document.querySelectorAll(".slip-item:not([data-state=PENDING])").length===9');
  check('SPA locale switch relocalizes without BR pricing',await page.evaluate('document.querySelector(".slip-panel").textContent.includes("Mi boleto")&&!document.querySelector(".slip-price")'));
  await page.screenshot(`${prefix}-spa-mx-390.png`);
  check('no browser provider request',page.metrics.providers===0);check('no browser errors',page.metrics.errors.length===0&&page.metrics.failed.length===0);
  const result={status:'PASS',base,checks,metrics:page.metrics};console.info(JSON.stringify(result));await writeFile(`${prefix}-navigation-qa-private.json`,JSON.stringify(result,null,2));
}catch(error){console.error(error.message);if(page)await page.screenshot(`${prefix}-navigation-failure.png`).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
