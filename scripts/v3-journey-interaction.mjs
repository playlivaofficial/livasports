// Only isolated public local pages. No Owner session, model calls or database writes.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const dir='output/v3-qa/acceptance-2026-10-22/complete-journey',browser=await browserQA(),evidence=[];
try{
 const page=await browser.newPage();
 for(const theme of ['light','dark']){
  await page.viewport(390,844);await page.evaluate('window.__old=true');
  await page.c.send('Page.navigate',{url:'http://localhost:3351/en'});
  await page.wait('!window.__old && document.readyState==="complete" && !!document.querySelector(".sw-tabs")',60000);
  await page.evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);
  await page.click('.sw-all-sports summary');
  assert.equal(await page.evaluate('document.querySelector(".sw-all-sports").open'),true);
  const targets=await page.evaluate('Array.from(document.querySelectorAll(".sw-all-sports a"),e=>({href:e.getAttribute("href"),height:e.getBoundingClientRect().height}))');
  assert.equal(targets.length,7);assert.ok(targets.every(t=>t.height>=44));
  await page.screenshot(`${dir}/navigation-${theme}-390.png`);await page.click('.sw-all-sports summary');
  await page.evaluate('document.querySelector(".sw-tabs").scrollIntoView({block:"start"})');
  await page.click('#sw-tab-1');await page.wait('document.querySelector("#sw-tab-1").getAttribute("aria-selected")==="true"');
  assert.ok(await page.evaluate('document.querySelector("#sw-panel").innerText.includes("FC Bayern")'));
  await page.screenshot(`${dir}/standings-bundesliga-${theme}-390.png`);
  await page.c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
  await page.c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
  await page.wait('document.querySelector("#sw-tab-0").getAttribute("aria-selected")==="true"');
  assert.ok(await page.evaluate('document.querySelector("#sw-panel").innerText.includes("Deportivo Cali")'));
  await page.click('.sw-provenance summary');await delay(150);
  await page.screenshot(`${dir}/standings-colombia-${theme}-390.png`);
  evidence.push({theme,targets,mouseTabSwitch:true,keyboardTabSwitch:true,sourceDisclosure:true});
 }
 assert.equal(page.metrics.providers,0);assert.deepEqual(page.metrics.errors,[]);
 await writeFile(`${dir}/interaction.json`,JSON.stringify({at:new Date().toISOString(),evidence,metrics:page.metrics},null,2));
}finally{await browser.close();}
