import {readFile,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base=process.argv[2]??'http://localhost:3300';if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_ORIGIN_NOT_ALLOWED');
const prefix=`output/m6-${base.startsWith('https')?'production':'local'}`;
const audit=JSON.parse(await readFile('output/m6-audit-private.json','utf8'));const browser=await browserQA();const checks=[];
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error('QA_FAILED: '+name);};
try{
  const page=await browser.newPage();let selected=false;
  for(const sample of audit.samples.filter(s=>s.slug==='premier-league'&&Date.parse(s.kickoff)>Date.now())){
    await page.navigate(base+sample.path+'#odds');await delay(500);if(await page.evaluate('!!document.querySelector(".slip-odds-button:not(:disabled)")')){selected=true;break;}
  }
  check('real selectable fixture',selected);
  for(const [market,line] of [['MATCH_WINNER',null],['TOTAL_GOALS',2.5],['BTTS',null]]){
    await page.click('#odds-tab-'+market);await page.click('.slip-odds-button:not(:disabled)');
    if(market!=='MATCH_WINNER'){
      await page.wait('!!document.querySelector(".slip-confirm")&&!!document.querySelector(".slip-item:not([data-state=PENDING])")');
      if(market==='TOTAL_GOALS')await page.screenshot(`${prefix}-replace-390.png`);
      await page.click('.slip-confirm button');await page.wait(`document.querySelector('.slip-item')?.dataset.selection.includes('${market}')`);
    }else{await page.click('.slip-trigger');}
    await page.wait('!!document.querySelector(".slip-price")');
    check(`${market} canonical single intent`,await page.evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('livasports:guest-slip')).selections;return s.length===1&&s[0].market==='${market}'&&s[0].line===${JSON.stringify(line)}})()`));
    if(market==='BTTS')await page.screenshot(`${prefix}-btts-390.png`);
    await page.key('Escape');await page.click('.slip-odds-button:not(:disabled)');await page.click('.slip-odds-button:not(:disabled)');
    check(`${market} repeated taps remain one`,await page.evaluate('JSON.parse(localStorage.getItem("livasports:guest-slip")).selections.length===1&&!document.querySelector(".slip-confirm")'));
  }
  check('no browser errors/provider calls',page.metrics.providers===0&&page.metrics.errors.length===0&&page.metrics.failed.length===0);
  const result={base,status:'PASS',checks,metrics:page.metrics};console.info(JSON.stringify(result));await writeFile(`${prefix}-markets-private.json`,JSON.stringify(result,null,2));
}finally{await browser.close();}
