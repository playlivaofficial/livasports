import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {mobileRotationMinutes,resolveOffer,rotatingChoice} from './service';
import type {Campaign,CommercialContext,Creative,Placement} from './types';

const now=Date.parse('2026-10-08T12:00:00Z'),WINDOW=10*60000;
const creative=(id:string,placement:Placement,width=320,height=50):Creative=>({id,placement,locale:'co',imageUrl:`/sponsors/${id}.webp`,imageAlt:'Sponsor',width,height,
  approved:true,enabled:true,startsAt:null,endsAt:null,delivery:'IMAGE'});
/** Synthetic, test-only destinations on each operator's own Colombian host. */
const campaign=(id:string,bookmaker:string,host:string,creatives:Creative[]):Campaign=>({id,linkId:id,operatorCampaignId:'1',bookmaker,locale:'co',enabled:true,approved:true,
  geoEligible:true,affiliateApproved:true,destination:`https://${host}/synthetic-test-only`,destinationType:'SPORTSBOOK',
  placements:[...new Set(creatives.map(c=>c.placement))],domains:[host],startsAt:'2026-01-01T00:00:00Z',endsAt:'2099-01-01T00:00:00Z',creatives});
const betsson=(c:Creative[])=>campaign('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','betsson','record.betsson.co',c);
const bwin=(c:Creative[])=>campaign('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bwin','sports.bwin.co',c);
const deps=(campaigns:Campaign[])=>({campaigns:async()=>campaigns,page:async(x:CommercialContext)=>({pageType:'HOME' as const,pagePath:x.pagePath}),pricing:async()=>now+60000});
const ctx=(placement:Placement):CommercialContext=>({locale:'co',pagePath:'/co',placement});
const entry=(bookmaker:string,id=bookmaker)=>({campaign:{id,bookmaker} as Campaign});

describe('shared mobile sponsor slot',()=>{
  it('rotates only the single mobile slot',()=>{
    for(const placement of ['home_top_banner','home_right_rail','match_top_banner','match_right_rail','competition_inline'])
      expect(rotatingChoice(placement,[entry('betsson'),entry('bwin')],now)).toBeNull();
    expect(rotatingChoice('mobile_inline',[entry('betsson'),entry('bwin')],now)).not.toBeNull();
  });

  it('is deterministic: everyone in one window sees the same operator, in registry order',()=>{
    const both=[entry('bwin'),entry('betsson')],start=Math.floor(now/WINDOW)*WINDOW;
    const first=rotatingChoice('mobile_inline',both,start)!.campaign.bookmaker;
    expect(rotatingChoice('mobile_inline',both,start+WINDOW-1)!.campaign.bookmaker).toBe(first);
    expect(rotatingChoice('mobile_inline',[...both].reverse(),start)!.campaign.bookmaker).toBe(first);
    const next=rotatingChoice('mobile_inline',both,start+WINDOW)!.campaign.bookmaker;
    expect(next).not.toBe(first);expect(new Set([first,next])).toEqual(new Set(['betsson','bwin']));
    // Betsson precedes bwin in the registry display order, so it takes the even windows.
    expect(rotatingChoice('mobile_inline',both,0)!.campaign.bookmaker).toBe('betsson');
  });

  it('treats two campaigns from one operator as ambiguous configuration, not a rotation',()=>{
    expect(rotatingChoice('mobile_inline',[entry('betsson','a'),entry('betsson','b')],now)).toBeNull();
  });

  it('honours the operator a signed offer was issued for, even across a window boundary',()=>{
    const both=[entry('betsson','b-id'),entry('bwin','w-id')];
    expect(rotatingChoice('mobile_inline',both,0,'w-id')!.campaign.id).toBe('w-id');
    expect(rotatingChoice('mobile_inline',both,WINDOW,'b-id')!.campaign.id).toBe('b-id');
    expect(rotatingChoice('mobile_inline',both,0,'unknown')).toBeNull();
  });

  it('reads a bounded rotation window from configuration',()=>{
    expect(mobileRotationMinutes({})).toBe(10);
    expect(mobileRotationMinutes({AFFILIATE_MOBILE_ROTATION_MINUTES:'30'})).toBe(30);
    for(const bad of ['0','1441','2.5','x'])expect(mobileRotationMinutes({AFFILIATE_MOBILE_ROTATION_MINUTES:bad})).toBe(10);
  });
});

describe('offer resolution with two active Colombian sponsors',()=>{
  it('serves exactly one operator in the mobile slot and re-resolves the same one for its frame',async()=>{
    const campaigns=[betsson([creative('betsson-co-mobile','mobile_inline')]),bwin([creative('bwin-co-mobile','mobile_inline')])];
    const offer=(await resolveOffer(ctx('mobile_inline'),deps(campaigns),now))!;
    expect(['betsson','bwin']).toContain(offer.campaign.bookmaker);
    const again=await resolveOffer(ctx('mobile_inline'),deps(campaigns),now+WINDOW,offer.campaign.id);
    expect(again?.campaign.id).toBe(offer.campaign.id);
  });

  it('still fails closed when two operators claim the same desktop slot',async()=>{
    const campaigns=[betsson([creative('betsson-co-right','home_right_rail',300,250)]),bwin([creative('bwin-co-right','home_right_rail',300,250)])];
    expect(await resolveOffer(ctx('home_right_rail'),deps(campaigns),now)).toBeNull();
  });

  it('serves the lone sponsor unchanged while only one is active, as Colombia is today',async()=>{
    const offer=await resolveOffer(ctx('mobile_inline'),deps([betsson([creative('betsson-co-mobile','mobile_inline')])]),now);
    expect(offer?.campaign.bookmaker).toBe('betsson');
  });
});
