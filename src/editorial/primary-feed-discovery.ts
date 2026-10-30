import {primaryDateEligible,primaryFailure,type PrimaryReviewReason} from './primary-verification';
import {load} from 'cheerio';
import robotsParser from 'robots-parser';
import {primaryFeedDesks} from './primary-feeds';
import {canonicalSourceUrl} from './sources';
import {isDiscoveryArticleUrl,type DiscoveryCandidate} from './discovery';
import {extractAnnouncement} from './automation/announcements';
import {verifiedScheduleBytes} from './automation/schedule-attachments';

const agent='LivaSports-EditorialDiscovery';
const supportedNflHeadline=(headline:string)=>/^(?:'[^']{1,40}': )?[A-Z][a-z]+(?: [A-Z][a-z]+){1,3} Inducted Into Ring Of Honor(?:, No\. \d{1,2} Retired)?$/.test(headline)||/^[A-Z][a-z]+(?: [A-Z][a-z]+){1,3} Named NFC Special Teams Player Of The Week(?: After [A-Za-z ]+)?$/.test(headline);
function citationUrl(raw:string){
 try{
  const url=new URL(raw);
  // Strip publisher analytics only, never unknown or credential-bearing query parameters.
  if([...url.searchParams.keys()].some(key=>!['utm_source','utm_medium','utm_campaign'].includes(key)))return null;
  url.search='';return canonicalSourceUrl(url.href);
 }catch{return null;}
}
/** Parse only explicit item publication dates. Feed build dates do not make an old story fresh. */
export function primaryFeedCandidates(xml:string,id:string,now=new Date()):DiscoveryCandidate[]{
 if(!primaryFeedDesks.some(d=>d.id===id))throw Error('DESK_NOT_ALLOWED');
 if(Buffer.byteLength(xml)>512000||/<!DOCTYPE|<!ENTITY/i.test(xml))return [];
 const $=load(xml,{xmlMode:true}),seen=new Set<string>(),out:DiscoveryCandidate[]=[];
 if($('rss > channel').length!==1)return [];
 for(const el of $('rss > channel > item').toArray().slice(0,30)){
  const item=$(el),headline=item.children('title').text().replace(/\s+/g,' ').trim();
  const url=citationUrl(item.children('link').text().trim());
  const rawDate=item.children('pubDate').text().trim();
  // Require an RFC 822 date with timezone, not permissive JS parsing of arbitrary numbers.
  if(!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} (?:[+-]\d{4}|GMT)$/.test(rawDate))continue;
  const date=new Date(rawDate);
  const localDay=Number(rawDate.split(' ')[1]),month=rawDate.split(' ')[2],year=Number(rawDate.split(' ')[3]);
  const calendar=new Date(`${month} ${localDay}, ${year} 00:00:00 GMT`);
  if(!Number.isFinite(+calendar)||calendar.getUTCDate()!==localDay||calendar.getUTCFullYear()!==year)continue;
  if(!Number.isFinite(+date)||+date>+now||+now-+date>7*86400000)continue;
  if(!url||!isDiscoveryArticleUrl(id,url)||seen.has(url)||headline.length<10||headline.length>160||/[<>\u0000-\u001f{}]/.test(headline))continue;
  // NBA Communications also carries other leagues. Classification must be explicit.
  if(id==='nba-releases'&&(!/\bNBA\b/.test(headline)||/\b(?:WNBA|G League|2K|Basketball Africa League)\b/i.test(headline)))continue;
  // Photo-gallery fixture titles are not independently usable announcements.
  if(id==='dimayor-releases'&&(/galer[ií]a|fotograf/i.test(item.children('category').text())||headline===headline.toLocaleUpperCase()))continue;
  seen.add(url);out.push({desk:id,url,headline,sourceDate:date.toISOString().slice(0,10)});
  if(id!=='nfl-cardinals'&&out.length===3)break;
 }
 // Inspect only the same bounded 30-item feed, then prioritize a supported factual contract.
 // Headlines grant article inspection, never factual or publication approval.
 return (id==='nfl-cardinals'?out.sort((a,b)=>Number(supportedNflHeadline(b.headline))-Number(supportedNflHeadline(a.headline))):out).slice(0,3);
}
/** Retain normalized facts only. Feed article text exists only transiently in memory. */
export function primaryFeedAnnouncements(xml:string,id:string,now=new Date()){
 // NFL announcements require the matching primary article, never RSS prose alone.
 if(id==='nfl-cardinals')return [];
 const candidates=primaryFeedCandidates(xml,id,now);if(!candidates.length)return [];
 const $=load(xml,{xmlMode:true});
 return candidates.flatMap(candidate=>{
  const item=$('rss > channel > item').toArray().find(el=>citationUrl($(el).children('link').text().trim())===candidate.url);
  if(!item)return [];
  const raw=$(item).children('content\\:encoded').text()||$(item).children('description').text();
  const document=load(raw);document('td,th,p,br').append(' ');
  const body=document.root().text().replace(/\s+/g,' ').trim();
  const facts=extractAnnouncement(candidate,body,now);return facts?[facts]:[];
 });
}
async function text(url:string,fetcher:typeof fetch,max:number){
 const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{'User-Agent':`${agent}/1.0 (+https://livasports.com)`,Accept:'application/rss+xml,application/xml,text/plain;q=0.9'},cache:'no-store'});
 if(!r.ok)throw Error(`HTTP_${r.status}`);
 if(!r.body||Number(r.headers.get('content-length')??0)>max)throw Error('SIZE_LIMIT');
 const reader=r.body.getReader(),parts:Uint8Array[]=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>max){await reader.cancel();throw Error('SIZE_LIMIT');}parts.push(value);}}finally{reader.releaseLock();}
 return Buffer.concat(parts).toString('utf8');
}
async function pdfBytes(url:string,fetcher:typeof fetch){
 const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{'User-Agent':agent+'/1.0 (+https://livasports.com)',Accept:'application/pdf'},cache:'no-store'});
 if(!r.ok)throw Error('HTTP_'+r.status);
 if(!r.headers.get('content-type')?.toLowerCase().startsWith('application/pdf')||!r.body||Number(r.headers.get('content-length')??0)>1500000)throw Error('ATTACHMENT_INVALID');
 const reader=r.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();throw Error('SIZE_LIMIT');}parts.push(value);}}finally{reader.releaseLock();}
 return Buffer.concat(parts);
}
/** Robots + feed; DIMAYOR adds at most one article and one PDF (four reads total).
 * Known image-based attachments use facts transcribed from every rendered page, bound to exact bytes.
 * New/changed/unreadable/ambiguous documents stay quarantined; never assume they contain no facts.
 * No publisher prose or PDF artwork is retained by the runtime or supplied to the model. */
