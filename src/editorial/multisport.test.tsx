import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {load} from 'cheerio';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {newOwnerSession,signOwnerSession,ownerCookie} from '@/owner/session';
import {initialNews,previewNews} from './seed';
import {newsSport,newsSports,topicsForSport,competitionSport,newsCompetitions,safeNewsDraft,validateNewsDraft,transitionNews,canonicalSourceUrl,validSourceUrl,editorialSourcePolicy,type NewsDraft,type NewsRecord,type NewsSport} from './model';
import {NewsRepository} from './repository';
import {newsroomRequest} from './http';
import {publicNewsFeed,newsroomCoverage} from './coverage';
import {NewsFeed} from './NewsFeed';
import {NewsCard} from './NewsCards';
import {Newsroom} from './Newsroom';
import {topicName} from './copy';

const now=new Date('2026-10-19T12:00:00Z');
const legacy=initialNews[0];
const draftFor=(sport:NewsSport,slug=`test-${sport}`):NewsDraft=>({...structuredClone(legacy),slug,sport,competition:topicsForSport(sport)[0],image:'none',sourceUrl:`https://www.nba.com/news/${slug}`});
const recordFor=(draft:NewsDraft):NewsRecord=>({slug:draft.slug,draft,published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false});
const publish=(record:NewsRecord)=>transitionNews(transitionNews(record,'review',undefined,now),'publish',undefined,now);

/** No network/database use: models the repository's serialized transactional write stream. */
function memoryDatabase(initial:NewsRecord[]=[]){
  let records=structuredClone(initial),tail=Promise.resolve();
  const queries:string[]=[];
  const query=vi.fn(async(sql:string,values:readonly unknown[]=[]):Promise<{rows:unknown[]} >=>{
    queries.push(sql);
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
    if(sql.includes('count(*)'))return {rows:[{count:'0'}]};
    if(sql.includes('FOR UPDATE'))return {rows:records.filter(record=>record.slug===values[0]).map(record=>structuredClone(record))};
    if(sql.includes('AS "draftSource"'))return {rows:records.filter(record=>record.slug!==values[0]).map(record=>({draftSource:record.draft.sourceUrl,publishedSource:record.published?.sourceUrl??null}))};
    if(sql.startsWith('INSERT INTO editorial_news(')){records.push(recordFor(JSON.parse(String(values[1])) as NewsDraft));return {rows:[]};}
    if(sql.startsWith('UPDATE editorial_news ')){const index=records.findIndex(record=>record.slug===values[0]);records[index]={slug:String(values[0]),draft:JSON.parse(String(values[1])),published:values[2]?JSON.parse(String(values[2])):null,revision:Number(values[3]),reviewedRevision:values[4] as number|null,archived:Boolean(values[5]),reviewedAt:values[6] as string|null};return {rows:[]};}
    if(sql.startsWith('INSERT INTO editorial_news_audit'))return {rows:[]};
    throw new Error(`Unexpected test query: ${sql}`);
  });
  const db={query,close:async()=>{},transaction:async<T,>(work:(client:QueryExecutor)=>Promise<T>):Promise<T>=>{
    const previous=tail;let release!:()=>void;tail=new Promise<void>(resolve=>{release=resolve;});await previous;
    const snapshot=structuredClone(records);
    try{return await work(db as unknown as QueryExecutor);}catch(error){records=snapshot;throw error;}finally{release();}
  }} as unknown as DatabaseClient;
  return {db,queries,records:()=>records};
}

