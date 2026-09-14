import assert from 'node:assert/strict';
import {readSportsCapture} from './private-cache';
import {createHash} from 'node:crypto';
import type {SportsEnvelope} from './provider-audit';
import type {ProviderRow} from './ingestion-store';

/** Offline source evidence only. Missing captures fail; this module never fetches a replacement. */
export async function capturedPage(path:string,query:Record<string,string>){
  const url=new URL(path,'https://api.sportmonks.com/v3/');for(const [k,v] of Object.entries(query))url.searchParams.set(k,v);
  const hash=createHash('sha256').update(url.pathname+url.search).digest('hex');
  return JSON.parse(await readSportsCapture(`output/sports-provider-private/${hash}.json`)) as SportsEnvelope<ProviderRow>;
}
export async function capturedAll(path:string,query:Record<string,string>){
  const rows:ProviderRow[]=[];
  for(let page=1;;page++){
    const result=await capturedPage(path,{...query,per_page:'50',page:String(page)});
    if(result.status!==200){assert.equal(rows.length,0,'Provider response ended with partial pagination');return result;}
    rows.push(...result.data);if(!result.hasMore)return {...result,data:rows};
  }
}
