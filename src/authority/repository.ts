import 'server-only';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {BUCKET_SQL} from '@/analytics/growth-report';
import {ANGLES,CATEGORIES,STATUSES,canTransition,classify,domainOf,publicUrl,targetUrl,validFollowUp,type AuthorityReport,type Prospect,type Research,type Status} from './model';

const projection=`id,domain,name,category,status,priority,research,contact_url AS "contactUrl",email,target_url AS "targetUrl",angle,notes,last_contact_at AS "lastContactAt",follow_up_on::text AS "followUpOn",is_qa AS "isQa"`;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function text(value:unknown,max=2000){if(typeof value!=='string'||value.length>max)throw Error('INVALID_INPUT');return value.trim();}
function id(value:unknown){if(typeof value!=='string'||!uuid.test(value))throw Error('INVALID_INPUT');return value;}
export function validateProspect(input:Record<string,unknown>){
 const name=text(input.name,160);if(!name)throw Error('INVALID_INPUT');
 const domain=domainOf(publicUrl(input.url));const category=String(input.category) as Prospect['category'];if(!CATEGORIES.includes(category))throw Error('INVALID_INPUT');
 const angle=String(input.angle) as typeof ANGLES[number];if(!ANGLES.includes(angle))throw Error('INVALID_INPUT');
 const contactUrl=input.contactUrl?publicUrl(input.contactUrl):null,email=input.email?text(input.email,254):null;
 if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw Error('INVALID_INPUT');
 const raw=input.research as Record<string,unknown>;if(!raw||Array.isArray(raw))throw Error('INVALID_INPUT');
 const research:Research={country:text(raw.country,80),language:text(raw.language,30),brazil:raw.brazil===true,football:raw.football===true,odds:raw.odds===true,editorial:raw.editorial===true,active:raw.active===true,
 articleUrl:raw.articleUrl?publicUrl(raw.articleUrl):'',articleTitle:text(raw.articleTitle,250),articleDate:validFollowUp(raw.articleDate),sectionUrl:publicUrl(raw.sectionUrl),contactAlternative:text(raw.contactAlternative,300),
 evidenceUrl:publicUrl(raw.evidenceUrl),checkedAt:new Date().toISOString(),audienceSignal:text(raw.audienceSignal,500),fit:text(raw.fit,1000),linkability:text(raw.linkability,500),
 spamFlags:Array.isArray(raw.spamFlags)?raw.spamFlags.map(v=>text(v,150)).slice(0,10):[],mentionStatus:['MENTION','LINK'].includes(String(raw.mentionStatus))?raw.mentionStatus as 'MENTION'|'LINK':'UNKNOWN',competitorEvidence:text(raw.competitorEvidence,1000)};
 if(research.active&&(!research.articleUrl||!research.articleTitle))throw Error('ACTIVITY_EVIDENCE_REQUIRED');
 if(domainOf(research.sectionUrl)!==domain||domainOf(research.evidenceUrl)!==domain)throw Error('INVALID_EVIDENCE_DOMAIN');
 const priority=classify(research,!!(contactUrl||email||research.contactAlternative)).priority;
 return {name,domain,category,angle,contactUrl,email,research,priority,targetUrl:targetUrl(input.targetUrl),notes:text(input.notes??''),followUpOn:validFollowUp(input.followUpOn),isQa:input.isQa===true};
}
export const REFERRAL_SQL=`WITH events AS (
 SELECT session_id,count(*) FILTER(WHERE event_name='match_viewed') AS match_views,
 count(*) FILTER(WHERE event_name='odds_selected') AS odds,count(*) FILTER(WHERE event_name='slip_leg_added') AS slip_adds,
 count(*) FILTER(WHERE event_name='outbound_redirect_completed') AS clicks
 FROM analytics_events WHERE traffic_class='HUMAN' AND occurred_at>=now()-interval '28 days' GROUP BY session_id)
 SELECT s.referrer_host AS domain,s.landing_path AS "landingPath",count(*)::int AS sessions,count(*) FILTER(WHERE s.engaged)::int AS engaged,
 coalesce(sum(e.match_views),0)::int AS "matchViews",coalesce(sum(e.odds),0)::int AS odds,coalesce(sum(e.slip_adds),0)::int AS "slipAdds",coalesce(sum(e.clicks),0)::int AS clicks
 FROM analytics_sessions s LEFT JOIN events e ON e.session_id=s.session_id
 WHERE s.traffic_class='HUMAN' AND s.started_at>=now()-interval '28 days' AND (${BUCKET_SQL})='referral'
 GROUP BY s.referrer_host,s.landing_path ORDER BY sessions DESC LIMIT 1000`;
