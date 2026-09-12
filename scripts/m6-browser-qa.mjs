import {readFile,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base=process.argv[2]??'http://localhost:3300';const mode=process.argv[3]??'empty';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw new Error('QA_ORIGIN_NOT_ALLOWED');
const production=base.startsWith('https');const prefix=`output/m6-${production?'production':'local'}`;
const browser=await browserQA();const checks=[];
let page;
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw new Error(`QA_FAILED: ${name}`);};
try{
  page=await browser.newPage();await page.navigate(base+'/br');await page.click('.slip-trigger');await page.wait('!!document.querySelector(".slip-empty")');
  check('empty slip localized',await page.evaluate('document.querySelector(".slip-panel").textContent.includes("Nenhuma aposta foi realizada")'));
  for(const width of [375,390,430,768,1440]){await page.viewport(width,width===1440?1000:844);await delay(100);const l=await page.screenshot(`${prefix}-empty-${width}.png`);check(`empty no overflow ${width}`,!l.overflow);}
  await page.key('Escape');check('Escape and focus return',await page.evaluate('!document.querySelector(".slip-panel")&&document.activeElement===document.querySelector(".slip-trigger")'));
  if(mode==='empty'){
    await page.viewport(390);await page.navigate(base+'/mx');await page.click('.slip-trigger');await page.screenshot(`${prefix}-mx-empty-390.png`);
  }else{
    const audit=JSON.parse(await readFile('output/m6-audit-private.json','utf8'));const samples=audit.samples.filter(s=>s.status==='SCHEDULED'&&Date.parse(s.kickoff)>Date.now()&&s.has_retained_active_quotes);
    const added=[];
    await page.viewport(390);
    for(const sample of samples){
      await page.navigate(base+sample.path.replace(/^\/mx\/partido/,'/br/jogo')+'#odds');
      await page.wait('!!document.querySelector("#odds")');await delay(500);
      if(!await page.evaluate('!!document.querySelector(".slip-odds-button:not(:disabled)")'))continue;
      if(!added.length){await page.activate();await page.evaluate('document.querySelector(".slip-odds-button:not(:disabled)").focus()');await delay(400);await page.key('Enter');
        console.info(JSON.stringify({stage:'KEYBOARD_ADD',focus:await page.evaluate('({active:document.activeElement?.className,stored:!!localStorage.getItem("livasports:guest-slip"),focused:document.hasFocus()})')}));
      }
      else await page.click('.slip-odds-button:not(:disabled)');added.push(sample);
      check('intent count '+added.length,await page.evaluate(`JSON.parse(localStorage.getItem('livasports:guest-slip')).selections.length===${Math.min(added.length,10)}`));
      if(added.length===1){
        check('selected button state',await page.evaluate('document.querySelector(".slip-odds-button").getAttribute("aria-pressed")==="true"'));
        await page.click('.slip-trigger');await page.wait('document.querySelectorAll(".slip-price").length===1');await page.screenshot(`${prefix}-one-390.png`);
        await page.key('Escape');await page.click('#odds-tab-TOTAL_GOALS');await page.click('.slip-odds-button:not(:disabled)');await page.wait('!!document.querySelector(".slip-confirm")');
        await page.wait('!!document.querySelector(".slip-item:not([data-state=PENDING])")');
        await page.screenshot(`${prefix}-replace-390.png`);await page.click('.slip-confirm button');await page.wait('!document.querySelector(".slip-confirm")');
        check('one per match replacement',await page.evaluate('JSON.parse(localStorage.getItem("livasports:guest-slip")).selections.length===1&&JSON.parse(localStorage.getItem("livasports:guest-slip")).selections[0].market==="TOTAL_GOALS"'));
        await page.key('Escape');
      }
      if(added.length===3){await page.click('.slip-trigger');await page.wait('document.querySelectorAll(".slip-item").length===3&&document.querySelectorAll(".slip-price").length===3');
        for(const width of [375,390,430,768,1440]){await page.viewport(width,width===1440?1000:844);await delay(100);const l=await page.screenshot(`${prefix}-three-${width}.png`);check(`three no overflow ${width}`,!l.overflow);}
        await page.key('Escape');await page.viewport(390);
      }
      if(added.length===11){check('limit notice',await page.evaluate('document.querySelector(".slip-feedback").textContent.includes("10")'));break;}
    }
    check('ten real selections plus eleventh attempt',added.length>=11);
    await page.click('.slip-trigger');await page.wait('document.querySelectorAll(".slip-item").length===10&&document.querySelectorAll(".slip-price").length===10');await page.screenshot(`${prefix}-ten-390.png`);
    await page.key('Escape');const stored=await page.evaluate('localStorage.getItem("livasports:guest-slip")');
    check('no stored prices or bookmaker identity',!stored.includes('decimalOdds')&&!stored.includes('bookmaker')&&!stored.includes('kickoff'));
    await page.reload();
    check('refresh persistence',await page.evaluate('document.querySelector(".slip-trigger .slip-count").textContent==="10"'));
    for(const path of ['/br/time/flamengo-b9c4f07b09aa447a','/br/jogador/agustin-rossi-27e4e63b6336469b','/br/futebol','/mx']){
      await page.navigate(base+path);check(`persistence ${path}`,await page.evaluate('document.querySelector(".slip-trigger .slip-count").textContent==="10"'));
    }
    await page.click('.slip-trigger');await page.wait('document.querySelectorAll(".slip-item[data-state=UNAVAILABLE]").length===10');
    check('MX does not expose BR prices',await page.evaluate('document.querySelectorAll(".slip-price").length===0&&document.querySelector(".slip-panel").textContent.includes("Mi boleto")'));
    await page.screenshot(`${prefix}-mx-saved-390.png`);
    const second=await browser.newPage();await second.navigate(base+'/br');await second.click('.slip-trigger');await second.wait('document.querySelectorAll(".slip-item").length===10');
    await second.click('.slip-remove');await page.activate();await page.wait('document.querySelectorAll(".slip-item").length===9');check('two tabs synchronize removal',true);
    await page.click('.slip-summary button');await page.wait('!!document.querySelector(".slip-confirm")');await page.click('.slip-confirm button');await page.wait('!!document.querySelector(".slip-empty")');
    check('clear all confirmation',await page.evaluate('JSON.parse(localStorage.getItem("livasports:guest-slip")).selections.length===0'));
    await second.activate();await second.wait('!!document.querySelector(".slip-empty")');check('clear synchronizes tabs',true);
    await second.evaluate('localStorage.setItem("livasports:guest-slip","corrupt-json")');await second.reload();await second.click('.slip-trigger');
    check('corrupt persistence does not break site',await second.evaluate('!!document.querySelector(".slip-empty")&&!!document.querySelector(".slip-notice")'));
    checks.push({name:'second-tab no JS/provider errors',pass:second.metrics.providers===0&&second.metrics.errors.length===0&&second.metrics.failed.length===0});
  }
  check('no browser provider call',page.metrics.providers===0);check('no JavaScript error',page.metrics.errors.length===0);check('no app 5xx',page.metrics.failed.length===0);
  console.info(JSON.stringify({mode,base,checks}));await writeFile(`${prefix}-${mode}-qa-private.json`,JSON.stringify({mode,base,checks,metrics:page.metrics},null,2));
}catch(error){console.error(error.message);if(page)await page.screenshot(`${prefix}-failure.png`).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
