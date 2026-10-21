import {load} from 'cheerio';
import robotsParser from 'robots-parser';
import {canonicalSourceUrl} from './sources';
import {discoveryDesks,isDiscoveryArticleUrl,type DiscoveryCandidate} from './discovery';
import {collectWikinews} from './wikinews-discovery';
const agent='LivaSports-EditorialDiscovery';
async function boundedText(url:string,fetcher:typeof fetch,max:number){
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{'User-Agent':`${agent}/1.0 (+https://livasports.com)`,Accept:'text/html,text/plain;q=0.9'},cache:'no-store'});
  if(!response.ok)throw new Error(`HTTP_${response.status}`);
  if(!response.body||Number(response.headers.get('content-length')??0)>max)throw new Error('SIZE_LIMIT');
  const reader=response.body.getReader();let size=0;const parts:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('SIZE_LIMIT');}parts.push(value);}}finally{reader.releaseLock();}
  return Buffer.concat(parts).toString('utf8');
}
export function discoveryLinks(html:string,id:string,now=new Date()):DiscoveryCandidate[]{
  const desk=discoveryDesks.find(d=>d.id===id);if(!desk)throw new Error('DESK_NOT_ALLOWED');
  const $=load(html),seen=new Set<string>(),result:DiscoveryCandidate[]=[];
  // Only visible document links. No scripts, private APIs, pagination or article downloads.
  $('script,style,nav,header,footer').remove();
  $('a[href]').each((_,el)=>{
    const a=$(el);let url:string|null;try{url=canonicalSourceUrl(new URL(a.attr('href')!,desk.url).href);}catch{return;}
    const headline=(a.find('h2,h3,h4').first().text()||a.text()).replace(/\s+/g,' ').trim().replace(/\s+(?:Read More|Leer más|Ver más)$/i,'');
    if(!url||!isDiscoveryArticleUrl(id,url)||seen.has(url)||headline.length<20||headline.length>160||/[{}<>]/.test(headline))return;
    if(id==='liga1'&&!a.closest('article').length)return;
    const context=a.closest('article,li'),rawDate=context.find('time[datetime]').first().attr('datetime')??'';
    const date=/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(rawDate)?rawDate.slice(0,10):null;
    if(date&&(Date.parse(date+'T00:00:00Z')>+now||+now-Date.parse(date+'T00:00:00Z')>7*86400000))return;
    seen.add(url);if(result.length<3)result.push({desk:id,url,headline,sourceDate:date});
  });return result;
}
/** Max two requests per fixed desk. Missing/disallowed robots, redirects or failures stop that desk. */
export async function collectDiscovery(id:string,fetcher:typeof fetch=fetch,now=new Date()){
  if(id.startsWith('wikinews-'))return collectWikinews(id,fetcher,now);
  const desk=discoveryDesks.find(d=>d.id===id);if(!desk)throw new Error('DESK_NOT_ALLOWED');
  const robotsUrl=new URL('/robots.txt',desk.url).href;let requests=0;
  try{
    requests++;const robots=await boundedText(robotsUrl,fetcher,256000);
    if(robotsParser(robotsUrl,robots).isAllowed(desk.url,agent)!==true)return {desk:id,requests,status:'ROBOTS_BLOCKED',candidates:[]};
    requests++;const html=await boundedText(desk.url,fetcher,2500000);
    return {desk:id,requests,status:'CANDIDATES_REQUIRE_REVIEW',candidates:discoveryLinks(html,id,now)};
  }catch(error){return {desk:id,requests,status:error instanceof Error&&/^(HTTP_\d{3}|SIZE_LIMIT)$/.test(error.message)?error.message:'SOURCE_UNAVAILABLE_NO_RETRY',candidates:[]};}
}
