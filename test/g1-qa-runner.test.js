import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const cwd=fileURLToPath(new URL('../',import.meta.url));
const preload=['--require','./scripts/tsx-windows-preload.cjs','--import','./scripts/g1-qa-preload.mjs','--import','tsx'];
function run(args) {
  return spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:30_000});
}

test('normal Node imports still enforce the production server-only sentinel',()=>{
  const result=run(['--input-type=module','--eval',"import 'server-only';"]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/cannot be imported from a Client Component/);
});

for(const entry of ['g1-publisher-db-qa.ts','g1-commercial-qa.ts']) {
  test(`${entry} can load real server modules through the isolated tsx runner`,()=>{
    // Exercise the same preload/argv/tsx path without executing database QA.
    const result=run([...preload,'--input-type=module','--eval',`
      import assert from 'node:assert/strict';
      import {createRequire} from 'node:module';
      import {pathToFileURL} from 'node:url';
      import {createContext} from 'react';
      await import('./src/affiliate/repository.ts');
      await import('./src/affiliate/server.ts');
      assert.equal(typeof createContext,'function');
      const original=createRequire(import.meta.url).resolve('server-only');
      await assert.rejects(import(pathToFileURL(original).href),/cannot be imported from a Client Component/);
      await assert.rejects(import('g1-qa-missing-module'),{code:'ERR_MODULE_NOT_FOUND'});
    `,`scripts/${entry}`]);
    assert.equal(result.status,0,result.stderr);
  });
}

test('the QA preload refuses unrelated entry points',()=>{
  const result=run([...preload,'--input-type=module','--eval',"import 'server-only';",'src/ingestion/cli.ts']);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/G1_QA_ENTRY_POINT_REQUIRED/);
});
