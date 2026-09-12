// Isolated headless browser for testing this repository's own app, never a user's browsing profile.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename,sep} from 'node:path';
export const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function browserQA(){
  const root=resolve(tmpdir());const profile=await mkdtemp(join(root,'livasports-m6-qa-'));
  const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],
    {stdio:['ignore','ignore','pipe'],windowsHide:true});
  const exited=new Promise(r=>chrome.once('exit',r));
  const address=await new Promise((yes,no)=>{let output='';const timer=setTimeout(()=>no(new Error('BROWSER_START_TIMEOUT')),15000);
    chrome.stderr.on('data',chunk=>{output+=chunk.toString();const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);yes(match[1]);}});
  });
  async function connection(address){
    const ws=new WebSocket(address);await new Promise((yes,no)=>{ws.addEventListener('open',yes,{once:true});ws.addEventListener('error',no,{once:true});});
    let id=0;const waiting=new Map(),listeners=new Map();
    ws.addEventListener('message',event=>{const v=JSON.parse(String(event.data));if(v.id){const pending=waiting.get(v.id);waiting.delete(v.id);if(v.error)pending?.reject(new Error(v.error.message));else pending?.resolve(v.result);}
      else for(const callback of listeners.get(v.method)??[])callback(v.params);
    });
    return {close:()=>ws.close(),on:(event,callback)=>{listeners.set(event,[...(listeners.get(event)??[]),callback]);},
      send:(method,params={})=>new Promise((resolve,reject)=>{const current=++id;waiting.set(current,{resolve,reject});ws.send(JSON.stringify({id:current,method,params}));})};
  }
  const control=await connection(address);const pages=[];const host=new URL(address).host;
  async function newPage(width=390,height=844){
    const {targetId}=await control.send('Target.createTarget',{url:'about:blank'});
    const targets=await fetch(`http://${host}/json/list`).then(r=>r.json());const target=targets.find(t=>t.id===targetId);
    const c=await connection(target.webSocketDebuggerUrl);const metrics={providers:0,slipReads:0,errors:[],failed:[]};
    c.on('Runtime.exceptionThrown',v=>metrics.errors.push(v.exceptionDetails?.exception?.description??v.exceptionDetails?.text));
    c.on('Network.requestWillBeSent',v=>{if(/^https:\/\/api\.(sportmonks\.com|oddspapi\.io)\//.test(v.request.url))metrics.providers++;if(v.request.url.includes('/api/slip/resolve'))metrics.slipReads++;});
    c.on('Network.responseReceived',v=>{if(v.response.status>=500)metrics.failed.push({url:v.response.url.split('?')[0],status:v.response.status});});
    await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Network.enable');
    const evaluate=async expression=>{const r=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
    const wait=async(expression,timeout=15000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(150);}throw new Error(`UI_WAIT_FAILED: ${expression.slice(0,140)}`);};
    const viewport=async(w,h=844)=>{width=w;height=h;await c.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<=430});};
    await viewport(width,height);
    await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qaCLS=0;new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__qaCLS+=e.value}).observe({type:'layout-shift',buffered:true});`});
    const page={c,metrics,evaluate,wait,viewport,targetId,
      navigate:async url=>{await evaluate('window.__qaOldDocument=true');await c.send('Page.navigate',{url});await wait('!window.__qaOldDocument && document.readyState==="complete" && !!document.querySelector(".slip-trigger:not(:disabled)")',30000);await delay(350);},
      reload:async()=>{await evaluate('window.__qaOldDocument=true');await c.send('Page.reload');await wait('!window.__qaOldDocument && document.readyState==="complete" && !!document.querySelector(".slip-trigger:not(:disabled)")',30000);},
      click:async selector=>{
        const p=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('MISSING_ELEMENT');el.scrollIntoView({block:el.closest('.slip-panel')?'nearest':'center',behavior:'instant'});const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const at=document.elementFromPoint(x,y);if(at!==el&&!el.contains(at))throw Error('OCCLUDED_ELEMENT: '+${JSON.stringify(selector)}+' by '+at?.className+' at '+x+','+y);return {x,y};})()`);
        await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await delay(100);
      },
      key:async key=>{const virtual={Enter:13,Escape:27,Tab:9,' ':32}[key];const code=key===' '?'Space':key;const text=key==='Enter'?'\r':key===' '?' ':'';
        await c.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,text,unmodifiedText:text,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual});await delay(100);},
      activate:()=>control.send('Target.activateTarget',{targetId}),
      screenshot:async file=>{
        const target=resolve(file);if(!target.startsWith(resolve('output')+sep))throw new Error('SCREENSHOT_TARGET_OUT_OF_SCOPE');
        await mkdir(dirname(target),{recursive:true});const r=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(target,Buffer.from(r.data,'base64'));
        const layout=await evaluate(`(()=>{const p=document.querySelector('.slip-panel')?.getBoundingClientRect();return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth||document.body.scrollWidth>innerWidth,slipItems:document.querySelectorAll('.slip-item').length,prices:document.querySelectorAll('.slip-price').length,panel:p?{x:p.x,y:p.y,width:p.width,height:p.height}:null,cls:window.__qaCLS,scriptBytes:performance.getEntriesByType('resource').filter(x=>x.initiatorType==='script').reduce((n,x)=>n+x.decodedBodySize,0),brokenImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth).length};})()`);
        console.info(JSON.stringify({file,layout,...metrics}));return layout;
      },
    };pages.push(page);return page;
  }
  return {newPage,close:async()=>{await control.send('Browser.close').catch(()=>{});for(const p of pages)p.c.close();control.close();await exited;
    if(dirname(profile)!==root||!basename(profile).startsWith('livasports-m6-qa-'))throw new Error('UNSAFE_QA_CLEANUP');await rm(profile,{recursive:true,force:true});}};
}
