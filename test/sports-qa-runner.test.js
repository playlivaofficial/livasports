import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const preload=['--require','./scripts/tsx-windows-preload.cjs','--import','./scripts/sports-qa-preload.mjs','--import','tsx'];
for(const entry of ['sports-db-qa.ts','sports-profile-qa.ts'])test(`${entry} loads sports server modules only in the explicit QA runner`,()=>{
 const result=spawnSync(process.execPath,[...preload,'--input-type=module','--eval',`
  import assert from 'node:assert/strict';
  import {createRequire} from 'node:module';
  import {pathToFileURL} from 'node:url';
  await import('./src/sports/repository.ts');
  await import('./src/profiles/repository.ts');
  const original=createRequire(import.meta.url).resolve('server-only');
  await assert.rejects(import(pathToFileURL(original).href),/cannot be imported from a Client Component/);
 `,`scripts/${entry}`],{cwd,encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr);
});
test('the sports QA preload rejects production and unrelated entry points',()=>{
 const result=spawnSync(process.execPath,[...preload,'--input-type=module','--eval',"import 'server-only';",'src/ingestion/cli.ts'],{cwd,encoding:'utf8',timeout:30000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/SPORTS_QA_ENTRY_POINT_REQUIRED/);
});
