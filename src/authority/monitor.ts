import 'server-only';
import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {request} from 'node:https';
import {load} from 'cheerio';
import robotsParser from 'robots-parser';
import type {DatabaseClient} from '@/database/client';
import {METHODOLOGY,publicUrl,targetUrl,type EarnedLink} from './model';

const blocked=new BlockList();
for(const [net,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as const)blocked.addSubnet(net,bits,'ipv4');
export function isPublicAddress(address:string){const version=isIP(address);if(version===4)return !blocked.check(address,'ipv4');if(version===6)return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:(db8|0):/i.test(address);return false;}
export interface Page {status:number;body:string;contentType:string;}
export type Reader=(url:string)=>Promise<Page>;
/** DNS is validated AND pinned to the socket. No redirects, cookies, JS, proxies or TLS bypass. */
export const readPublic:Reader=async value=>{
 const u=new URL(publicUrl(value));let timer:ReturnType<typeof setTimeout>|undefined;
 const addresses=await Promise.race([lookup(u.hostname,{all:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('DNS_TIMEOUT')),3000);})]).finally(()=>clearTimeout(timer));
 if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw Error('UNSAFE_ADDRESS');const selected=addresses[0];
 return new Promise<Page>((resolve,reject)=>{
 const req=request(u,{method:'GET',agent:false,family:selected.family,headers:{'User-Agent':'LivaSportsLinkMonitor/1.0 (+https://livasports.com/br/como-funciona-a-comparacao-de-odds)','Accept':'text/html,text/plain;q=0.9','Accept-Encoding':'identity'},lookup:(_host,_options,callback)=>callback(null,selected.address,selected.family)},res=>{
 let bytes=0;const chunks:Buffer[]=[];
 if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();reject(Error('ENCODING_UNSUPPORTED'));return;}
 res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1024*1024){res.destroy();reject(Error('BODY_LIMIT'));}else chunks.push(chunk);});
 res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode??0,body:Buffer.concat(chunks).toString('utf8'),contentType:String(res.headers['content-type']??'')}));
 });const deadline=setTimeout(()=>req.destroy(Error('REQUEST_TIMEOUT')),6000);req.on('close',()=>clearTimeout(deadline));req.on('error',reject);req.end();
 });
};
export interface Check {state:EarnedLink['state'];httpStatus:number|null;anchor:string|null;rel:string|null;reason:string;requests:number;targetHttpStatus:number|null;}
export async function checkLink(link:Pick<EarnedLink,'sourceUrl'|'targetUrl'|'firstSeenAt'>,read:Reader=readPublic):Promise<Check>{
 const result:Check={state:'UNKNOWN',httpStatus:null,anchor:null,rel:null,reason:'NOT_CHECKED',requests:0,targetHttpStatus:null};
 try{
 const source=publicUrl(link.sourceUrl),target=targetUrl(link.targetUrl),robotUrl=new URL('/robots.txt',source).toString();
 result.requests++;const robots=await read(robotUrl);
 if(robots.status!==404&&robots.status!==410){if(robots.status!==200){result.reason='ROBOTS_UNAVAILABLE';return result;}const rules=robotsParser(robotUrl,robots.body);if(rules.isAllowed(source,'LivaSportsLinkMonitor')===false||(rules.getCrawlDelay('LivaSportsLinkMonitor')??0)>0){result.reason='ROBOTS_RESTRICTED';return result;}}
 result.requests++;const page=await read(source);result.httpStatus=page.status;
 if(page.status>=300&&page.status<400){result.state='REDIRECTED';result.reason='SOURCE_REDIRECT';return result;}
 if(page.status===404||page.status===410){result.state=link.firstSeenAt?'REMOVED':'UNKNOWN';result.reason='SOURCE_NOT_FOUND';return result;}
 if(page.status!==200||!page.contentType.toLowerCase().includes('text/html')){result.reason='SOURCE_UNAVAILABLE';return result;}
 const $=load(page.body);if(/just a moment|attention required|access denied|verify you are human|captcha/i.test($('title').text())||$('[id^="cf-chl"],#challenge-form').length){result.reason='SOURCE_CHALLENGE';return result;}
 let found=false;
 $('a[href]').each((_,a)=>{let href:string;try{href=targetUrl(new URL($(a).attr('href')!,source).toString());}catch{return;}if(href!==target)return;found=true;result.anchor=$(a).text().replace(/\s+/g,' ').trim().slice(0,300);result.rel=($(a).attr('rel')??'').toLowerCase().slice(0,200)||'follow';return false;});
 const bodyText=$('body').clone().find('script,style,noscript').remove().end().text().trim();
 if(!found&&bodyText.length<80){result.reason='SOURCE_INCOMPLETE';return result;}
 result.state=found?'LIVE':link.firstSeenAt?'REMOVED':'UNKNOWN';result.reason=found?'ANCHOR_OBSERVED':'ANCHOR_NOT_OBSERVED';
 if(found){result.requests++;try{const destination=await read(target);result.targetHttpStatus=destination.status;if(destination.status!==200)result.reason='ANCHOR_OBSERVED_TARGET_UNHEALTHY';}catch{result.reason='ANCHOR_OBSERVED_TARGET_UNKNOWN';}}
 }catch{result.state='UNKNOWN';result.reason='NETWORK_OR_SAFETY_BLOCK';}
 return result;
}
/** One claim per UTC day. Five source domains + own methodology = at most sixteen requests. */
export async function runAuthorityMonitor(db:DatabaseClient,read:Reader=readPublic,now=new Date()){
 const day=now.toISOString().slice(0,10),claim=await db.query(`INSERT INTO authority_monitor_runs(day,state) VALUES($1,'RUNNING') ON CONFLICT(day) DO NOTHING RETURNING day`,[day]);
 if(!claim.rowCount)return {state:'SKIPPED',day,requests:0,linksChecked:0};
 let requests=0,linksChecked=0;
 try{
 const links=await db.query<EarnedLink>(`SELECT * FROM (SELECT DISTINCT ON(p.domain) l.id,l.prospect_id AS "prospectId",l.source_url AS "sourceUrl",l.target_url AS "targetUrl",l.first_seen_at AS "firstSeenAt",l.last_checked_at FROM authority_links l JOIN authority_prospects p ON p.id=l.prospect_id WHERE NOT l.is_qa AND NOT p.is_qa AND (l.last_checked_at IS NULL OR l.last_checked_at<now()-interval '7 days') ORDER BY p.domain,l.last_checked_at NULLS FIRST,l.recorded_at) due ORDER BY last_checked_at NULLS FIRST,id LIMIT 5`);
 for(const link of links.rows){const check=await checkLink(link,read);requests+=check.requests;linksChecked++;
 await db.transaction(async tx=>{
 await tx.query(`INSERT INTO authority_link_checks(link_id,state,http_status,anchor,rel,reason,request_count,target_http_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[link.id,check.state,check.httpStatus,check.anchor,check.rel,check.reason,check.requests,check.targetHttpStatus]);
 await tx.query(`UPDATE authority_links SET state=$2,http_status=$3,anchor=$4,rel=$5,last_checked_at=now(),first_seen_at=CASE WHEN $2='LIVE' THEN coalesce(first_seen_at,now()) ELSE first_seen_at END WHERE id=$1`,[link.id,check.state,check.httpStatus,check.anchor,check.rel]);
 });}
 requests++;let assetStatus:number|null=null;try{assetStatus=(await read(METHODOLOGY)).status;}catch{ /* Unknown, never fabricate a broken page. */ }
 await db.query(`UPDATE authority_monitor_runs SET state='SUCCEEDED',completed_at=now(),requests=$2,links_checked=$3,asset_checks=$4 WHERE day=$1`,[day,requests,linksChecked,JSON.stringify([{url:METHODOLOGY,status:assetStatus}])]);return {state:'SUCCEEDED',day,requests,linksChecked,assetStatus};
 }catch{await db.query(`UPDATE authority_monitor_runs SET state='FAILED',completed_at=now(),requests=$2,links_checked=$3,error_code='MONITOR_FAILED' WHERE day=$1`,[day,requests,linksChecked]);return {state:'FAILED',day,requests,linksChecked};}
}
