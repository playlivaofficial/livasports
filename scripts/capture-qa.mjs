import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';

const [url, widthText, heightText, output, market, advanceMinutesText] = process.argv.slice(2);
const waitForRealExpiry=advanceMinutesText==='wait-expiry';
const advanceMinutes=waitForRealExpiry?0:Number(advanceMinutesText||0);
if(advanceMinutes&&(!['localhost','127.0.0.1'].includes(new URL(url).hostname)||advanceMinutes<0||advanceMinutes>10080))throw new Error('Clock replay is local QA only');
const width = Number(widthText);
const height = Number(heightText);
if (!url || !Number.isInteger(width) || !Number.isInteger(height) || !output) {
  throw new Error('Usage: node scripts/capture-qa.mjs <url> <width> <height> <output>');
}

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileRoot=resolve(tmpdir());
const profile=await mkdtemp(join(profileRoot,'livasports-qa-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

function devtoolsUrl() {
  return new Promise((resolveUrl, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('Chrome DevTools startup timed out')), 15_000);
    chrome.stderr.setEncoding('utf8');
    chrome.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timer);
      resolveUrl(match[1]);
    });
    chrome.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited before DevTools connected (${code ?? 'unknown'})`));
    });
  });
}

const browserSocket = await devtoolsUrl();
const versionUrl = new URL(browserSocket);
const targets = await fetch(`http://${versionUrl.host}/json/list`).then(response => response.json());
const page = targets.find(target => target.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('Chrome page target was not found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => {
  socket.addEventListener('open', resolveOpen, { once: true });
  socket.addEventListener('error', () => reject(new Error('Chrome DevTools socket failed')), { once: true });
});

let messageId = 0;
const pending = new Map();
const events = new Map();
let providerApiRequests=0;let javascriptExceptions=0;let failedAppResponses=0;
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data));
  if(message.method==='Network.requestWillBeSent'&&/^https:\/\/api\.(?:sportmonks\.com|oddspapi\.io)\//.test(message.params.request.url))providerApiRequests++;
  if(message.method==='Runtime.exceptionThrown')javascriptExceptions++;
  if(message.method==='Network.responseReceived'&&message.params.response.status>=500&&new URL(message.params.response.url).origin===new URL(url).origin)failedAppResponses++;
  if (message.id) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
    return;
  }
  const waiters = events.get(message.method) ?? [];
  events.delete(message.method);
  waiters.forEach(resolveEvent => resolveEvent(message.params));
});

function send(method, params = {}) {
  const id = ++messageId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveResult, reject) => pending.set(id, { resolve: resolveResult, reject }));
}

function once(method) {
  return new Promise(resolveEvent => {
    const waiters = events.get(method) ?? [];
    waiters.push(resolveEvent);
    events.set(method, waiters);
  });
}

try {
  await send('Page.enable');
  await send('Network.enable');await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qaCLS=0;new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__qaCLS+=e.value}).observe({type:'layout-shift',buffered:true});`});
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 430 });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  await new Promise(resolveWait => setTimeout(resolveWait, 3_000));
  if (market && ['MATCH_WINNER','TOTAL_GOALS','BTTS'].includes(market)) await send('Runtime.evaluate', { expression: `document.getElementById(${JSON.stringify(`odds-tab-${market}`)})?.click()` });
  await send('Runtime.evaluate', { expression: `if (location.hash) document.querySelector(location.hash)?.scrollIntoView({block:'start',behavior:'instant'})` });
  await new Promise(resolveWait => setTimeout(resolveWait, 250));
  if(advanceMinutes){
    await send('Runtime.evaluate',{expression:`Date.now=(()=>{const original=Date.now;return ()=>original()+${advanceMinutes*60000}})();document.documentElement.dataset.qaClockReplay=${JSON.stringify(String(advanceMinutes))}`});
    await new Promise(resolveWait=>setTimeout(resolveWait,1500));
  }
  if(waitForRealExpiry){
    const observation=await send('Runtime.evaluate',{returnByValue:true,expression:`({at:document.querySelector('#odds time')?.dateTime,active:document.querySelectorAll('#odds .pregame-price:not(.is-unavailable)').length})`});
    const deadline=Date.parse(observation.result.value.at)+15*60000+2000;
    if(!observation.result.value.active||!Number.isFinite(deadline)||deadline-Date.now()>16*60000)throw new Error('No bounded current-odds expiry sample');
    while(Date.now()<deadline){console.info(JSON.stringify({stage:'REAL_EXPIRY_WAIT',remainingSeconds:Math.ceil((deadline-Date.now())/1000)}));await new Promise(resolveWait=>setTimeout(resolveWait,Math.min(30000,deadline-Date.now())));}
  }
  const measured = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => ({
    title: document.title,
    readyState: document.readyState,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body?.scrollWidth ?? 0,
    brokenImages: [...document.images].filter(image => image.complete && image.naturalWidth === 0).length,
    competitionSections: document.querySelectorAll('.competition-section').length,
    fixtureRows: document.querySelectorAll('.fixture-row').length
    ,competitionNavigation: document.querySelectorAll('a.competition-tab').length
    ,cls: window.__qaCLS??null
    ,navigationMs: performance.getEntriesByType('navigation')[0]?.duration??null
    ,scriptBytes: performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').reduce((sum,r)=>sum+r.encodedBodySize,0)
    ,decodedScriptBytes: performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').reduce((sum,r)=>sum+r.decodedBodySize,0)
    ,oddsText: document.querySelector('#odds')?.textContent ?? null
    ,oddsTop: document.querySelector('#odds')?.getBoundingClientRect().top ?? null
    ,oddsScrollWidth: document.querySelector('#odds')?.scrollWidth ?? null
    ,activePriceCells: document.querySelectorAll('#odds .pregame-price:not(.is-unavailable)').length
    ,overflowElements: [...document.querySelectorAll('body *')].filter(element => {
      const rect = element.getBoundingClientRect(); return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
    }).slice(0,12).map(element => ({ tag: element.tagName, className: element.className, right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width), scrollWidth: element.scrollWidth }))
  }))()` });
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const target = resolve(output);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(screenshot.data, 'base64'));
  const metrics = measured.result.value;
  const report={ url, viewport: { width, height }, output: target,
    providerApiRequests,javascriptExceptions,failedAppResponses,localClockReplayMinutes:advanceMinutes,waitedForRealExpiry:waitForRealExpiry,
    horizontalOverflow: metrics.scrollWidth > metrics.clientWidth || metrics.bodyScrollWidth > metrics.clientWidth, ...metrics };
  if(output.includes('m5-'))await writeFile(target.replace(/\.png$/,'.metrics-private.json'),JSON.stringify(report,null,2));
  console.info(JSON.stringify(report));
} finally {
  await send('Browser.close').catch(() => undefined);
  socket.close();
  await new Promise(resolveExit => chrome.once('exit', resolveExit));
  if (dirname(profile)!==profileRoot || !basename(profile).startsWith('livasports-qa-')) throw new Error('Unsafe QA cleanup path');
  await rm(profile, { recursive: true, force: true });
}
