import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {canonicalSourceUrl,safeNewsDraft,validateNewsDraft,type NewsDraft} from './model';
import {initialNews} from './seed';
import {v3NewsDrafts,v3SeedSourceAudit,v3SeedExcluded} from './v3-seed';

const now=new Date('2026-10-19T12:00:00.000Z');
const proseWords=(draft:NewsDraft)=>(['title','summary','body'] as const).flatMap(key=>Object.values(draft[key])).join(' ').trim().split(/\s+/u).length;
describe('unpublished V3 source-based draft collection',()=>{
  it.each(v3NewsDrafts.map(draft=>[draft.slug,draft] as const))('%s validates in EN, ES and PT at the fixed review date',(_,draft)=>{
    expect(safeNewsDraft(draft)).toBe(true);expect(validateNewsDraft(draft,now)).toEqual([]);
    expect(draft.featured).toBe(false);expect(draft.sport).toBeDefined();
    if(draft.image!=='none')for(const caption of Object.values(draft.imageCaption))expect(caption).toMatch(/archive|archivo|arquivo/i);
    for(const key of ['publishedAt','updatedAt','verifiedAt','reviewedAt','reviewedRevision'])expect(draft).not.toHaveProperty(key);
    const audit=v3SeedSourceAudit.find(item=>item.slug===draft.slug)!;expect(audit).toBeDefined();expect(audit.reviewStatus).toBe('PENDING_HUMAN_REVIEW');expect(audit.originalPublishedOn).toBe(draft.sourcePublishedOn);expect(audit.sourceUrl).toBe(draft.sourceUrl);
    // Conservatively charge every word of all three language versions, including original context.
    expect(proseWords(draft)+draft.sourceName.split(/\s+/u).length).toBeLessThanOrEqual(audit.wordLimit);
  });
  it('keeps canonical source URLs and slugs unique across old and new collections',()=>{
    const items=[...initialNews,...v3NewsDrafts],sources=items.map(item=>canonicalSourceUrl(item.sourceUrl));
    expect(sources.every(Boolean)).toBe(true);expect(new Set(sources).size).toBe(items.length);expect(new Set(items.map(item=>item.slug)).size).toBe(items.length);
  });
  it('covers all three LATAM editions without repackaging constrained sources',()=>{
    for(const country of ['mx','co','pe'])expect(v3NewsDrafts.some(item=>item.country===country)).toBe(true);
    expect(v3SeedExcluded.find(item=>item.sourceUrl==='https://www.nba.com/news/key-dates')?.reason).toContain('original publication date');
    for(const source of v3SeedExcluded)expect(v3NewsDrafts.some(item=>item.sourceUrl===source.sourceUrl)).toBe(false);
    expect(v3NewsDrafts.find(item=>item.sport==='mma')?.body.en).toContain('archival pre-event notice, not a result');
  });
  it('does not wire unreviewed drafts into public preview or publication paths',()=>{
    for(const path of ['src/editorial/seed.ts','src/editorial/server.ts','src/editorial/repository.ts'])expect(readFileSync(path,'utf8')).not.toContain('v3NewsDrafts');
  });
});
