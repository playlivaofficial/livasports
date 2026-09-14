import assert from 'node:assert/strict';
import {readdir,readFile,unlink,realpath,stat} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {readSportsCapture,writeSportsCapture} from '../src/sports/private-cache';

// Stop the old plain-file importer/readers before running. Verify every replacement before removing its plain copy.
const root=await realpath(resolve('output/sports-provider-private'));
const workspace=await realpath(process.cwd());
const within=relative(workspace,root);assert.ok(within&&!within.startsWith('..')&&!isAbsolute(within));
let files=0,before=0,after=0;
for(const entry of await readdir(root,{withFileTypes:true})){
  if(!entry.isFile()||!(/^[a-f0-9]{64}\.json$/).test(entry.name))continue;
  const file=join(root,entry.name);assert.equal(await realpath(file),file);
  const original=await readFile(file);
  await writeSportsCapture(file,original.toString('utf8'));
  assert.ok(Buffer.from(await readSportsCapture(file),'utf8').equals(original),'Capture compression must preserve exact bytes');
  before+=original.length;after+=(await stat(file+'.gz')).size;
  await unlink(file);files++;
}
console.log(JSON.stringify({status:'PASS',files,originalBytes:before,compressedBytes:after,lossless:true,providerRequests:0}));
