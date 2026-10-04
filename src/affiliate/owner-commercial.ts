import 'server-only';
import {createHash} from 'node:crypto';
import {isCoreGeo,type CoreGeo} from '@/config/geo';
import {databaseUrl,PostgresDatabaseClient,type DatabaseClient,type QueryExecutor} from '@/database/client';
import {safeAffiliateDestination} from '@/odds/affiliate';
import {verifiedGeo} from '@/odds/geo';
import {requestOwnerSession} from '@/owner/session';
import {ownerHeaders} from '@/owner/server';
import {boundedJson} from '@/slip/server';
import {configureCampaignInTransaction} from './configuration';
import type {SiteLocale} from '@/config/i18n';

export interface CommercialOperator {
  operator:string;brand:string;geo:CoreGeo;currency:string;status:string;legalStatus:string;legalReference:string|null;
  legalVerifiedAt:string|null;providerMappings:Array<{provider:string;id:string;verified:boolean}>;sourceDomains:string[];
  destinationDomains:string[];sportsbookEnabled:boolean;oddsVisible:boolean;version:number;lastValidatedAt:string|null;
  quoteCount:number;lastQuoteAt:string|null;affiliateUrl:string|null;campaignId:string|null;subId:string|null;validUntil:string|null;
  offer:{title?:string;terms?:string};
}
let productionDb:DatabaseClient|null=null;
export function commercialOwnerDatabase():DatabaseClient{const url=databaseUrl();if(!url)throw Error('DATABASE_UNAVAILABLE');return productionDb??=new PostgresDatabaseClient(url,undefined,{statementTimeoutMs:5000});}
export async function readCommercialOperators(db:QueryExecutor):Promise<CommercialOperator[]>{
  const result=await db.query(`SELECT b.provider_slug,b.display_name,c.iso2,g.*,l.destination_url,
    ac.operator_campaign_id,ac.sub_id,ac.valid_until,ac.offer_metadata,
    COALESCE(m.mappings,'[]'::jsonb) AS mappings,COALESCE(q.quote_count,0) AS quote_count,q.last_quote_at
    FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
    LEFT JOIN affiliate_links l ON l.bookmaker_id=b.id AND l.country_id=c.id
    LEFT JOIN LATERAL(SELECT operator_campaign_id,sub_id,valid_until,offer_metadata FROM affiliate_campaigns WHERE affiliate_link_id=l.id ORDER BY updated_at DESC,id LIMIT 1) ac ON true
    LEFT JOIN LATERAL(SELECT jsonb_agg(jsonb_build_object('provider',provider,'id',provider_bookmaker_id,'verified',verified_at IS NOT NULL) ORDER BY provider,provider_bookmaker_id) AS mappings FROM operator_provider_mappings WHERE bookmaker_id=b.id AND country_id=c.id) m ON true
    LEFT JOIN LATERAL(SELECT count(*) AS quote_count,max(o.observed_at) AS last_quote_at FROM odds_geo_current o
      WHERE o.bookmaker_id=b.id AND o.geo=c.iso2 AND o.status='ACTIVE' AND o.source_domain=ANY(g.source_domains)
      AND EXISTS(SELECT 1 FROM operator_provider_mappings opm WHERE opm.bookmaker_id=b.id AND opm.country_id=c.id
        AND opm.provider=o.source_provider AND opm.provider_bookmaker_id=o.provider_bookmaker_id AND opm.verified_at IS NOT NULL)) q ON true
    WHERE c.iso2 IN ('MX','CO','PE') AND g.commercial_status<>'UNAVAILABLE'
      AND b.provider_slug<>'betano.bet.br'
    ORDER BY c.iso2,g.public_priority,b.display_name LIMIT 96`);
  const date=(v:unknown)=>v instanceof Date?v.toISOString():typeof v==='string'?v:null;
  return result.rows.map(r=>({operator:r.provider_slug,brand:r.display_name,geo:r.iso2,currency:r.currency,status:r.commercial_status,legalStatus:r.legal_status,legalReference:r.legal_reference,
    legalVerifiedAt:date(r.legal_verified_at),providerMappings:r.mappings,sourceDomains:r.source_domains,destinationDomains:r.destination_domains,
    sportsbookEnabled:r.sportsbook_enabled,oddsVisible:r.odds_enabled&&r.comparison_enabled,version:r.commercial_version,lastValidatedAt:date(r.last_validated_at),quoteCount:Number(r.quote_count),lastQuoteAt:date(r.last_quote_at),
    affiliateUrl:r.destination_url,campaignId:r.operator_campaign_id,subId:r.sub_id,validUntil:date(r.valid_until),offer:r.offer_metadata??{}}));
}
export interface ActivationInput {action:'activate'|'suspend';geo:CoreGeo;operator:string;version:number;affiliateUrl?:string;campaignId?:string;subId?:string;validFrom?:string;validUntil?:string;approvalReference?:string;confirmedApproval?:boolean;offer?:{title?:string;terms?:string};}
export function parseActivation(value:unknown):ActivationInput|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as ActivationInput;
  if(Object.keys(v).some(k=>!['action','geo','operator','version','affiliateUrl','campaignId','subId','validFrom','validUntil','approvalReference','confirmedApproval','offer'].includes(k))||!['activate','suspend'].includes(v.action)||!isCoreGeo(v.geo)||typeof v.operator!=='string'||!/^[a-z0-9][a-z0-9.-]{1,79}$/.test(v.operator)||!Number.isInteger(v.version)||v.version<0)return null;
  if(v.action==='suspend')return Object.keys(v).every(k=>['action','geo','operator','version'].includes(k))?v:null;
  if(v.confirmedApproval!==true||typeof v.affiliateUrl!=='string'||v.affiliateUrl.length>4096||typeof v.approvalReference!=='string'||!v.approvalReference.trim()||v.approvalReference.length>500||typeof v.validFrom!=='string'||typeof v.validUntil!=='string'||!Number.isFinite(Date.parse(v.validFrom))||!Number.isFinite(Date.parse(v.validUntil))||Date.parse(v.validUntil)<=Date.parse(v.validFrom)||Date.parse(v.validUntil)<=Date.now())return null;
  for(const text of [v.campaignId,v.subId])if(text!==undefined&&(typeof text!=='string'||text.length>160||/[\u0000-\u001f]/.test(text)))return null;
  if(v.offer!==undefined&&(!v.offer||Array.isArray(v.offer)||typeof v.offer!=='object'||Object.keys(v.offer).some(k=>!['title','terms'].includes(k))||Object.values(v.offer).some(s=>typeof s!=='string'||s.length>1000)))return null;
  return v;
}
export async function activateOperator(db:DatabaseClient,input:ActivationInput,actorId:string){
  const value=parseActivation(input);if(!value)throw Error('INVALID_ACTIVATION');
  // A BR-only feed identity is never a core-GEO operator, even if a legacy row
  // or erroneous mapping exists. Generic Betano CO/PE uses the separate ID.
  if(value.operator==='betano.bet.br')throw Error('OPERATOR_GEO_NOT_CONFIGURED');
  return db.transaction(async q=>{
    const row=(await q.query(`SELECT b.id AS bookmaker_id,c.id AS country_id,g.*,
      EXISTS(SELECT 1 FROM operator_provider_mappings m WHERE m.bookmaker_id=b.id AND m.country_id=c.id AND m.verified_at IS NOT NULL) AS mapped
      FROM bookmakers b JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id JOIN countries c ON c.id=g.country_id
      WHERE b.provider_slug=$1 AND c.iso2=$2 AND b.enabled AND g.commercial_status<>'UNAVAILABLE' FOR UPDATE OF g`,[value.operator,value.geo])).rows[0];
    if(!row)throw Error('OPERATOR_GEO_NOT_CONFIGURED');
    if(row.commercial_status==='UNAVAILABLE')throw Error('OPERATOR_GEO_NOT_CONFIGURED');
    if(row.commercial_version!==value.version)throw Error('CONFIGURATION_CHANGED');
    const version=value.version+1;
    if(value.action==='suspend'){
      await q.query(`UPDATE bookmaker_geo_availability SET commercial_status='SUSPENDED',affiliate_enabled=false,commercial_version=$3,last_validated_at=now(),updated_at=now() WHERE bookmaker_id=$1 AND country_id=$2`,[row.bookmaker_id,row.country_id,version]);
      await q.query(`UPDATE affiliate_links SET enabled=false,updated_at=now() WHERE bookmaker_id=$1 AND country_id=$2`,[row.bookmaker_id,row.country_id]);
      await q.query(`INSERT INTO operator_activation_audit(bookmaker_id,country_id,actor_id,action,version) VALUES($1,$2,$3,'SUSPEND',$4)`,[row.bookmaker_id,row.country_id,actorId,version]);
      return {operator:value.operator,geo:value.geo,status:'SUSPENDED',version};
    }
    if(row.legal_status!=='VERIFIED'||!row.legal_verified_at||typeof row.legal_reference!=='string'||!row.legal_reference.trim()||!row.mapped||!row.sportsbook_enabled||!row.odds_enabled||!row.comparison_enabled||!row.verified_at||!verifiedGeo(row.verification_state,value.geo)||!row.source_domains?.length)throw Error('TECHNICAL_OR_LEGAL_VERIFICATION_REQUIRED');
    const locale=value.geo.toLowerCase() as SiteLocale;
    const destination=safeAffiliateDestination(value.operator,locale,value.affiliateUrl,row.destination_domains??[]);
    if(!destination)throw Error('DESTINATION_NOT_ALLOWLISTED');
    const url=new URL(destination);
    // Only recognized unambiguous URL fields; no guessing or changing the approved destination.
    const derived=(names:string[])=>{const values=names.flatMap(n=>url.searchParams.getAll(n)).filter(Boolean);return values.length===1&&values[0].length<=160?values[0]:'';};
    const campaignId=value.campaignId?.trim()||derived(['campaignId','campaign_id','campaign']);
    if(!campaignId)throw Error('CAMPAIGN_ID_REQUIRED');
    const subId=value.subId?.trim()||derived(['subid','sub_id'])||null;
    await q.query(`UPDATE bookmaker_geo_availability SET commercial_status='ACTIVE',affiliate_enabled=true,commercial_version=$3,last_validated_at=now(),updated_at=now() WHERE bookmaker_id=$1 AND country_id=$2`,[row.bookmaker_id,row.country_id,version]);
    const saved=await configureCampaignInTransaction(q,{bookmaker:value.operator,locale,operatorCampaignId:campaignId,destinationUrl:destination,destinationType:'SPORTSBOOK',enabled:true,validFrom:value.validFrom!,validUntil:value.validUntil!,placements:['match_odds_table','slip_bookmaker_comparison','match_slip_comparison'],domains:[url.hostname],approvalReference:value.approvalReference!});
    await q.query(`UPDATE affiliate_campaigns SET sub_id=$2,offer_metadata=$3::jsonb WHERE id=$1`,[saved.campaignId,subId,JSON.stringify(value.offer??{})]);
    await q.query(`INSERT INTO operator_activation_audit(bookmaker_id,country_id,actor_id,action,version,campaign_id,destination_hash,approval_reference) VALUES($1,$2,$3,'ACTIVATE',$4,$5,$6,$7)`,[row.bookmaker_id,row.country_id,actorId,version,saved.campaignId,createHash('sha256').update(destination).digest('hex'),value.approvalReference]);
    return {operator:value.operator,geo:value.geo,status:'ACTIVE',version,campaignId:saved.campaignId};
  });
}
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:ownerHeaders});
export async function ownerCommercialRequest(request:Request,db:()=>DatabaseClient=commercialOwnerDatabase){
  const session=requestOwnerSession(request.headers);if(!session)return reply({error:'UNAUTHORIZED'},401);
  const url=new URL(request.url);if(url.search)return reply({error:'INVALID_REQUEST'},400);
  if(request.method==='GET'){try{return reply({operators:await readCommercialOperators(db())});}catch{return reply({error:'COMMERCIAL_UNAVAILABLE'},503);}}
  if(request.method!=='POST'||request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')!=='same-origin'||url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return reply({error:'INVALID_ORIGIN'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'INVALID_REQUEST'},400);
  let value;try{value=parseActivation(await boundedJson(request,8192));}catch{return reply({error:'INVALID_REQUEST'},400);}if(!value)return reply({error:'INVALID_ACTIVATION'},400);
  try{return reply(await activateOperator(db(),value,createHash('sha256').update(session.id).digest('hex')));}catch(error){const code=error instanceof Error?error.message:'';const known=['OPERATOR_GEO_NOT_CONFIGURED','CONFIGURATION_CHANGED','TECHNICAL_OR_LEGAL_VERIFICATION_REQUIRED','DESTINATION_NOT_ALLOWLISTED','CAMPAIGN_ID_REQUIRED','INVALID_APPROVED_CONFIGURATION','EXISTING_COMMERCIAL_APPROVAL_REQUIRED'];return reply({error:known.includes(code)?code:'COMMERCIAL_UNAVAILABLE'},code==='CONFIGURATION_CHANGED'?409:known.includes(code)?422:503);}
}
