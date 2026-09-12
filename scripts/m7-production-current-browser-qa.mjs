// Saved canonical intent comes from actual current production quotes. No HTTP replay.
import {readFile,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const evidence=JSON.parse(await readFile('output/m7-production-prices-private.json','utf8'));
const browser=await browserQA(),checks=[];let page;
function check(name,pass,detail){checks.push({name,pass,detail});if(!pass)throw Error('QA_FAILED: '+name);}
function display(s){const [a,b='']=s.split('.');const cents=BigInt(a)*100n+BigInt((b+'00').slice(0,2))+(Number(b[2]??0)>=5?1n:0n);return `${(cents/100n).toLocaleString('pt-BR')},${String(cents%100n).padStart(2,'0')}`;}
try{
  page=await browser.newPage();await page.navigate('https://livasports.com/br');
  for(const key of ['1','3','10','partial'].filter(k=>evidence.samples[k])){
    const sample=evidence.samples[key],stored={version:1,selections:sample.selections.map(s=>({...s,addedAt:new Date().toISOString()}))};
    if(await page.evaluate('!!document.querySelector(".slip-panel")'))await page.key('Escape');
    await page.evaluate(`localStorage.setItem('livasports:guest-slip',${JSON.stringify(JSON.stringify(stored))});window.dispatchEvent(new StorageEvent('storage',{key:'livasports:guest-slip'}));`);
    await page.click('.slip-trigger');await page.wait(`document.querySelectorAll('.slip-item:not([data-state=PENDING])').length===${sample.selections.length}&&document.querySelectorAll('.slip-bookmaker').length===2`);
    await page.click('.slip-compare-jump');await delay(250);
    const actual=await page.evaluate(`[...document.querySelectorAll('.slip-bookmaker')].map(b=>({id:b.dataset.bookmaker,complete:b.dataset.complete,total:b.querySelector('.slip-combined strong')?.textContent??null,best:!!b.querySelector('.slip-best-label'),cta:!!b.querySelector('.slip-bookmaker-cta'),missing:!!b.querySelector('.slip-missing[open]')}))`);
    for(const expected of sample.value.comparison.bookmakers){const b=actual.find(b=>b.id===expected.bookmakerId);check(`real ${key} ${b.id} exact UI price and state`,b.total===(expected.combinedDecimalOdds?display(expected.combinedDecimalOdds):null)&&b.best===expected.best&&b.complete===String(expected.complete)&&!b.cta&&(expected.complete||b.missing),b);}
    for(const width of key==='10'?[375,390,430,768,1440]:[390]){
      await page.viewport(width,width===1440?1000:844);await page.click('.slip-compare-jump');
      const layout=await page.screenshot(`output/m7-production-current-${key}-${width}.png`);check(`real ${key} ${width} no overflow/broken images`,!layout.overflow&&!layout.brokenImages);
    }
  }
  check('real production current browser no runtime/provider failures',page.metrics.providers===0&&page.metrics.errors.length===0&&page.metrics.failed.length===0);
  const result={at:new Date().toISOString(),status:'PASS',base:'https://livasports.com',mode:'REAL_CURRENT_DATA_AND_TELEMETRY',checks,metrics:page.metrics};await writeFile('output/m7-production-current-browser-private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){console.error(error.message);if(page)await page.screenshot('output/m7-production-current-failure.png').catch(()=>{});process.exitCode=1;}finally{await browser.close();}
