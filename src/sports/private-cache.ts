import {readFile,writeFile} from 'node:fs/promises';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {replaceSportsFile} from './checkpoint';
const compress=promisify(gzip),decompress=promisify(gunzip);

export async function readSportsCapture(file:string):Promise<string>{
  try{return (await decompress(await readFile(file+'.gz'))).toString('utf8');}
  catch(error){if(!error||typeof error!=='object'||!('code' in error)||error.code!=='ENOENT')throw error;}
  return readFile(file,'utf8');
}
export async function writeSportsCapture(file:string,body:string){
  const target=file+'.gz',pending=target+'.pending';
  await writeFile(pending,await compress(body));
  await replaceSportsFile(pending,target);
}
