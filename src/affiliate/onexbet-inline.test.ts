import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {validCreative,campaignDestination,isSponsorPlacement} from './policy';
import {resolveOffer} from './service';
import {campaign,dependencies} from './fixtures.test-support';
import type {Campaign,CommercialContext,Creative} from './types';

const now=Date.now();
// Mirrors migration 044: the official static 970x90 leaderboard on the free match_inline slot.
const inlineCreative=(overrides:Partial<Creative>={}):Creative=>({
  id:'1xbet-match-inline-br',placement:'match_inline',locale:'br',
  imageUrl:'/sponsors/1xbet/match-inline-970x90.webp',
  imageAlt:'1xBet: apostas esportivas. Proibido para menores de 18 anos. Jogue com responsabilidade.',
  width:970,height:90,approved:true,enabled:true,
  startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+3600000).toISOString(),
  delivery:'IMAGE',embedSourceUrl:null,...overrides,
});
const onexbet=(overrides:Partial<Campaign>={}):Campaign=>({...campaign(now),
  id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',bookmaker:'1xbet',operatorCampaignId:'7035424',
  destination:'https://1xaff.com.br/L?tag=d_6128686m_134462c_&site=6128686&ad=134462',
  domains:['1xaff.com.br'],placements:['match_odds_table','match_slip_comparison','slip_bookmaker_comparison','match_inline'],
  creatives:[inlineCreative()],...overrides});
const inlineContext:CommercialContext={locale:'br',pagePath:'/br/partida/x',placement:'match_inline'};

describe('1xBet match_inline placement',()=>{
  it('serves the official static leaderboard through the local IMAGE path',()=>{
    expect(isSponsorPlacement('match_inline')).toBe(true);
    expect(validCreative(inlineCreative(),inlineContext,now,'7035424')).toBe(true);
  });
  it('rejects an animated or remote source, so library GIFs can never be wired in',()=>{
    // Only /sponsors/ paths with a still image extension pass; .gif and absolute URLs do not.
    expect(validCreative(inlineCreative({imageUrl:'/sponsors/1xbet/banner.gif'}),inlineContext,now)).toBe(false);
    expect(validCreative(inlineCreative({imageUrl:'https://partners.1xbet.bet.br/x.jpg'}),inlineContext,now)).toBe(false);
    expect(validCreative(inlineCreative({embedSourceUrl:'https://c.bannerflow.net/a/'+'a'.repeat(24)}),inlineContext,now)).toBe(false);
  });
  it('sends clicks only to the verified 1xAff tracking host',()=>{
    expect(campaignDestination(onexbet(),inlineContext,now)).toBe('https://1xaff.com.br/L?tag=d_6128686m_134462c_&site=6128686&ad=134462');
    // An operator domain outside the campaign allowlist is refused even with a valid destination.
    expect(campaignDestination(onexbet({domains:['1xbet.com']}),inlineContext,now)).toBeNull();
  });
  it('is Brazil only',()=>{
    expect(campaignDestination(onexbet({locale:'mx'}),{...inlineContext,locale:'mx'},now)).toBeNull();
  });
  it('never competes with Betsson, which holds no inline slot',async()=>{
    const betsson=campaign(now);
    expect(betsson.placements).not.toContain('match_inline');
    const offer=await resolveOffer(inlineContext,dependencies(onexbet()),now);
    expect(offer?.campaign.bookmaker).toBe('1xbet');
    expect(offer?.creative?.imageUrl).toBe('/sponsors/1xbet/match-inline-970x90.webp');
  });
  it('still fails closed if a second campaign ever claims the same slot',async()=>{
    const rival=onexbet({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});
    const deps={...dependencies(onexbet()),campaigns:async()=>[onexbet(),rival]};
    expect(await resolveOffer(inlineContext,deps,now)).toBeNull();
  });
});

// Mirrors migration 045: the desktop home top banner moves from Betsson to 1xBet.
const topCreative=(overrides:Partial<Creative>={}):Creative=>({...inlineCreative(),
  id:'1xbet-home-top-banner-br',placement:'home_top_banner',
  imageUrl:'/sponsors/1xbet/top-banner-970x90.webp',...overrides});
const topContext:CommercialContext={locale:'br',pagePath:'/br',placement:'home_top_banner'};
const betssonAfter=():Campaign=>({...campaign(now),
  placements:['match_odds_table','match_slip_comparison','slip_bookmaker_comparison','home_right_rail',
    'match_right_rail','team_right_rail','player_right_rail','mobile_inline','profile_mobile_inline'],creatives:[]});

describe('1xBet desktop home top banner',()=>{
  it('serves the official 970x90 leaderboard from the local IMAGE path',()=>{
    expect(validCreative(topCreative(),topContext,now,'7035424')).toBe(true);
  });
  it('resolves uniquely, because Betsson no longer claims home_top_banner',async()=>{
    const onex=onexbet({placements:[...onexbet().placements,'home_top_banner'] as Campaign['placements'],creatives:[topCreative()]});
    const deps={...dependencies(onex),campaigns:async()=>[onex,betssonAfter()]};
    const offer=await resolveOffer(topContext,deps,now);
    expect(offer?.campaign.bookmaker).toBe('1xbet');
    expect(offer?.creative?.imageUrl).toBe('/sponsors/1xbet/top-banner-970x90.webp');
  });
  it('would blank the slot if Betsson still competed, which is why the slot was reallocated',async()=>{
    const onex=onexbet({placements:[...onexbet().placements,'home_top_banner'] as Campaign['placements'],creatives:[topCreative()]});
    const rival={...betssonAfter(),placements:[...betssonAfter().placements,'home_top_banner'] as Campaign['placements'],
      creatives:[{...topCreative(),id:'betsson-br-home-top-banner'}]};
    expect(await resolveOffer(topContext,{...dependencies(onex),campaigns:async()=>[onex,rival]},now)).toBeNull();
  });
  it('leaves every other Betsson placement untouched',()=>{
    const p=betssonAfter().placements;
    for(const kept of ['home_right_rail','match_right_rail','team_right_rail','player_right_rail','mobile_inline','profile_mobile_inline'])
      expect(p).toContain(kept);
    expect(p).not.toContain('home_top_banner');
  });
  it('sends banner clicks to the verified 1xAff host only',()=>{
    const onex=onexbet({placements:[...onexbet().placements,'home_top_banner'] as Campaign['placements']});
    expect(campaignDestination(onex,topContext,now)).toBe('https://1xaff.com.br/L?tag=d_6128686m_134462c_&site=6128686&ad=134462');
    expect(campaignDestination({...onex,locale:'mx'},{...topContext,locale:'mx',pagePath:'/mx'},now)).toBeNull();
  });
});
