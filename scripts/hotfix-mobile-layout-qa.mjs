// Hotfix QA: header My Matches contrast, mobile fixture favorite collisions, bookmaker label attachment,
// creative scaling and desktop parity — measured geometry in headless Chromium against a built app or production.
//   node scripts/hotfix-mobile-layout-qa.mjs https://livasports.com [--widths=320,360,375,390,430,768,1024,1440] [--screens]
// No clicks on monetised links; favorites/odds interactions are exercised on the first fixture only and reverted.
import {writeFile,mkdir} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
import {layoutProbe} from './hotfix-layout-probe.mjs';
const args=process.argv.slice(2);
const base=args.find(a=>!a.startsWith('--'))??'http://localhost:3300';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_ORIGIN_NOT_ALLOWED');
const widths=(args.find(a=>a.startsWith('--widths='))?.slice(9)??'320,360,375,390,430,768,1024,1440').split(',').map(Number);
const screens=args.includes('--screens');
const pages={br:'/br/futebol?view=upcoming',en:'/en/football?view=upcoming',mx:'/mx/futbol?view=upcoming'};
const browser=await browserQA(),results=[],checks=[];
const check=(name,pass,detail)=>{checks.push({name,pass,detail});if(!pass)process.exitCode=1;};
try{
  const page=await browser.newPage(390,844);
  for(const [locale,path] of Object.entries(pages))for(const theme of ['light','dark'])for(const width of widths){
    await page.viewport(width,width>=768?900:844);
    await page.navigate(base+path);
    await page.evaluate(`localStorage.setItem('livasports:theme',${JSON.stringify(theme)});document.documentElement.dataset.theme=${JSON.stringify(theme)};true`);
    await delay(250);
    const probe=await page.evaluate(layoutProbe);
    results.push({locale,theme,width,...probe});
    const id=`${locale}/${theme}/${width}`;
    check(`${id}: header star contrast ≥3:1 and visible`,probe.header?.glyphVisible&&probe.header.glyphContrast>=3,probe.header);
    if(width>620)check(`${id}: header My Matches text contrast ≥4.5:1`,(probe.header?.textContrast??0)>=4.5,probe.header);
    check(`${id}: fixture favorite collisions = 0 (${probe.starsChecked} stars)`,probe.starsChecked>0&&probe.collisions.length===0,probe.collisions.slice(0,3));
    check(`${id}: bookmaker labels attached to their own odds group`,probe.labels.total>0&&probe.labels.detached.length===0&&probe.labels.threeCells,probe.labels.detached.slice(0,3));
    check(`${id}: no horizontal overflow`,probe.overflow<=0,probe.overflow);
    if(probe.creative)check(`${id}: creative not upscaled`,!probe.creative.upscaled,probe.creative);
    if(screens)await page.screenshot(`output/hotfix-screens/${locale}-${theme}-${width}.png`);
  }
  // Interaction isolation on the first fixture (390, br): favorite toggles only the favorite; an odd only the slip.
  await page.viewport(390,844);await page.navigate(base+pages.br);
  const before=await page.evaluate(`JSON.stringify({fav:document.querySelector('.fixture-row .favorite-toggle-row')?.getAttribute('aria-pressed'),slip:JSON.parse(localStorage.getItem('livasports:guest-slip')||'{"selections":[]}').selections.length,path:location.pathname})`);
  await page.click('.fixture-row .favorite-toggle-row');await delay(600);
  const afterFav=await page.evaluate(`JSON.stringify({fav:document.querySelector('.fixture-row .favorite-toggle-row')?.getAttribute('aria-pressed'),slip:JSON.parse(localStorage.getItem('livasports:guest-slip')||'{"selections":[]}').selections.length,path:location.pathname})`);
  const b=JSON.parse(before),a=JSON.parse(afterFav);
  check('favorite tap toggles only the favorite (no slip change, no navigation)',a.fav!==b.fav&&a.slip===b.slip&&a.path===b.path,{before:b,after:a});
  await page.click('.fixture-row .favorite-toggle-row');await delay(600); // revert
  await page.click('.fixture-row button.listing-odds-select');await delay(600);
  const afterOdd=JSON.parse(await page.evaluate(`JSON.stringify({fav:document.querySelector('.fixture-row .favorite-toggle-row')?.getAttribute('aria-pressed'),slip:JSON.parse(localStorage.getItem('livasports:guest-slip')||'{"selections":[]}').selections.length,path:location.pathname})`));
  check('odd tap updates only the slip (no favorite change, no navigation)',afterOdd.slip===b.slip+1&&afterOdd.fav===b.fav&&afterOdd.path===b.path,{before:b,after:afterOdd});
  await page.evaluate(`localStorage.removeItem('livasports:guest-slip');true`);
  check('no sports-provider requests during QA',page.metrics.providers===0,page.metrics.providers);
}finally{await browser.close();}
await mkdir('output',{recursive:true});
await writeFile('output/hotfix-layout-qa.json',JSON.stringify({base,checks,results},null,2));
console.log(JSON.stringify({status:checks.some(c=>!c.pass)?'FAIL':'PASS',checks:checks.length,failed:checks.filter(c=>!c.pass).map(c=>c.name)},null,1));
