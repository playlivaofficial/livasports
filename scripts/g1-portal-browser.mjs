// Separate visible browser requested by the owner for manual portal login.
// Never opens, copies or inspects the owner's existing Chrome profile.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const profile=await mkdtemp(join(tmpdir(),'livasports-g1-portal-'));
const log=await open(resolve('output/g1-portal-browser.log'),'a');
const child=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
  `--user-data-dir=${profile}`,'--new-window','https://affiliates.betssongroupaffiliates.com/'
],{detached:true,stdio:['ignore','ignore',log.fd]});
await writeFile('output/g1-portal-session-private.json',JSON.stringify({profile,pid:child.pid,createdAt:new Date().toISOString()}),{mode:0o600});
child.unref();await log.close();
console.log('Separate visible G1 portal browser launched for manual authentication.');
