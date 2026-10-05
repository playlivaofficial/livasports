import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {validCreative,campaignDestination,isSponsorPlacement} from './policy';
import {resolveOffer} from './service';
import {campaign,dependencies} from './fixtures.test-support';
import {isRetiredBookmaker} from '@/odds/registry';
import type {Campaign,CommercialContext,Creative} from './types';

const now=Date.now();

/**
 * These were 1xBet's inline-leaderboard and home-top-banner tests (migrations 044/045). 1xBet is now
 * RETIRED, so the creative paths it owned can no longer resolve at all. Two things are pinned here:
 * the retired contract for banners and embeds, and the creative-safety rules themselves — the latter
 * retargeted to a live operator because they are what will guard the real MX/CO/PE banner assets.
 */
const RETIRED='1xbet';
const retiredCreative=(overrides:Partial<Creative>={}):Creative=>({
  id:'1xbet-match-inline-br',placement:'match_inline',locale:'br',
  imageUrl:'/sponsors/1xbet/match-inline-970x90.webp',
  imageAlt:'1xBet: apostas esportivas. Proibido para menores de 18 anos. Jogue com responsabilidade.',
  width:970,height:90,approved:true,enabled:true,
  startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+3600000).toISOString(),
  delivery:'IMAGE',embedSourceUrl:null,...overrides,
});
const onexbet=(overrides:Partial<Campaign>={}):Campaign=>({...campaign(now),
  id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',bookmaker:RETIRED,operatorCampaignId:'SYNTHETIC_CAMPAIGN',
  destination:'https://1xaff.com.br/L?tag=synthetic-test-only&site=test-only&ad=test-only',
  domains:['1xaff.com.br'],placements:['match_odds_table','match_slip_comparison','slip_bookmaker_comparison','match_inline','home_top_banner'],
  creatives:[retiredCreative()],...overrides});
const inlineContext:CommercialContext={locale:'br',pagePath:'/br/partida/x',placement:'match_inline'};
const topContext:CommercialContext={locale:'br',pagePath:'/br',placement:'home_top_banner'};

describe('retired bookmaker produces no inline embed or banner',()=>{
  it('is RETIRED',()=>{expect(isRetiredBookmaker(RETIRED)).toBe(true);});

  it('resolves no inline creative even though the creative itself is well formed',async()=>{
    // The creative passes shape validation; the operator gate is what refuses it.
    expect(validCreative(retiredCreative(),inlineContext,now,'SYNTHETIC_CAMPAIGN')).toBe(true);
    expect(await resolveOffer(inlineContext,dependencies(onexbet()),now)).toBeNull();
    expect(campaignDestination(onexbet(),inlineContext,now)).toBeNull();
  });

  it('resolves no home top banner and no tracking destination',async()=>{
    const top=onexbet({creatives:[retiredCreative({id:'1xbet-home-top-banner-br',placement:'home_top_banner',
      imageUrl:'/sponsors/1xbet/top-banner-970x90.webp'})]});
    expect(await resolveOffer(topContext,dependencies(top),now)).toBeNull();
    expect(campaignDestination(top,topContext,now)).toBeNull();
  });

  it('cannot be revived by relisting its previously verified tracking host',()=>{
    expect(campaignDestination(onexbet({domains:['1xaff.com.br']}),inlineContext,now)).toBeNull();
  });
});

/**
 * Creative-safety rules, retargeted to a live operator. These are the guards that will stand between
 * the real affiliate panel assets and the production page, so they are kept rather than retired.
 */
const liveCreative=(overrides:Partial<Creative>={}):Creative=>({
  id:'betsson-mx-home-top-banner',placement:'home_top_banner',locale:'mx',
  imageUrl:'/sponsors/betsson/home-top-banner-970x90.webp',
  imageAlt:'Betsson: apuestas deportivas. Prohibido para menores de 18 anos. Juega con responsabilidad.',
  width:970,height:90,approved:true,enabled:true,startsAt:null,endsAt:null,
  delivery:'IMAGE',embedSourceUrl:null,...overrides});
const liveContext:CommercialContext={locale:'mx',pagePath:'/mx',placement:'home_top_banner'};

describe('creative safety rules for live banner slots',()=>{
  it('accepts a well formed local still image on a sponsor placement',()=>{
    expect(isSponsorPlacement('home_top_banner')).toBe(true);
    expect(validCreative(liveCreative(),liveContext,now,'LIVE_CAMPAIGN')).toBe(true);
  });

  it('rejects animated, remote and embed sources, so library GIFs can never be wired in',()=>{
    expect(validCreative(liveCreative({imageUrl:'/sponsors/betsson/banner.gif'}),liveContext,now)).toBe(false);
    expect(validCreative(liveCreative({imageUrl:'https://partners.betsson.mx/x.jpg'}),liveContext,now)).toBe(false);
    expect(validCreative(liveCreative({embedSourceUrl:'https://c.bannerflow.net/a/'+'a'.repeat(24)}),liveContext,now)).toBe(false);
  });

  it('rejects a creative whose locale or placement does not match its context',()=>{
    expect(validCreative(liveCreative({locale:'co'}),liveContext,now)).toBe(false);
    expect(validCreative(liveCreative({placement:'home_right_rail'}),liveContext,now)).toBe(false);
  });

  it('requires alt text and sane dimensions',()=>{
    expect(validCreative(liveCreative({imageAlt:'   '}),liveContext,now)).toBe(false);
    expect(validCreative(liveCreative({width:99}),liveContext,now)).toBe(false);
    expect(validCreative(liveCreative({height:39}),liveContext,now)).toBe(false);
  });

  it('covers the desktop top and right slots plus the mobile inline slot',()=>{
    for(const placement of ['home_top_banner','home_right_rail','match_top_banner','match_right_rail','mobile_inline'] as const){
      expect(isSponsorPlacement(placement)).toBe(true);
      expect(validCreative(liveCreative({placement}),{...liveContext,placement},now,'LIVE_CAMPAIGN')).toBe(true);
    }
  });

  it('still fails closed if two campaigns ever claim the same slot',async()=>{
    const a=onexbet();const b=onexbet({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});
    expect(await resolveOffer(inlineContext,{...dependencies(a),campaigns:async()=>[a,b]},now)).toBeNull();
  });
});
