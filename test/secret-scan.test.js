import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

for(const hasSecret of [false,true]){
  test('secret scan checks an unstaged deletion '+(hasSecret?'with a credential':'without credentials'),()=>{
    const tempRoot=resolve(tmpdir());
    const fixture=mkdtempSync(join(tempRoot,'livasports-secret-scan-'));
    try{
      mkdirSync(join(fixture,'scripts'));
      copyFileSync(fileURLToPath(new URL('../scripts/secret-scan.mjs',import.meta.url)),join(fixture,'scripts/secret-scan.mjs'));
      writeFileSync(join(fixture,'.gitignore'),'.env*\n');
      const credential='fixture-'+randomUUID();
      writeFileSync(join(fixture,'.env.local'),'DATABASE_URL='+credential+'\n');
      writeFileSync(join(fixture,'removed.txt'),hasSecret?credential:'No credentials here.');
      execFileSync('git',['init','--quiet'],{cwd:fixture});
      execFileSync('git',['add','removed.txt'],{cwd:fixture});
      rmSync(join(fixture,'removed.txt'));
      const scan=spawnSync(process.execPath,['scripts/secret-scan.mjs'],{cwd:fixture,encoding:'utf8'});
      assert.equal(scan.status,hasSecret?1:0,scan.stderr);
      const report=JSON.parse(scan.stdout);
      assert.equal(report.credentialValueLeaks,hasSecret?1:0);
      assert.deepEqual(report.leakFiles,hasSecret?['removed.txt']:[]);
      assert.equal(scan.stdout.includes(credential),false);
    }finally{
      if(dirname(fixture)!==tempRoot||!basename(fixture).startsWith('livasports-secret-scan-'))throw Error('UNSAFE_FIXTURE_CLEANUP');
      rmSync(fixture,{recursive:true,force:true});
    }
  });
}