export async function collectPrimaryFeed(id:string,fetcher:typeof fetch=fetch,now=new Date()){
 const desk=primaryFeedDesks.find(d=>d.id===id);if(!desk)throw Error('DESK_NOT_ALLOWED');
 let requests=0;
 try{
  const robotsUrl=new URL('/robots.txt',desk.url).href;requests++;
  const robots=await text(robotsUrl,fetcher,256000);
  if(robotsParser(robotsUrl,robots).isAllowed(desk.url,agent)!==true)return {desk:id,requests,status:'ROBOTS_BLOCKED',candidates:[]};
  requests++;const xml=await text(desk.url,fetcher,512000);
  const candidates=primaryFeedCandidates(xml,id,now);
  const announcements=primaryFeedAnnouncements(xml,id,now);
  const reviewReasons:Record<string,PrimaryReviewReason>={};
  if(id==='dimayor-releases'){
   const schedules=candidates.filter(c=>/programaci[oó]n|horarios?|aplazad|reprogram/i.test(c.headline));
   for(const c of schedules)reviewReasons[c.url]='SCHEDULE_ATTACHMENT_REVIEW_REQUIRED';
   const candidate=schedules[0];
   if(candidate){
    try{
     const articleUrl=candidate.url.replace(/\/$/,'')+'/'; // WordPress canonical path; no redirect following.
     if(robotsParser(robotsUrl,robots).isAllowed(articleUrl,agent)!==true)throw Error('ROBOTS_BLOCKED');
     requests++;const article=load(await text(articleUrl,fetcher,1500000));
     const canonical=article('link[rel=canonical]').attr('href');
     const headline=article('h1').toArray().some(el=>article(el).text().replace(/\s+/g,' ').trim()===candidate.headline)||(canonical===articleUrl&&article('meta[property="og:title"]').attr('content')===candidate.headline+' - Dimayor');
     const main=article('main');
     const links=[...new Set(main.find('a[href],object[data],embed[src],iframe[src]').toArray().map(el=>{try{return new URL((article(el).attr('href')??article(el).attr('data')??article(el).attr('src'))!,articleUrl).href;}catch{return '';}}).filter(u=>/\.pdf(?:$|[?#])/i.test(u)))];
     if(!headline||main.length!==1||links.length!==1)throw Error('ATTACHMENT_AMBIGUOUS');
     const url=new URL(links[0]);
     if(url.protocol!=='https:'||url.hostname!=='dimayor.com.co'||url.username||url.password||url.port||url.search||url.hash||!/^\/wp-content\/uploads\/20\d{2}\/\d{2}\/[^/]+\.pdf$/i.test(url.pathname)||robotsParser(robotsUrl,robots).isAllowed(url.href,agent)!==true)throw Error('ATTACHMENT_NOT_ALLOWED');
     requests++;const attachment=verifiedScheduleBytes(candidate.url,candidate.sourceDate!,url.href,await pdfBytes(url.href,fetcher));
     const body=main.text();
     const facts=attachment?extractAnnouncement(candidate,body.replace(/\s+/g,' ').trim(),now,attachment):null;
     if(facts){announcements.push(facts);delete reviewReasons[candidate.url];}
    }catch{/* The candidate remains private; no retry, no downgrade to a notice-only assertion. */}
   }
  }
  if(id==='nba-releases'){
   const candidate=candidates.find(c=>c.headline==='NBA Tip-Off on NBC and Peacock delivers most-watched opening night ever');
   if(candidate){reviewReasons[candidate.url]='PRIMARY_ARTICLE_REVIEW_REQUIRED';try{
    if(!primaryDateEligible(candidate.sourceDate,now))throw Error('SOURCE_PUBLICATION_EXPIRED');
    const url=candidate.url+'/';if(robotsParser(robotsUrl,robots).isAllowed(url,agent)!==true)throw Error('PRIMARY_ROBOTS_BLOCKED');
    requests++;const page=load(await text(url,fetcher,512000)),article=page('article');
    const headline=article.find('h1,h2').toArray().some(e=>page(e).text().replace(/\s+/g,' ').trim()===candidate.headline);
    const stamp=page('meta[property="article:published_time"]').attr('content'),date=stamp?new Date(stamp):null;
    if(!headline||article.length!==1)throw Error('PRIMARY_HEADLINE_MISMATCH');
    if(!date||!Number.isFinite(+date)||+date>+now||date.toISOString().slice(0,10)!==candidate.sourceDate)throw Error('PRIMARY_DATE_MISMATCH');
    const facts=extractAnnouncement(candidate,article.text().replace(/\s+/g,' ').trim(),now,undefined,true);
    if(facts){announcements.push(facts);delete reviewReasons[candidate.url];}
   else reviewReasons[candidate.url]='PRIMARY_FACTS_UNVERIFIED';
   }catch(error){reviewReasons[candidate.url]=primaryFailure(error);}} 
  }
  if(id==='nfl-cardinals'){
   const candidate=candidates.find(c=>supportedNflHeadline(c.headline));
   if(candidate){
    const articleUrl=new URL(new URL(candidate.url).pathname,desk.url).href;
    if(robotsParser(robotsUrl,robots).isAllowed(articleUrl,agent)!==true)return {desk:id,requests,status:'ROBOTS_BLOCKED',candidates:[]};
    requests++;
    const article=load(await text(articleUrl,fetcher,2500000));
    const matchingHeadline=article('h1').toArray().some(el=>article(el).text().replace(/\s+/g,' ').trim()===candidate.headline);
    const body=article('article .nfl-c-body-part--text p').toArray().map(el=>article(el).text()).join(' ').replace(/\s+/g,' ').trim();
    const dates=article('script[type="application/ld+json"]').toArray().flatMap(el=>{try{const data=JSON.parse(article(el).text());return data['@type']==='NewsArticle'?[data.datePublished]:[];}catch{return [];}});
    const published=dates.length===1&&typeof dates[0]==='string'?new Date(dates[0]):null;
    const matchingDate=published&&Number.isFinite(+published)&&+published<=+now&&published.toISOString().slice(0,10)===candidate.sourceDate;
    const facts=matchingHeadline&&matchingDate?extractAnnouncement(candidate,body,now):null;
    if(!facts)reviewReasons[candidate.url]='PRIMARY_ARTICLE_REVIEW_REQUIRED';
    if(facts&&!announcements.some(f=>f.eventKey===facts.eventKey))announcements.push(facts);
   }
  }
  return {desk:id,requests,status:Object.values(reviewReasons).includes('SCHEDULE_ATTACHMENT_REVIEW_REQUIRED')?'SCHEDULE_ATTACHMENTS_QUARANTINED':Object.keys(reviewReasons).length?'PRIMARY_ARTICLE_QUARANTINED':candidates.length?'CANDIDATES_REQUIRE_REVIEW':'NO_CURRENT_VERIFIED_CANDIDATES',candidates,announcements,reviewReasons};
 }catch(error){return {desk:id,requests,status:error instanceof Error&&/^(HTTP_\d{3}|SIZE_LIMIT)$/.test(error.message)?error.message:'SOURCE_UNAVAILABLE_NO_RETRY',candidates:[]};}
}
