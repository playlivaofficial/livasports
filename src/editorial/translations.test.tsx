import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,it,expect,vi} from 'vitest';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {initialNews} from './seed';
import {safeNewsDraft,validateNewsDraft,transitionNews,resolveNewsTranslation,resetTranslationReviews,sameNewsContent,type NewsRecord,type PublishedNews} from './model';
import {declareOriginalNewsLanguage,setNewsTranslationAvailable,availableNewsLanguages} from './translations';
import {hasCurrentReview,hasUnpublishedChanges} from './coverage';
import {NewsRepository} from './repository';
import {Newsroom} from './Newsroom';

const now=new Date('2026-10-19T12:00:00.000Z'),later=new Date('2026-10-19T13:00:00.000Z');
const legacy=()=>structuredClone(initialNews[0]);
const explicit=()=>declareOriginalNewsLanguage(legacy(),'es');
const originalOnly=()=>setNewsTranslationAvailable(setNewsTranslationAvailable(explicit(),'en',false),'pt',false);
const record=(draft=explicit()):NewsRecord=>({slug:draft.slug,draft,published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false});
const publish=(value=record(),time=now)=>transitionNews(transitionNews(value,'review',undefined,time),'publish',undefined,time);

describe('explicit news translation contract',()=>{
  it('preserves the legacy both-fields-absent path without inferring an original',()=>{
    const draft=legacy(),snapshot=JSON.stringify(draft),published=publish(record(draft)).published!;
    expect(safeNewsDraft(draft)).toBe(true);expect(validateNewsDraft(draft,now)).toEqual([]);
    expect(published).not.toHaveProperty('originalLanguage');expect(published).not.toHaveProperty('translationReview');
    expect(resolveNewsTranslation(published,'pt')).toMatchObject({language:'pt',originalLanguage:null,fallback:false,availableLanguages:['en','es','pt'],title:draft.title.pt});
    expect(JSON.stringify(draft)).toBe(snapshot);
    expect(resolveNewsTranslation({...published,title:{...published.title,pt:''}},'pt')).toBeNull();
  });
  it('allows one complete original and explicitly empty unavailable translations',()=>{
    const draft=originalOnly();expect(safeNewsDraft(draft)).toBe(true);expect(validateNewsDraft(draft,now)).toEqual([]);expect(availableNewsLanguages(draft)).toEqual(['es']);
    for(const field of ['title','summary','body','imageCaption'] as const){expect(draft[field].en).toBe('');expect(draft[field].pt).toBe('');}
  });
  it('saves incomplete available text safely but cannot review or publish it',()=>{
    const draft={...originalOnly(),body:{en:'',es:'',pt:''}};
    expect(safeNewsDraft(draft)).toBe(true);expect(validateNewsDraft(draft,now).length).toBeGreaterThan(0);
    expect(()=>transitionNews(record(draft),'review',undefined,now)).toThrow('INVALID_DRAFT');
    expect(()=>transitionNews(record(draft),'publish',undefined,now)).toThrow('REVIEW_REQUIRED');
  });
  it.each([
    {originalLanguage:'es'},
    {translationReview:explicit().translationReview},
    {originalLanguage:undefined,translationReview:undefined},
    {originalLanguage:'fr',translationReview:explicit().translationReview},
    {originalLanguage:'es',translationReview:{...explicit().translationReview,fr:{state:'pending',reviewedAt:null}}},
    {originalLanguage:'es',translationReview:{...explicit().translationReview,en:{state:'automatic',reviewedAt:null}}},
    {originalLanguage:'es',translationReview:{...explicit().translationReview,en:{state:'pending',reviewedAt:now.toISOString()}}},
    {originalLanguage:'es',translationReview:{...explicit().translationReview,en:{state:'reviewed',reviewedAt:'not-a-date'}}},
    {originalLanguage:'es',translationReview:{...explicit().translationReview,en:{state:'pending',reviewedAt:null,verifiedByMachine:true}}},
    {originalLanguage:'es',translationReview:{...explicit().translationReview,es:{state:'unavailable',reviewedAt:null}}},
  ])('rejects partial, unknown or forged metadata shapes %#',metadata=>{
    const draft={...legacy(),...metadata};expect(safeNewsDraft(draft)).toBe(false);expect(validateNewsDraft(draft,now).length).toBeGreaterThan(0);
  });
  it('rejects text hidden under unavailable states, including captions and unknown language keys',()=>{
    for(const field of ['title','summary','body','imageCaption'] as const){const draft=originalOnly();draft[field].en='Hidden text';expect(safeNewsDraft(draft)).toBe(false);expect(validateNewsDraft(draft,now).length).toBeGreaterThan(0);}
    expect(safeNewsDraft({...originalOnly(),title:{...originalOnly().title,fr:''}})).toBe(false);
  });
  it('keeps original text available and requires explicit re-entry after a removed translation',()=>{
    const draft=explicit();expect(setNewsTranslationAvailable(draft,'es',false)).toBe(draft);
    const removed=setNewsTranslationAvailable(draft,'en',false),restored=setNewsTranslationAvailable(removed,'en',true);
    expect(restored.translationReview?.en).toEqual({state:'pending',reviewedAt:null});expect(restored.title.en).toBe('');expect(validateNewsDraft(restored,now).length).toBeGreaterThan(0);
    const newOriginal=declareOriginalNewsLanguage(removed,'en');expect(newOriginal.originalLanguage).toBe('en');expect(newOriginal.translationReview?.en.state).toBe('pending');
  });
});

