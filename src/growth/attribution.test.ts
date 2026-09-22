import {describe,expect,it} from 'vitest';
import {growthTrackingUrls,trackedGrowthUrl} from './attribution';
import {classifyReferrer,parseUtm} from '@/analytics/taxonomy';

describe('Traffic Engine V1 attribution',()=>{
  const canonical='https://livasports.com/br/jogo/flamengo-x-palmeiras-1234567890abcdef';
  it('keeps the canonical destination path and applies the centralized channel convention',()=>{
    const url=new URL(trackedGrowthUrl(canonical,'TIKTOK','1234567890abcdef'));
    expect(url.origin+url.pathname).toBe(canonical);expect(url.searchParams.get('utm_source')).toBe('tiktok');
    expect(url.searchParams.get('utm_medium')).toBe('social');expect(url.searchParams.get('utm_campaign')).toBe('traffic_engine_v1');
  });
  it('creates distinct links for TikTok, Instagram and YouTube Shorts',()=>{
    const urls=growthTrackingUrls(canonical,'1234567890abcdef');
    expect(new Set(Object.values(urls)).size).toBe(4);expect(urls.INSTAGRAM_REELS).toContain('utm_source=instagram');expect(urls.YOUTUBE_SHORTS).toContain('utm_source=youtube');
  });
  it('is retained by the existing first-touch UTM parser and social classifier',()=>{
    const tracked=new URL(trackedGrowthUrl(canonical,'YOUTUBE_SHORTS','1234567890abcdef'));
    expect(parseUtm(tracked.search)).toMatchObject({source:'youtube',medium:'social',campaign:'traffic_engine_v1'});
    expect(classifyReferrer(null,'livasports.com','social','youtube').referrerClass).toBe('social');
  });
});
