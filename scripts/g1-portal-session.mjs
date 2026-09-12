// CDP fallback for the G1-only profile after the bundled browser tool failed.
// No cookie/session export and no authentication-field reads or writes.
import {readFile} from 'node:fs/promises';
import {join,basename,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
export async function portalPage(host='affiliates.betssongroupaffiliates.com',index=0){
  if(!['affiliates.betssongroupaffiliates.com','mediastore.affiliates.betssongroupaffiliates.com'].includes(host))throw Error('PORTAL_HOST_NOT_APPROVED');
  const session=JSON.parse(await readFile('output/g1-portal-session-private.json','utf8'));
  if(dirname(resolve(session.profile))!==resolve(tmpdir())||!basename(session.profile).startsWith('livasports-g1-portal-'))throw Error('NOT_G1_PROFILE');
  const [port]=String(await readFile(join(session.profile,'DevToolsActivePort'),'utf8')).split('\n');
  if(!/^\d+$/.test(port))throw Error('INVALID_LOCAL_PORT');
  const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
  const target=targets.filter(t=>t.type==='page'&&new URL(t.url).hostname===host)[index];
  if(!target)throw Error('PORTAL_TAB_NOT_FOUND');
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((yes,no)=>{ws.addEventListener('open',yes,{once:true});ws.addEventListener('error',no,{once:true});});
  let id=0;const pending=new Map();
  ws.addEventListener('message',e=>{const r=JSON.parse(String(e.data));if(!r.id)return;const p=pending.get(r.id);pending.delete(r.id);if(r.error)p?.reject(Error(r.error.message));else p?.resolve(r.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
  return {send,close:()=>ws.close(),evaluate:async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('PORTAL_EVALUATION_FAILED');return r.result.value;}};
}
