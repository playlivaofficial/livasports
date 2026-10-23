import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {dailyBriefAudit,dailyResearchBriefs} from './daily-briefs';
import {safeNewsDraft,validateNewsDraft,resolveNewsTranslation,transitionNews,type NewsRecord} from './model';

describe('dated English-only daily research briefs',()=>{
  it.each(dailyResearchBriefs)('$slug is safe, short, unpublished and date-accurate',draft=>{
    expect(safeNewsDraft(draft)).toBe(true);
    expect(validateNewsDraft(draft,new Date('2026-10-21T12:00:00Z'))).toEqual([]);
    const words=[draft.title.en,draft.summary.en,draft.body.en,draft.sourceName].join(' ').split(/\s+/u).length;
    expect(words).toBeLessThanOrEqual(25);
    expect(draft.image).toBe('none');expect(draft.featured).toBe(false);
    expect(draft).not.toHaveProperty('publishedAt');expect(draft).not.toHaveProperty('verifiedAt');
    expect(dailyBriefAudit.find(a=>a.slug===draft.slug)?.reviewStatus).toBe('PENDING_HUMAN_REVIEW');
    const record:NewsRecord={slug:draft.slug,draft,published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false};
    const now=new Date('2026-10-21T12:00:00Z');
    const published=transitionNews(transitionNews(record,'review',undefined,now),'publish',undefined,now).published!;
    for(const language of ['es','pt'] as const){
      expect(draft.title[language]).toBe('');
      expect(draft.translationReview![language].state).toBe('unavailable');
      expect(resolveNewsTranslation(published,language)?.language).toBe('en');
      expect(resolveNewsTranslation(published,language)?.fallback).toBe(true);
    }
  });
  it('does not populate the public feed or bypass Owner review',()=>{
    for(const file of ['server.ts','seed.ts','repository.ts'])expect(readFileSync(`src/editorial/${file}`,'utf8')).not.toContain('dailyResearchBriefs');
  });
});
