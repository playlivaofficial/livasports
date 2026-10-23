import {describe,it,expect} from 'vitest';
import {normalizeNewsRecord} from './repository';
import {transitionNews,type NewsRecord} from './model';
import {initialNews} from './seed';
import {declareOriginalNewsLanguage} from './translations';

describe('PostgreSQL newsroom review timestamps',()=>{
  it('preserves exact translation review identity after a database round trip',()=>{
    const now=new Date('2026-10-21T08:00:00.123Z');
    const draft=declareOriginalNewsLanguage(structuredClone(initialNews[3]),'en');
    const record:NewsRecord={slug:draft.slug,draft,published:null,revision:2,reviewedRevision:null,reviewedAt:null,archived:false};
    const reviewed=transitionNews(record,'review',undefined,now);
    const reloaded=normalizeNewsRecord({...reviewed,reviewedAt:'2026-10-21 08:00:00.123+00'});
    const published=transitionNews(reloaded,'publish',undefined,new Date(now.getTime()+1000)).published!;
    expect(published.verifiedAt).toBe(now.toISOString());
    for(const language of ['en','es','pt'] as const)expect(published.translationReview![language].reviewedAt).toBe(published.verifiedAt);
  });
  it('normalizes offsets and retains null without inventing a review',()=>{
    const draft=initialNews[0],record:NewsRecord={slug:draft.slug,draft,published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false};
    expect(normalizeNewsRecord(record).reviewedAt).toBeNull();
    expect(normalizeNewsRecord({...record,reviewedAt:'2026-10-21 12:00:00.123+04'}).reviewedAt).toBe('2026-10-21T08:00:00.123Z');
  });
});
