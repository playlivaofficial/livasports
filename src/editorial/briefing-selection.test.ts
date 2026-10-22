import {describe,it,expect} from 'vitest';
import {briefingStories} from './NewsCards';
import {previewNews} from './seed';
describe('compact secondary newsroom selection',()=>{
 const now=new Date('2026-10-19T12:00:00Z'),item=previewNews[0];
 it('does not repeat the lead, duplicate a slug or fill with rejected stories',()=>{
  const another={...item,slug:'another-story'},bad={...item,slug:'bad-story',verifiedAt:''};
  expect(briefingStories([item,another,another,bad],'en',item.slug,now).map(i=>i.slug)).toEqual(['another-story']);
 });
 it('caps the first-fold briefing without inventing additional publications',()=>{
  expect(briefingStories([],'en',undefined,now)).toEqual([]);
  expect(briefingStories(Array.from({length:5},(_,n)=>({...item,slug:'story-'+n})),'en',undefined,now)).toHaveLength(3);
 });
});