export async function readAuthority(db:QueryExecutor):Promise<AuthorityReport>{
 const [prospects,links,events,referrals,runs]=await Promise.all([
 db.query<Prospect>(`SELECT ${projection} FROM authority_prospects ORDER BY is_qa,CASE priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,name LIMIT 1000`),
 db.query<AuthorityReport['links'][number]>(`SELECT l.id,l.prospect_id AS "prospectId",p.domain,l.source_url AS "sourceUrl",l.target_url AS "targetUrl",l.state,l.anchor,l.rel,l.http_status AS "httpStatus",l.first_seen_at AS "firstSeenAt",l.last_checked_at AS "lastCheckedAt",(l.is_qa OR p.is_qa) AS "isQa" FROM authority_links l JOIN authority_prospects p ON p.id=l.prospect_id ORDER BY l.recorded_at DESC LIMIT 1000`),
 db.query<AuthorityReport['events'][number]>(`SELECT id,prospect_id AS "prospectId",kind,from_status AS "fromStatus",to_status AS "toStatus",note,occurred_at AS "occurredAt" FROM authority_outreach_events ORDER BY occurred_at DESC LIMIT 2000`),
 db.query<AuthorityReport['referrals'][number]>(REFERRAL_SQL),
 db.query<AuthorityReport['runs'][number]>(`SELECT day::text,state,requests,links_checked AS "linksChecked",asset_checks AS "assetChecks" FROM authority_monitor_runs ORDER BY day DESC LIMIT 14`)]);
 const grouped=new Map<string,AuthorityReport['referrals'][number]>();
 for(const row of referrals.rows){let domain:string;try{domain=domainOf(`https://${row.domain}`);}catch{continue;}const key=domain+'|'+row.landingPath,old=grouped.get(key);if(old){for(const k of ['sessions','engaged','matchViews','odds','slipAdds','clicks'] as const)old[k]+=row[k];}else grouped.set(key,{...row,domain});}
 return {prospects:prospects.rows,links:links.rows,events:events.rows,referrals:[...grouped.values()],runs:runs.rows,generatedAt:new Date().toISOString()};
}
export async function authorityMutation(db:DatabaseClient,body:Record<string,unknown>,actor:string){
 return db.transaction(async tx=>{
 const action=body.action;
 if(action==='create'){
 const p=validateProspect(body);const inserted=await tx.query<{id:string}>(`INSERT INTO authority_prospects(domain,name,category,priority,research,contact_url,email,target_url,angle,notes,follow_up_on,is_qa) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(domain) DO NOTHING RETURNING id`,[p.domain,p.name,p.category,p.priority,JSON.stringify(p.research),p.contactUrl,p.email,p.targetUrl,p.angle,p.notes,p.followUpOn,p.isQa]);
 if(!inserted.rows[0])throw Error('DUPLICATE_DOMAIN');await event(tx,inserted.rows[0].id,'CREATED',null,'NEW','',actor);return {id:inserted.rows[0].id};
 }
 const prospectId=id(body.id),p=(await tx.query<Prospect>(`SELECT ${projection} FROM authority_prospects WHERE id=$1 FOR UPDATE`,[prospectId])).rows[0];if(!p)throw Error('NOT_FOUND');
 if(action==='status'){
 const status=String(body.status) as Status;if(!STATUSES.includes(status)||!canTransition(p.status,status))throw Error('INVALID_TRANSITION');
 if(p.priority==='REJECT'&&status!=='REJECTED'&&status!=='RESEARCHED')throw Error('REJECTED_QUALITY');
 if(status==='CONTACTED'&&body.confirmSent!==true)throw Error('MANUAL_CONFIRMATION_REQUIRED');
 if(status==='LINK_LIVE'&&!(await tx.query(`SELECT id FROM authority_links WHERE prospect_id=$1 AND state='LIVE' LIMIT 1`,[p.id])).rowCount)throw Error('VERIFIED_LINK_REQUIRED');
 await tx.query(`UPDATE authority_prospects SET status=$2,last_contact_at=CASE WHEN $2='CONTACTED' THEN now() ELSE last_contact_at END,updated_at=now() WHERE id=$1`,[p.id,status]);await event(tx,p.id,'STATUS',p.status,status,text(body.note??''),actor);
 }else if(action==='edit'){
 const next=validateProspect({...body,url:`https://${p.domain}`,isQa:p.isQa});
 await tx.query(`UPDATE authority_prospects SET name=$2,category=$3,priority=$4,research=$5,contact_url=$6,email=$7,target_url=$8,angle=$9,notes=$10,follow_up_on=$11,updated_at=now() WHERE id=$1`,[p.id,next.name,next.category,next.priority,JSON.stringify(next.research),next.contactUrl,next.email,next.targetUrl,next.angle,next.notes,next.followUpOn]);
 await event(tx,p.id,'EDIT',p.status,p.status,'Dados editoriais atualizados',actor,{before:p,after:next});
 }else if(action==='follow-up'){
 const date=validFollowUp(body.date);await tx.query(`UPDATE authority_prospects SET follow_up_on=$2,updated_at=now() WHERE id=$1`,[p.id,date]);await event(tx,p.id,'FOLLOW_UP_DATE',p.status,p.status,date??'Data removida',actor,{before:p.followUpOn,after:date});
 }else if(action==='link'){
 const source=publicUrl(body.sourceUrl),target=targetUrl(body.targetUrl);if(domainOf(source)!==p.domain)throw Error('SOURCE_DOMAIN_MISMATCH');
 const result=await tx.query(`INSERT INTO authority_links(prospect_id,source_url,target_url,is_qa) VALUES($1,$2,$3,$4) ON CONFLICT(source_url,target_url) DO NOTHING RETURNING id`,[p.id,source,target,p.isQa]);if(!result.rowCount)throw Error('DUPLICATE_LINK');
 await event(tx,p.id,'LINK_RECORDED',p.status,p.status,text(body.note??''),actor,{source,target,state:'UNKNOWN'});
 }else throw Error('INVALID_ACTION');
 return {updated:true};
 });
}
async function event(db:QueryExecutor,id:string,kind:string,from:string|null,to:string,note:string,actor:string,details:unknown={}){await db.query(`INSERT INTO authority_outreach_events(prospect_id,kind,from_status,to_status,note,actor,details) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,kind,from,to,note,actor,JSON.stringify(details)]);}
