import 'server-only';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import type {SceneryFamily} from './scenery';

/** Bundled synthetic scenery. A missing file retains the deterministic vector football fallback. */
export async function loadSceneryArt(family:SceneryFamily):Promise<string|null>{
  try{
    const file=family==='TUNNEL_BIGMATCH'?'tunnel.png':'stadium-night.png';
    const source=await readFile(join(process.cwd(),'public/growth/scenery/v1',file));
    const buffer=await sharp(source).resize(810,1440,{fit:'cover'}).jpeg({quality:84}).toBuffer();
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  }catch{return null;}
}
