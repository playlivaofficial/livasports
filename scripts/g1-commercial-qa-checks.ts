// Read-only QA assertions. Never imported by production runtime modules.
import type {CampaignConfiguration} from '../src/affiliate/configuration';
import type {Campaign} from '../src/affiliate/types';
import {campaignDestination,validCreative} from '../src/affiliate/policy';

export interface QaCheck {name:string;pass:boolean;}
const sameSet=(actual:readonly string[],expected:readonly string[])=>
  actual.length===expected.length&&new Set(actual).size===actual.length&&
  new Set(expected).size===expected.length&&actual.every(value=>expected.includes(value));
const sameInstant=(actual:string|null,expected:string)=>
  actual!==null&&Number.isFinite(Date.parse(actual))&&Date.parse(actual)===Date.parse(expected);

export function configuredCampaignChecks(config:CampaignConfiguration,br:Campaign[],mx:Campaign[],now:number):QaCheck[]{
  const checks:QaCheck[]=[],check=(name:string,pass:boolean)=>checks.push({name,pass});
  const expected=config.creatives??[];
  check('intended enabled BR campaign configuration has ten placements and seven unique creatives',
    config.enabled&&config.locale==='br'&&config.bookmaker==='betsson'&&config.operatorCampaignId==='1'&&
    config.placements.length===10&&new Set(config.placements).size===10&&expected.length===7&&new Set(expected.map(c=>c.id)).size===7);
  const active=br.filter(c=>c.enabled),campaign=active[0];
  check('exactly one enabled approved Betsson BR campaign',active.length===1&&!!campaign&&campaign.bookmaker==='betsson'&&
    campaign.locale==='br'&&campaign.approved&&campaign.geoEligible&&campaign.affiliateApproved);
  if(!campaign)return checks;
  check('dedicated LivaSports Brazil identity matches private configuration',campaign.operatorCampaignId==='1'&&campaign.operatorCampaignId===config.operatorCampaignId);
  check('persisted destination exactly matches private configuration',campaign.destination===config.destinationUrl);
  check('honest sportsbook capability matches configuration',campaign.destinationType==='SPORTSBOOK'&&campaign.destinationType===config.destinationType);
  check('exact configured placement set persisted',sameSet(campaign.placements,config.placements));
  check('exact configured domain set persisted',sameSet(campaign.domains,config.domains));
  check('campaign date window matches configuration and is active',sameInstant(campaign.startsAt,config.validFrom)&&
    sameInstant(campaign.endsAt,config.validUntil)&&now>=Date.parse(campaign.startsAt)&&now<Date.parse(campaign.endsAt));
  check('campaign and domain validation passes for every configured placement',config.placements.every(placement=>
    campaignDestination(campaign,{locale:'br',pagePath:'/br',placement,bookmaker:'betsson'},now)===config.destinationUrl));
  const enabled=campaign.creatives.filter(c=>c.enabled);
  check('exactly seven configured approved creatives are enabled',enabled.length===7&&enabled.every(c=>c.approved)&&sameSet(enabled.map(c=>c.id),expected.map(c=>c.id)));
  check('no unexpected creatives remain enabled in any campaign',[...br,...mx].every(c=>c.creatives.every(creative=>
    !creative.enabled||(c.id===campaign.id&&expected.some(e=>e.id===creative.id)))));
  expected.forEach((source,index)=>{
    // Ordinals are safe diagnostics; IDs and source values never become labels.
    const matches=campaign.creatives.filter(c=>c.id===source.id),creative=matches[0],label=`configured creative ${index+1}`;
    check(label+' has exactly one persisted identity',matches.length===1);
    if(!creative)return;
    check(label+' delivery and source match exactly',creative.delivery===(source.delivery??'IMAGE')&&
      (creative.embedSourceUrl??null)===(source.embedSourceUrl??null)&&creative.imageUrl===(source.imageUrl??null));
    check(label+' dimensions and placement match exactly',creative.width===source.width&&creative.height===source.height&&
      creative.placement===source.placement&&creative.locale===config.locale&&creative.imageAlt===source.imageAlt);
    check(label+' date window matches configuration',sameInstant(creative.startsAt,config.validFrom)&&sameInstant(creative.endsAt,config.validUntil));
    check(label+' is approved and active under production validation',validCreative(creative,
      {locale:'br',pagePath:'/br',placement:source.placement},now,campaign.operatorCampaignId));
  });
  const betano=[...br,...mx].filter(c=>c.bookmaker==='betano.bet.br');
  check('Betano campaigns and creatives remain disabled',betano.every(c=>!c.enabled&&c.creatives.every(s=>!s.enabled)&&
    c.placements.every(placement=>campaignDestination(c,{locale:c.locale,pagePath:'/'+c.locale,placement,bookmaker:'betano.bet.br'},now)===null)));
  check('MX remains isolated and the BR campaign cannot cross GEO',mx.every(c=>!c.enabled&&c.creatives.every(s=>!s.enabled))&&
    config.placements.every(placement=>campaignDestination(campaign,{locale:'mx',pagePath:'/mx',placement,bookmaker:'betsson'},now)===null));
  return checks;
}

export function privateSerializationSafe(value:unknown,config:CampaignConfiguration):boolean{
  const markers=new Set<string>();
  const collect=(source:string)=>{
    markers.add(source);
    try{
      const url=new URL(source);
      for(const segment of url.pathname.split('/'))if(segment.length>=8)markers.add(segment);
      for(const [key,part] of url.searchParams){
        if(part.startsWith('https://'))collect(part);
        if(!['display','deeplink'].includes(key)&&part){
          markers.add(`${key}=${part}`);
          if(part.length>=8)markers.add(part);
        }
      }
    }catch{/* Non-URL sources are still checked verbatim. */}
  };
  collect(config.destinationUrl);
  for(const creative of config.creatives??[])if(creative.embedSourceUrl)collect(creative.embedSourceUrl);
  let serialized=JSON.stringify(value)??'';
  for(let i=0;i<3;i++){
    serialized=serialized.replace(/&amp;/g,'&').replace(/\\+\//g,'/').replace(/(?:%[0-9a-f]{2})+/gi,part=>{
      try{return decodeURIComponent(part);}catch{return part;}
    });
  }
  return !/"(?:destinationUrl|destination_url|operatorCampaignId|operator_campaign_id|embedSourceUrl|embed_source_url|did|adgroupid|redirecturl|media|campaign)"\s*:/i.test(serialized)&&
    !/https:\/\/(?:record\.betsson\.bet\.br\/|c\.bannerflow\.net\/a\/)/i.test(serialized)&&
    [...markers].every(marker=>!serialized.includes(marker));
}
