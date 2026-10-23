import {licensedDiscoveryDesks,licensedDiscoveryUrl} from './licensed-discovery';
import type {DiscoveryCandidate} from './discovery';
/** Category insertion/revision timestamps are NOT publication dates. Require a published date category. */
export function wikinewsCandidates(value:unknown,id:string,now=new Date()):DiscoveryCandidate[]{
 if(!licensedDiscoveryDesks.some(d=>d.id===id))throw Error('SOURCE_NOT_APPROVED');
 const pages=(value as {query?:{pages?:unknown[]}})?.query?.pages;if(!Array.isArray(pages)||pages.length>10)return [];
 const result:DiscoveryCandidate[]=[],seen=new Set<string>();
 for(const item of pages){
  const p=item as {ns?:number;title?:string;categories?:{title?:string}[]};
  if(p.ns!==0||typeof p.title!=='string'||p.title.length<10||p.title.length>160||/[:<>\u0000-\u001f]/.test(p.title)||!Array.isArray(p.categories)||p.categories.length>50)continue;
  const cats=p.categories.map(c=>c.title);if(!cats.includes('Category:Published')||cats.some(c=>/disputed|retracted|developing|review|correction/i.test(c??'')))continue;
  const dates=cats.filter((c):c is string=>!!c&&/^Category:[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(c));if(dates.length!==1)continue;
  const date=new Date(dates[0].slice(9)+' 00:00:00 UTC');if(!Number.isFinite(+date)||+date>+now||+now-+date>7*86400000)continue;
  if(date.toLocaleDateString('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'})!==dates[0].slice(9))continue;
  const url='https://en.wikinews.org/wiki/'+encodeURIComponent(p.title.replaceAll(' ','_'));if(seen.has(url))continue;
  seen.add(url);result.push({desk:id,url,headline:p.title,sourceDate:date.toISOString().slice(0,10)});if(result.length===3)break;
 }return result;
}
/** One documented API request per desk, no pagination, article/photo retrieval or retry. */
export async function collectWikinews(id:string,fetcher:typeof fetch=fetch,now=new Date()){
 const url=licensedDiscoveryUrl(id);
 try{
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'LivaSports-EditorialDiscovery/1.0 (+https://livasports.com)',Accept:'application/json'},cache:'no-store'});
  if(!response.ok)return {desk:id,requests:1,status:`HTTP_${response.status}`,candidates:[]};
  if(!response.body||Number(response.headers.get('content-length')??0)>256000)throw Error('SIZE_LIMIT');
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>256000){await reader.cancel();throw Error('SIZE_LIMIT');}parts.push(value);}}finally{reader.releaseLock();}
  const data=JSON.parse(Buffer.concat(parts).toString('utf8'));if(data.error)return {desk:id,requests:1,status:'SOURCE_API_ERROR',candidates:[]};
  const candidates=wikinewsCandidates(data,id,now);return {desk:id,requests:1,status:candidates.length?'CANDIDATES_REQUIRE_REVIEW':'NO_CURRENT_VERIFIED_CANDIDATES',candidates};
 }catch{return {desk:id,requests:1,status:'SOURCE_UNAVAILABLE_NO_RETRY',candidates:[]};}
}
