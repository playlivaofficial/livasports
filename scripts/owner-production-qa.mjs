// Production owner-access QA. Reads the ignored permanent key without exposing it in output.
import {access,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {browserQA,delay} from './browser-qa-driver.mjs';

const origin=(process.env.OWNER_QA_ORIGIN??'https://livasports.com').replace(/\/$/,'');
const artifact=await readFile(resolve('output/hardening-owner-permanent-key.txt'),'utf8');
const key=/^PERMANENT_OWNER_KEY=([A-Za-z0-9_-]{43,128})$/m.exec(artifact)?.[1];
if(!key)throw new Error('PRIVATE_OWNER_KEY_ARTIFACT_INVALID');

async function load(page,path){
  await page.evaluate('window.__ownerQaOld=true');
  await page.c.send('Page.navigate',{url:origin+path});
  await page.wait('!window.__ownerQaOld && document.readyState==="complete"',30000);
  await delay(350);
}
async function button(page,label){
  const clicked=await page.evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(node=>node.textContent?.trim()===${JSON.stringify(label)});if(!button)return false;button.click();return true;})()`);
  if(!clicked)throw new Error('OWNER_QA_BUTTON_NOT_FOUND');
}
async function oneSession({browser,width,full}){
  const previous=process.env.CHROME_PATH;process.env.CHROME_PATH=browser;
  const qa=await browserQA();if(previous===undefined)delete process.env.CHROME_PATH;else process.env.CHROME_PATH=previous;
  try{
    const page=await qa.newPage(width,width<=430?844:900);
    await load(page,'/owner/preview');
    const anonymousUi=await page.evaluate(`document.body.innerText.includes('Private owner access key')&&!document.body.innerText.includes('Brazil preview:')`);
    const anonymousToggle=await page.evaluate(`fetch('/api/owner/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'preview',enabled:true})}).then(r=>r.status)`);
    await page.evaluate(`document.querySelector('#owner-key').focus()`);
    await page.c.send('Input.insertText',{text:key});
    await page.evaluate(`document.querySelector('form').requestSubmit()`);
    await page.wait(`document.body?.innerText.includes('Brazil preview:')`,30000);
    const cookies=(await page.c.send('Network.getCookies',{urls:[origin]})).cookies;
    const session=cookies.find(cookie=>cookie.name==='__Host-livasports_owner');
    const cookieSecure=!!session?.secure,cookieHttpOnly=!!session?.httpOnly,cookieSameSite=session?.sameSite==='Strict';
    const sessionDays=session?.expires?Math.round((session.expires-Date.now()/1000)/86400):0;
    await button(page,'Turn Brazil preview on');
    await page.wait(`document.body?.innerText.includes('Brazil preview: ON')`,30000);
    await load(page,'/br');
    await page.wait(`document.body?.innerText.includes('QA_TEST · Brazil preview ON')`,30000);
    await delay(1500);
    const br=await page.evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth||document.body.scrollWidth>innerWidth,ownerBar:document.body.innerText.includes('QA_TEST · Brazil preview ON'),commercial:!!document.querySelector('.commercial-sponsor,.affiliate-action')})`);
    await load(page,'/br/futebol');
    const navigationSession=await page.evaluate(`document.body.innerText.includes('QA_TEST · Brazil preview ON')`);
    await page.c.send('Page.reload');await page.wait(`document.readyState==='complete'&&document.body?.innerText.includes('QA_TEST · Brazil preview ON')`,30000);
    const reloadSession=true;
    let logout=true;
    if(full){await load(page,'/owner/preview');await button(page,'Sign out');await page.wait(`document.body?.innerText.includes('Private owner access key')`,30000);const after=(await page.c.send('Network.getCookies',{urls:[origin]})).cookies;logout=!after.some(cookie=>cookie.name==='__Host-livasports_owner');}
    return {anonymousUi,anonymousToggleBlocked:anonymousToggle===401,login:true,cookieSecure,cookieHttpOnly,cookieSameSite,sessionThirtyDays:sessionDays>=29&&sessionDays<=30,previewOn:br.ownerBar,commercialPreview:br.commercial,navigationSession,reloadSession,logout,mobileNoOverflow:width>430||!br.overflow,providerRequests:page.metrics.providers};
  }finally{await qa.close();}
}

const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
await access(chrome);await access(edge);
const results={
  chromeIncognito:await oneSession({browser:chrome,width:1440,full:true}),
  secondBrowser:await oneSession({browser:edge,width:1440,full:false}),
  mobileBrowser:await oneSession({browser:chrome,width:390,full:false}),
};
const pass=Object.values(results).every(result=>Object.entries(result).every(([name,value])=>name==='providerRequests'?value===0:value===true));
console.info(JSON.stringify({pass,results,plaintextPrinted:false,hashPrinted:false}));
if(!pass)process.exitCode=1;
