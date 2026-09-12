import {writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base=process.argv[2]??'http://localhost:3300';if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_ORIGIN_NOT_ALLOWED');
const prefix=base.startsWith('https')?'m8-production':'m8-local';
const browser=await browserQA(),checks=[],layouts=[];let page;
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error(name);};
try{page=await browser.newPage();
  for(const [name,path] of [['home','/br'],['mx','/mx'],['match','/br/jogo/flamengo-x-corinthians-48611d6f0a484f87'],['team','/br/time/flamengo-b9c4f07b09aa447a'],['player','/br/jogador/agustin-rossi-27e4e63b6336469b']]){
    await page.navigate(base+path);await delay(1100);
    check(name+' no ineligible sponsor or CTA',await page.evaluate('!document.querySelector(".commercial-sponsor,a[rel~=sponsored]")'));
    for(const width of [375,390,430,768,1440]){await page.viewport(width,width===1440?1000:844);await delay(100);const layout=await page.screenshot(`output/${prefix}-${name}-${width}.png`);layouts.push({name,...layout});check(name+' no overflow/broken images '+width,!layout.overflow&&layout.brokenImages===0);}
  }
  check('no runtime/provider failures',page.metrics.providers===0&&page.metrics.errors.length===0&&page.metrics.failed.length===0);
  const result={at:new Date().toISOString(),base,status:'PASS',checks,layouts,metrics:page.metrics};await writeFile(`output/${prefix}-pages-private.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({status:'PASS',checks,metrics:page.metrics}));
}catch(error){console.error(error.message);if(page)await page.screenshot(`output/${prefix}-pages-failure.png`).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
