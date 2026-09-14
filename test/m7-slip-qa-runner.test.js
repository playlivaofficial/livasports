import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const cwd=fileURLToPath(new URL('../',import.meta.url));
const preload=['--require','./scripts/tsx-windows-preload.cjs','--import','./scripts/m7-slip-qa-preload.mjs','--import','tsx'];

test('m7-slip-hardening-qa.ts can load comparison server modules through the isolated runner',()=>{
  const result=spawnSync(process.execPath,[...preload,'--input-type=module','--eval',`
    import assert from 'node:assert/strict';
    import {createRequire} from 'node:module';
    import {pathToFileURL} from 'node:url';
    await import('./src/odds/read-repository.ts');
    await import('./src/slip/comparison.ts');
    const original=createRequire(import.meta.url).resolve('server-only');
    await assert.rejects(import(pathToFileURL(original).href),/cannot be imported from a Client Component/);
  `,'scripts/m7-slip-hardening-qa.ts'],{cwd,encoding:'utf8',timeout:30_000});
  assert.equal(result.status,0,result.stderr);
});

test('the slip QA preload refuses unrelated entry points',()=>{
  const result=spawnSync(process.execPath,[...preload,'--input-type=module','--eval',"import 'server-only';",'src/ingestion/cli.ts'],{cwd,encoding:'utf8',timeout:30_000});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/M7_SLIP_QA_ENTRY_POINT_REQUIRED/);
});