afterEach(()=>vi.unstubAllEnvs());
describe('multisport editorial taxonomy and legacy compatibility',()=>{
  it('treats legacy records as football without rewriting published snapshots',()=>{
    const before=JSON.stringify(legacy);expect(newsSport(legacy)).toBe('football');expect(safeNewsDraft(legacy)).toBe(true);expect(validateNewsDraft(legacy,now)).toEqual([]);expect(JSON.stringify(legacy)).toBe(before);
    expect(publicNewsFeed(previewNews,{sport:'football'})).toEqual(previewNews);expect(publicNewsFeed(previewNews,{sport:'tennis'})).toEqual([]);
  });
  it.each(newsSports)('supports %s with matching researched categories and three translations',sport=>{
    const draft=draftFor(sport);expect(safeNewsDraft(draft)).toBe(true);expect(validateNewsDraft(draft,now)).toEqual([]);expect(topicsForSport(sport).length).toBeGreaterThan(0);
    for(const topic of topicsForSport(sport)){expect(competitionSport(topic)).toBe(sport);if(topic!=='national-teams')expect(topicName(topic,'en')).not.toBe('National teams');}
  });
  it('preserves all old topic ids and includes canonical new competition ids',()=>{
    for(const id of ['liga-mx','colombia-primera-a','peru-liga-1','copa-libertadores','champions-league','premier-league','la-liga','serie-a','bundesliga','national-teams','grassroots','peru-liga-2','copa-sudamericana','recopa-sudamericana','peru-copa-de-la-liga','euroleague','billie-jean-king-cup'])expect(newsCompetitions).toContain(id);
    expect(new Set(newsCompetitions).size).toBe(newsCompetitions.length);
  });
  it('rejects unknown sport, mismatched categories, extra fields and missing translations',()=>{
    for(const bad of [{sport:'cricket'},{sport:null},{sport:'basketball',competition:'liga-mx'},{unexpected:'field'},{title:{...legacy.title,html:'unsafe'}},{title:{en:legacy.title.en,es:legacy.title.es}}]){
      expect(safeNewsDraft({...legacy,...bad})).toBe(false);expect(validateNewsDraft({...legacy,...bad},now).length).toBeGreaterThan(0);
    }
    expect(validateNewsDraft({...draftFor('basketball'),image:'azteca'},now)).toContain('Choose an archive photograph reviewed for this sport, or no photograph.');
  });
  it('retains source and publication dates on category edits while requiring a new review',()=>{
    const published=publish(recordFor(legacy)),snapshot=structuredClone(published.published);
    const saved=transitionNews(published,'save',{...legacy,sport:'football',competition:'national-teams'},now);
    expect(saved.published).toEqual(snapshot);expect(saved.draft.sourceUrl).toBe(legacy.sourceUrl);expect(saved.draft.sourcePublishedOn).toBe(legacy.sourcePublishedOn);expect(saved.reviewedAt).toBeNull();expect(saved.reviewedRevision).toBeNull();
    expect(()=>transitionNews(saved,'publish',undefined,now)).toThrow('REVIEW_REQUIRED');
    const later=new Date(now.getTime()+1000),updated=transitionNews(transitionNews(saved,'review',undefined,later),'publish',undefined,later);
    expect(updated.published?.publishedAt).toBe(snapshot?.publishedAt);expect(updated.published?.sourcePublishedOn).toBe(legacy.sourcePublishedOn);expect(updated.published?.sourceUrl).toBe(legacy.sourceUrl);expect(updated.published?.verifiedAt).toBe(later.toISOString());
  });
  it('does not accept corrupt or future review timestamps',()=>{
    const reviewed=transitionNews(recordFor(legacy),'review',undefined,now);
    for(const reviewedAt of ['not-a-date','2026-10-20T00:00:00Z'])expect(()=>transitionNews({...reviewed,reviewedAt},'publish',undefined,now)).toThrow('REVIEW_REQUIRED');
  });
});

