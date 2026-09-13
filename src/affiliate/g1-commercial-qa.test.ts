import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {configuredCampaignChecks,privateSerializationSafe} from '../../scripts/g1-commercial-qa-checks';
import {parseCampaignConfiguration,type CampaignConfiguration} from './configuration';
import type {Campaign,Placement} from './types';

const now=Date.parse('2026-09-15T12:00:00Z');
function fixture(){
  // Synthetic test contract only: no captured destination, asset or tracking ID.
  const destination='https://record.betsson.bet.br/synthetic-qa-only/1';
  const profiles:Array<[Placement,number,number]>=[['home_top_banner',970,90],['home_right_rail',300,600],
    ['mobile_inline',320,100],['match_right_rail',300,600],['team_right_rail',300,600],
    ['player_right_rail',300,600],['profile_mobile_inline',320,100]];
  const config:CampaignConfiguration={bookmaker:'betsson',locale:'br',operatorCampaignId:'1',destinationUrl:destination,
    destinationType:'SPORTSBOOK',enabled:true,validFrom:'2026-09-01T00:00:00Z',validUntil:'2027-09-01T00:00:00Z',
    placements:['match_odds_table','match_slip_comparison','slip_bookmaker_comparison',...profiles.map(p=>p[0])],
    domains:['record.betsson.bet.br'],approvalReference:'Synthetic QA',
    creatives:profiles.map(([placement,width,height],i)=>({id:`synthetic-${i}`,placement,width,height,delivery:'BETSSON_EMBED',
      imageAlt:'Synthetic QA',approvalReference:'Synthetic QA',embedSourceUrl:`https://c.bannerflow.net/a/${'a'.repeat(24)}?`+
      new URLSearchParams({display:'image',did:'b'.repeat(24),deeplink:'on',adgroupid:'c'.repeat(24),redirecturl:destination,media:'123456',campaign:'1'})}))};
  const campaign:Campaign={id:'synthetic-campaign',linkId:'synthetic-link',bookmaker:'betsson',locale:'br',enabled:true,
    approved:true,affiliateApproved:true,geoEligible:true,operatorCampaignId:'1',destination,destinationType:'SPORTSBOOK',
    placements:[...config.placements],domains:[...config.domains],startsAt:config.validFrom,endsAt:config.validUntil,
    creatives:config.creatives!.map(c=>({...c,locale:'br',imageUrl:null,enabled:true,approved:true,startsAt:config.validFrom,endsAt:config.validUntil}))};
  return {config,br:[campaign],mx:[] as Campaign[],campaign};
}
type Fixture=ReturnType<typeof fixture>;
const mutations:Array<[string,(f:Fixture)=>void]>=[
  ['current unconfigured three-placement state',f=>{f.campaign.placements=f.campaign.placements.slice(0,3);f.campaign.creatives=[];}],
  ['duplicate enabled campaign',f=>f.br.push(structuredClone(f.campaign))],
  ['unapproved campaign',f=>{f.campaign.approved=false;}],
  ['wrong campaign identity',f=>{f.campaign.operatorCampaignId='2';}],
  ['different destination',f=>{f.campaign.destination+='different';}],
  ['unexpected domain',f=>f.campaign.domains.push('unexpected.invalid')],
  ['duplicate placement',f=>{f.campaign.placements[0]=f.campaign.placements[1];}],
  ['missing placement',f=>{f.campaign.placements.pop();}],
  ['unexpected placement',f=>{f.campaign.placements[0]='match_top_banner';}],
  ['disabled private configuration',f=>{f.config.enabled=false;}],
  ['wrong intended creative count',f=>{f.config.creatives!.pop();}],
  ['missing creative',f=>{f.campaign.creatives.pop();}],
  ['duplicate persisted creative identity',f=>{f.campaign.creatives[0].id=f.campaign.creatives[1].id;}],
  ['unexpected enabled creative',f=>f.campaign.creatives.push({...f.campaign.creatives[0],id:'unexpected'})],
  ['unexpected creative under a retired campaign',f=>f.br.push({...structuredClone(f.campaign),id:'retired',enabled:false})],
  ['unapproved creative',f=>{f.campaign.creatives[0].approved=false;}],
  ['disabled creative',f=>{f.campaign.creatives[0].enabled=false;}],
  ['wrong delivery',f=>{f.campaign.creatives[0].delivery='IMAGE';}],
  ['different source',f=>{f.campaign.creatives[0].embedSourceUrl+='&extra=1';}],
  ['mixed image and embed delivery',f=>{f.campaign.creatives[0].imageUrl='/sponsors/synthetic.png';}],
  ['wrong width',f=>{f.campaign.creatives[0].width=728;}],
  ['wrong height',f=>{f.campaign.creatives[0].height=250;}],
  ['wrong creative placement',f=>{f.campaign.creatives[0].placement='mobile_inline';}],
  ['wrong creative locale',f=>{f.campaign.creatives[0].locale='mx';}],
  ['missing creative date window',f=>{f.campaign.creatives[0].startsAt=null;}],
  ['different creative date window',f=>{f.campaign.creatives[0].endsAt='2027-10-01T00:00:00Z';}],
  ['future campaign and creatives',f=>{f.config.validFrom='2026-10-01T00:00:00Z';f.campaign.startsAt=f.config.validFrom;f.campaign.creatives.forEach(c=>{c.startsAt=f.config.validFrom;});}],
  ['expired campaign and creatives',f=>{f.config.validUntil='2026-09-10T00:00:00Z';f.campaign.endsAt=f.config.validUntil;f.campaign.creatives.forEach(c=>{c.endsAt=f.config.validUntil;});}],
  ['Betano enabled',f=>f.br.push({...structuredClone(f.campaign),id:'betano',bookmaker:'betano.bet.br',creatives:[]})],
  ['MX enabled',f=>f.mx.push({...structuredClone(f.campaign),id:'mx',locale:'mx',creatives:[]})],
];

