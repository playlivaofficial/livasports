import {describe,expect,it} from 'vitest';
import {deviceClass,REVENUE_LABELS,revenueContext,revenueSurface} from './attribution';
import {classifyReferrer,parseClientEvent,SERVER_EVENTS} from '@/analytics/taxonomy';
describe('revenue readiness attribution',()=>{
  it('uses deterministic surfaces without confusing acquisition, page and placement',()=>{
    expect(REVENUE_LABELS).toHaveLength(8);
    expect(revenueSurface('match_odds_table')).toBe('livasports_odds');
    expect(revenueSurface('slip_bookmaker_comparison')).toBe('livasports_same_slip_compare');
    expect(revenueSurface('guest-slip')).toBe('livasports_slip');
    expect(revenueSurface('home_top_banner')).toBe('livasports_banner');
    expect(revenueSurface('mobile_sticky')).toBe('livasports_sticky');
    expect(revenueSurface('competition_inline')).toBe('livasports_competition');
    expect(revenueSurface('unknown')).toBeNull();
    expect(revenueContext({locale:'br',pagePath:'/br/jogo/a-x-b-0123456789abcdef',placement:'match_odds_table',fixturePublicId:'0123456789abcdef'}))
      .toEqual({revenueSurface:'livasports_odds',revenueJourney:'livasports_match'});
  });
  it('classifies real social sources, not arbitrary containing strings or absent evidence',()=>{
    for(const source of ['youtube','tiktok','instagram'])expect(classifyReferrer(null,'livasports.com',undefined,source).referrerClass).toBe('social');
    expect(classifyReferrer(null,'livasports.com').referrerClass).toBe('direct');
    expect(classifyReferrer(null,'livasports.com',undefined,'notyoutube').referrerClass).toBe('referral');
  });
  it('keeps embed outcomes server-authoritative and device classes coarse',()=>{
    expect(SERVER_EVENTS).toContain('affiliate_embed_activated');
    expect(parseClientEvent({eventName:'affiliate_embed_activated'})).toBeNull();
    expect(deviceClass(new Headers())).toBe('unknown');
    expect(deviceClass(new Headers({'user-agent':'Mozilla/5.0 iPhone Mobile'}))).toBe('mobile');
    expect(deviceClass(new Headers({'user-agent':'Mozilla/5.0 iPad'}))).toBe('tablet');
    expect(deviceClass(new Headers({'user-agent':'Mozilla/5.0 Chrome'}))).toBe('desktop');
  });
});