describe('manual source registry and canonical deduplication',()=>{
  it('normalizes only equivalent safe URL forms',()=>{
    expect(canonicalSourceUrl('https://WWW.NBA.COM/news/%61rticle/')).toBe('https://nba.com/news/article');
    expect(canonicalSourceUrl('https://nba.com/news/old/../article')).toBe('https://nba.com/news/article');
    expect(canonicalSourceUrl('https://nba.com/news/a%2fb')).toBe('https://nba.com/news/a%2Fb');
    expect(canonicalSourceUrl('https://nba.com/news/Article')).not.toBe(canonicalSourceUrl('https://nba.com/news/article'));
    expect(canonicalSourceUrl('')).toBeNull();expect(editorialSourcePolicy).toMatchObject({mode:'manual-original-summaries-only',automaticFetching:false,fullArticleCopying:false,sourceStatus:'Source not checked'});
  });
  it.each(['https://nba.com.evil.test/news','https://api.nba.com/news','http://nba.com/news','https://nba.com/news?key=x','https://nba.com/news#fragment','https://user:secret@nba.com/news','https://nba.com:444/news','https://127.0.0.1/','https://nba.com/\nnews','https://nba.com\\@evil.test/'])('keeps the clean exact-host URL boundary: %s',value=>expect(validSourceUrl(value)).toBe(false));
  it('rejects a duplicate draft under a different slug without any insert',async()=>{
    const existing=draftFor('basketball','existing'),memory=memoryDatabase([recordFor(existing)]),repo=new NewsRepository(memory.db),draft={...draftFor('basketball','duplicate'),sourceUrl:existing.sourceUrl.replace('www.','')+'/'};
    await expect(repo.mutate({action:'create',slug:draft.slug,revision:0,draft},now)).rejects.toThrow('DUPLICATE_SOURCE');
    expect(memory.records()).toHaveLength(1);expect(memory.queries[0]).toContain('pg_advisory_xact_lock');expect(memory.queries.some(sql=>sql.startsWith('INSERT'))).toBe(false);
  });
  it('checks published snapshots even when the draft source changed and the record is archived',async()=>{
    const published=publish(recordFor(draftFor('basketball','published'))),usedUrl=published.published!.sourceUrl;
    const existing={...published,archived:true,draft:{...published.draft,sourceUrl:'https://nba.com/news/another'}};
    const memory=memoryDatabase([existing]),repo=new NewsRepository(memory.db),draft={...draftFor('basketball','duplicate'),sourceUrl:usedUrl};
    await expect(repo.mutate({action:'create',slug:draft.slug,revision:0,draft},now)).rejects.toThrow('DUPLICATE_SOURCE');
    const check=memory.queries.find(sql=>sql.includes('AS "draftSource"'))!;expect(check).toContain('published');expect(check).not.toContain('LIMIT');expect(check).not.toContain('archived');
  });
  it('permits the same slug to keep its source and refuses a save that collides',async()=>{
    const own=publish(recordFor(draftFor('basketball','own'))),other=recordFor(draftFor('basketball','other')),memory=memoryDatabase([own,other]),repo=new NewsRepository(memory.db);
    const saved=await repo.mutate({action:'save',slug:own.slug,revision:1,draft:{...own.draft,featured:!own.draft.featured}},now);
    expect(saved.published).toEqual(own.published);expect(saved.draft.sourceUrl).toBe(own.draft.sourceUrl);expect(saved.reviewedAt).toBeNull();
    await expect(repo.mutate({action:'save',slug:own.slug,revision:2,draft:{...saved.draft,sourceUrl:other.draft.sourceUrl}},now)).rejects.toThrow('DUPLICATE_SOURCE');
    expect(memory.records().find(row=>row.slug===own.slug)?.revision).toBe(2);
  });
  it('allows incomplete empty sources, but serialized competing source claims have one winner',async()=>{
    const memory=memoryDatabase(),repo=new NewsRepository(memory.db);
    for(const slug of ['empty-one','empty-two'])await repo.mutate({action:'create',slug,revision:0,draft:{...draftFor('basketball',slug),sourceUrl:''}},now);
    const outcomes=await Promise.allSettled(['first','second'].map(slug=>repo.mutate({action:'create',slug,revision:0,draft:{...draftFor('basketball',slug),sourceUrl:'https://nba.com/news/shared'}},now)));
    expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(result=>result.status==='rejected')).toHaveLength(1);expect(memory.records()).toHaveLength(3);
  });
  it('returns the explicit duplicate conflict without invalidating public pages',async()=>{
    vi.stubEnv('OWNER_QA_ACCESS_HASH','a'.repeat(64));vi.stubEnv('OWNER_QA_SESSION_SECRET','multisport-unit-test-only-not-production-'.repeat(2));
    const token=signOwnerSession(newOwnerSession()),invalidate=vi.fn(),repo={mutate:vi.fn().mockRejectedValue(new Error('DUPLICATE_SOURCE'))} as unknown as NewsRepository;
    const response=await newsroomRequest(new Request('https://livasports.com/api/owner/news',{method:'POST',headers:{cookie:`${ownerCookie}=${token}`,origin:'https://livasports.com','sec-fetch-site':'same-origin','content-type':'application/json'},body:JSON.stringify({action:'create',slug:legacy.slug,revision:0,draft:legacy})}),{withRepository:async<T,>(work:(repository:NewsRepository)=>Promise<T>)=>work(repo),invalidate});
    expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'DUPLICATE_SOURCE'});expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('sport filters and truthful coverage',()=>{
  it('combines country, sport and topic without revealing drafts',()=>{
    const basketball=publish(recordFor(draftFor('basketball'))).published!,football=publish(recordFor(legacy)).published!;
    const items=[football,basketball];expect(publicNewsFeed(items,{sport:'basketball',topic:'nba',country:basketball.country})).toEqual([basketball]);expect(publicNewsFeed(items,{sport:'football',topic:'nba'})).toEqual([]);
  });
  it('separates review queue, ready draft, archived, stale and missing coverage',()=>{
    const football=publish(recordFor(legacy)),basketball=publish(recordFor(draftFor('basketball'))),saved=transitionNews(basketball,'save',{...basketball.draft,featured:!basketball.draft.featured},now);
    const ready=transitionNews(recordFor(draftFor('tennis')),'review',undefined,now),archived={...publish(recordFor(draftFor('mma'))),archived:true};
    const coverage=newsroomCoverage([football,saved,ready,archived],now);
    expect(coverage.find(item=>item.sport==='basketball')).toMatchObject({reviewQueue:1,readyToPublish:0,published:1,recent:1,missingCoverage:false,lastPublishedAt:now.toISOString()});
    expect(coverage.find(item=>item.sport==='tennis')).toMatchObject({reviewQueue:0,readyToPublish:1,published:0,missingCoverage:true});
    expect(coverage.find(item=>item.sport==='mma')).toMatchObject({published:0,missingCoverage:true,lastPublishedAt:null});
    expect(newsroomCoverage([football],new Date('2026-11-01'))[0]).toMatchObject({recent:0,staleCoverage:true,sourceStatus:'Source not checked'});
    const staleReady=newsroomCoverage([ready],new Date(now.getTime()+86400001)).find(item=>item.sport==='tennis');expect(staleReady).toMatchObject({reviewQueue:1,readyToPublish:0});
  });
  it('renders localized sport tags and sport/topic selectors without claiming auto-fetching',()=>{
    const item=publish(recordFor(draftFor('basketball'))).published!;
    const $=load(renderToStaticMarkup(<NewsFeed items={[...previewNews,item]} locale="mx" initialTime={now.toISOString()} initialSport="basketball"/>));
    expect($('.ed-news-card')).toHaveLength(1);expect($('.ed-sport-tag').text()).toBe('Baloncesto');expect($('select').first().text()).toContain('Todos los deportes');expect($('select').last().text()).toContain('NBA');expect($('select').last().text()).not.toContain('Liga MX');
    expect(renderToStaticMarkup(<NewsCard item={previewNews[0]} locale="br"/>)).toContain('Futebol');
    const owner=load(renderToStaticMarkup(<Newsroom initial={[recordFor(legacy)]} initialTime={now.toISOString()}/>));expect(owner('.ed-coverage').text()).toContain('Source not checked');expect(owner('.ed-coverage').text()).toContain('Missing coverage');expect(owner('.ed-coverage').text()).toContain('No automatic publication');expect(owner('label').text()).toContain('Filter by sport');
  });
});
