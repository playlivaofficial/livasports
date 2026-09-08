import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';

const [url, widthText, heightText, output] = process.argv.slice(2);
const width = Number(widthText);
const height = Number(heightText);
if (!url || !Number.isInteger(width) || !Number.isInteger(height) || !output) {
  throw new Error('Usage: node scripts/capture-qa.mjs <url> <width> <height> <output>');
}

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = resolve('.next', `qa-chrome-${process.pid}-${randomUUID()}`);
await mkdir(profile, { recursive: true });
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
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data));
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
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 430 });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  await new Promise(resolveWait => setTimeout(resolveWait, 3_000));
  await send('Runtime.evaluate', { expression: `if (location.hash) document.querySelector(location.hash)?.scrollIntoView({block:'start'})` });
  await new Promise(resolveWait => setTimeout(resolveWait, 250));
  const measured = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => ({
    title: document.title,
    readyState: document.readyState,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body?.scrollWidth ?? 0,
    brokenImages: [...document.images].filter(image => image.complete && image.naturalWidth === 0).length,
    competitionSections: document.querySelectorAll('.competition-section').length,
    fixtureRows: document.querySelectorAll('.fixture-row').length
    ,overflowElements: [...document.querySelectorAll('body *')].filter(element => {
      const rect = element.getBoundingClientRect(); return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
    }).slice(0,12).map(element => ({ tag: element.tagName, className: element.className, right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width), scrollWidth: element.scrollWidth }))
  }))()` });
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const target = resolve(output);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(screenshot.data, 'base64'));
  const metrics = measured.result.value;
  console.info(JSON.stringify({ url, viewport: { width, height }, output: target,
    horizontalOverflow: metrics.scrollWidth > metrics.clientWidth || metrics.bodyScrollWidth > metrics.clientWidth, ...metrics }));
} finally {
  await send('Browser.close').catch(() => undefined);
  socket.close();
  await new Promise(resolveExit => chrome.once('exit', resolveExit));
  await rm(profile, { recursive: true, force: true });
}