describe('read-only G1 post-configuration expectations',()=>{
  it('accepts the exact intended state and order-independent placement sets',()=>{
    const f=fixture();expect(parseCampaignConfiguration(f.config)).not.toBeNull();f.campaign.placements.reverse();
    expect(configuredCampaignChecks(f.config,f.br,f.mx,now).every(c=>c.pass)).toBe(true);
  });
  it.each(mutations)('rejects %s',(_name,mutate)=>{
    const f=fixture();mutate(f);expect(configuredCampaignChecks(f.config,f.br,f.mx,now).some(c=>!c.pass)).toBe(true);
  });
  it('allows disabled historical creatives without accepting extra enabled creatives',()=>{
    const f=fixture();f.campaign.creatives.push({...f.campaign.creatives[0],id:'retired',enabled:false});
    expect(configuredCampaignChecks(f.config,f.br,f.mx,now).every(c=>c.pass)).toBe(true);
  });
  it('reports safe ordinals instead of private identifiers or sources on mismatch',()=>{
    const f=fixture();f.campaign.creatives[0].id=f.config.destinationUrl;
    const checks=configuredCampaignChecks(f.config,f.br,f.mx,now);
    expect(privateSerializationSafe({status:'FAIL',checks},f.config)).toBe(true);
  });
});

describe('QA health and report serialization',()=>{
  const leaks:Array<[string,(f:Fixture)=>unknown]>=[
    ['destination field',()=>({destinationUrl:'redacted'})],
    ['operator identity field',()=>({operatorCampaignId:'1'})],
    ['nested raw destination',f=>({error:{text:f.config.destinationUrl}})],
    ['raw source',f=>({error:f.config.creatives![0].embedSourceUrl})],
    ['encoded source',f=>({error:encodeURIComponent(f.config.creatives![0].embedSourceUrl!)})],
    ['double encoded source',f=>({error:encodeURIComponent(encodeURIComponent(f.config.creatives![0].embedSourceUrl!))})],
    ['HTML encoded source',f=>({error:f.config.creatives![0].embedSourceUrl!.replaceAll('&','&amp;')})],
    ['escaped slashes',f=>({error:f.config.destinationUrl.replaceAll('/','\\/')})],
    ['opaque identifier',()=>({error:'b'.repeat(24)})],
    ['short private query parameter',()=>({error:'media=123456'})],
    ['short private JSON parameter',()=>({campaign:'1'})],
    ['nested destination parameter',()=>({redirecturl:'redacted'})],
  ];
  it.each(leaks)('rejects %s',(_name,payload)=>{const f=fixture();expect(privateSerializationSafe(payload(f),f.config)).toBe(false);});
  it('allows public counts, internal attribution identity and boolean evidence',()=>{
    const f=fixture();expect(privateSerializationSafe({campaigns:[{id:'internal-id',destinationConfigured:true,approvedCreativeCount:7}],
      metrics:[{campaign_id:'internal-id',clicks:1}],providerRequests:0,checks:[{name:'private source equality',pass:true}]},f.config)).toBe(true);
  });
});
