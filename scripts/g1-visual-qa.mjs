// Own-application visual evidence. Never accesses an authenticated user profile.
import {readFile,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base=process.argv[2]??'https://livasports.com', phase=process.argv[3]??'before';
if(!['http://localhost:3300','https://livasports.com'].includes(base)||!['before','local','production'].includes(phase))throw Error('QA_SCOPE');
const browser=await browserQA(),checks=[],layouts=[],resources=[];
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error(name);};
let page;
try{
  page=await browser.newPage();
  for(const [name,path] of [['home','/br'],['mx','/mx'],['match','/br/jogo/flamengo-x-corinthians-48611d6f0a484f87'],['team','/br/time/flamengo-b9c4f07b09aa447a'],['player','/br/jogador/agustin-rossi-27e4e63b6336469b']]){
    for(const width of [375,390,430,768,1440]){
      await page.viewport(width,width===1440?1000:844);await page.navigate(base+path);await delay(600);
      const layout=await page.screenshot(`output/g1-evidence/${phase}-${name}-${width}.png`);layouts.push({name,...layout});
      check(`${name} ${width} no overflow or broken images`,!layout.overflow&&layout.brokenImages===0);
      if(width===390)resources.push({name,...await page.evaluate(`(()=>{const r=performance.getEntriesByType('resource');return {jsBytes:r.filter(x=>x.initiatorType==='script').reduce((n,x)=>n+x.decodedBodySize,0),cssBytes:r.filter(x=>new URL(x.name).pathname.endsWith('.css')).reduce((n,x)=>n+x.decodedBodySize,0),imageBytes:r.filter(x=>x.initiatorType==='img').reduce((n,x)=>n+x.decodedBodySize,0),cls:window.__qaCLS}})()`)});
    }
  }
  await page.viewport(390);await page.navigate(base+'/br');
  await page.click('.slip-trigger');await page.screenshot(`output/g1-evidence/${phase}-slip-empty-390.png`);await page.key('Escape');
  const audit=JSON.parse(await readFile('output/m6-audit-private.json','utf8'));
  const stored={version:1,selections:audit.samples.slice(0,3).map(s=>({fixturePublicId:s.public_id,market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION',addedAt:new Date().toISOString()}))};
  await page.evaluate(`localStorage.setItem('livasports:guest-slip',${JSON.stringify(JSON.stringify(stored))});window.dispatchEvent(new StorageEvent('storage',{key:'livasports:guest-slip'}));`);
  await page.click('.slip-trigger');await page.wait('document.querySelectorAll(".slip-item:not([data-state=PENDING])").length===3');
  for(const width of [390,1440]){await page.viewport(width,width===1440?1000:844);await page.click('.slip-compare-jump');layouts.push({name:'slip',...await page.screenshot(`output/g1-evidence/${phase}-slip-${width}.png`)});}
  check('no runtime failures or browser provider calls',page.metrics.providers===0&&page.metrics.errors.length===0&&page.metrics.failed.length===0);
  await writeFile(`output/g1-${phase}-visual-private.json`,JSON.stringify({at:new Date().toISOString(),base,phase,checks,layouts,resources,metrics:page.metrics},null,2));
  console.log(JSON.stringify({phase,status:'PASS',checks:checks.length,resources}));
}catch(error){console.error(error.message);process.exitCode=1;if(page)await page.screenshot(`output/g1-evidence/${phase}-failure.png`).catch(()=>{});}finally{await browser.close();}
