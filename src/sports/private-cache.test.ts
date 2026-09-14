import {expect,it} from 'vitest';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readSportsCapture,writeSportsCapture} from './private-cache';

it('reads preserved plain captures and losslessly replaces them with the latest compressed response',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'liva-sports-compression-')),file=join(directory,'snapshot.json');
  try{
    const old=JSON.stringify({data:[{name:'São Paulo',score:0}],checkedAt:'old'});
    await writeFile(file,old);expect(await readSportsCapture(file)).toBe(old);
    const fresh=JSON.stringify({data:Array.from({length:500},()=>({name:'São Paulo',score:0})),checkedAt:'new'});
    await writeSportsCapture(file,fresh);expect(await readSportsCapture(file)).toBe(fresh);
    expect((await readFile(file+'.gz')).length).toBeLessThan(Buffer.byteLength(fresh));
    await rm(file);expect(await readSportsCapture(file)).toBe(fresh);
  }finally{await rm(directory,{recursive:true,force:true});}
});