describe('human review and private revision lifecycle',()=>{
  it('records every available language at the same server review time, leaving unavailable states alone',()=>{
    const reviewed=transitionNews(record(originalOnly()),'review',undefined,now);
    expect(reviewed.draft.translationReview).toEqual({en:{state:'unavailable',reviewedAt:null},es:{state:'reviewed',reviewedAt:now.toISOString()},pt:{state:'unavailable',reviewedAt:null}});
    expect(hasCurrentReview(reviewed,now)).toBe(true);expect(transitionNews(reviewed,'publish',undefined,now).published?.verifiedAt).toBe(now.toISOString());
  });
  it('requires same-revision, fresh, matching language review stamps',()=>{
    const reviewed=transitionNews(record(),'review',undefined,now);
    for(const state of [{state:'pending' as const,reviewedAt:null},{state:'reviewed' as const,reviewedAt:later.toISOString()}]){
      const altered={...reviewed,draft:{...reviewed.draft,translationReview:{...reviewed.draft.translationReview!,en:state}}};
      expect(hasCurrentReview(altered,now)).toBe(false);expect(()=>transitionNews(altered,'publish',undefined,now)).toThrow('REVIEW_REQUIRED');
    }
    expect(()=>transitionNews(reviewed,'publish',undefined,new Date(now.getTime()+86400001))).toThrow('REVIEW_REQUIRED');
  });
  it('resets all available reviews on save without changing public dates, source or translations',()=>{
    const published=publish(),before=structuredClone(published.published),saved=transitionNews(published,'save',{...published.draft,title:{...published.draft.title,es:'Un titular revisado y verificado para esta noticia'}},later);
    expect(saved.published).toEqual(before);expect(saved.reviewedRevision).toBeNull();expect(saved.reviewedAt).toBeNull();
    for(const review of Object.values(saved.draft.translationReview!))expect(review).toEqual({state:'pending',reviewedAt:null});
    expect(saved.draft.sourceUrl).toBe(before?.sourceUrl);expect(saved.draft.sourcePublishedOn).toBe(before?.sourcePublishedOn);
    expect(()=>transitionNews(saved,'publish',undefined,later)).toThrow('REVIEW_REQUIRED');
    const republished=publish(saved,later).published!;expect(republished.publishedAt).toBe(before?.publishedAt);expect(republished.updatedAt).toBe(later.toISOString());expect(republished.verifiedAt).toBe(later.toISOString());
  });
  it('does not manufacture a content update when only review evidence changes',()=>{
    const published=publish(),reviewed=transitionNews(published,'review',undefined,later),republished=transitionNews(reviewed,'publish',undefined,later);
    expect(sameNewsContent(published.draft,reviewed.draft)).toBe(true);expect(hasUnpublishedChanges(reviewed)).toBe(false);
    expect(republished.published?.updatedAt).toBe(published.published?.updatedAt);expect(republished.published?.publishedAt).toBe(published.published?.publishedAt);expect(republished.published?.verifiedAt).toBe(later.toISOString());
    const removed=legacy();expect(sameNewsContent(removed,published.draft)).toBe(false);expect(hasUnpublishedChanges({...published,draft:removed})).toBe(true);
  });
  it('never trusts client-supplied review stamps on create, and audits the normalized draft',async()=>{
    const draft=publish().draft,queries:{sql:string;values:readonly unknown[]}[]=[];
    const query=vi.fn(async(sql:string,values:readonly unknown[]=[])=>{queries.push({sql,values});return {rows:sql.includes('count(*)')?[{count:'0'}]:[]};});
    const db={query,transaction:async<T,>(work:(db:QueryExecutor)=>Promise<T>)=>work({query} as unknown as QueryExecutor)} as unknown as DatabaseClient;
    const created=await new NewsRepository(db).mutate({action:'create',slug:draft.slug,revision:0,draft},now);
    expect(created.draft).toEqual(resetTranslationReviews(draft));expect(created.published).toBeNull();expect(created.reviewedAt).toBeNull();
    const audit=queries.find(item=>item.sql.startsWith('INSERT INTO editorial_news_audit'))!;expect(JSON.parse(String(audit.values[3])).draft).toEqual(created.draft);
  });
});

describe('safe language fallback and transparent Owner review',()=>{
  it('falls back as a whole to the declared reviewed original, never mixing text or captions',()=>{
    const published=publish(record(originalOnly())).published!,result=resolveNewsTranslation(published,'en');
    expect(result).toEqual({language:'es',originalLanguage:'es',fallback:true,availableLanguages:['es'],title:published.title.es,summary:published.summary.es,body:published.body.es,imageCaption:published.imageCaption.es});
    expect(resolveNewsTranslation(published,'es')?.fallback).toBe(false);
  });
  it('selects a reviewed requested translation and refuses pending or corrupt original text',()=>{
    const published=publish().published!;expect(resolveNewsTranslation(published,'pt')).toMatchObject({language:'pt',fallback:false});
    const pending={...published,translationReview:{...published.translationReview!,en:{state:'pending' as const,reviewedAt:null}}};
    expect(resolveNewsTranslation(pending,'en')).toMatchObject({language:'es',fallback:true,availableLanguages:['es','pt']});
    expect(resolveNewsTranslation({...pending,translationReview:{...pending.translationReview,es:{state:'pending',reviewedAt:null}}},'en')).toBeNull();
    expect(resolveNewsTranslation({...published,body:{...published.body,es:''}},'en')).toBeNull();
    expect(resolveNewsTranslation({...published,originalLanguage:'fr'} as unknown as PublishedNews,'en')).toBeNull();
  });
  it('names all review states and every language the Owner is confirming without automatic-verification claims',()=>{
    const $=load(renderToStaticMarkup(<Newsroom initial={[]} initialTime={now.toISOString()}/>));
    expect($('[aria-label="Language review states"] li')).toHaveLength(3);
    expect($('[aria-label="Language review states"]').text()).toContain('English (EN) · original — pending');
    expect($('[aria-label="Language review states"]').text()).toContain('Español (ES) — unavailable');
    expect($('.ed-publish').text()).toContain('I personally checked');expect($('.ed-publish').text()).toContain('every listed available language: English.');
    expect($('.ed-publish').text()).toContain('No automatic translation or machine verification is performed.');
    expect($('button').filter((_,element)=>$(element).text()==='Publish reviewed version').prop('disabled')).toBe(true);
  });
});
