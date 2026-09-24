import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {collectSeoSnapshot,familyOf,runSeoMonitor,spreadSample,SEO_SAMPLE_SIZE} from './monitoring-server';
import type {QueryExecutor} from '@/database/client';

const ORIGIN='https://livasports.com';
const sitemap=(urls:string[])=>`<?xml version="1.0" encoding="UTF-8"?><urlset>${urls.map(u=>`<loc>${u.replace(/&/g,'&amp;')}</loc>`).join('')}</urlset>`;
const page=({robots='index, follow',canonical}:{robots?:string;canonical:string})=>
  `<html><head><meta name="robots" content="${robots}"/><link rel="canonical" href="${canonical.replace(/&/g,'&amp;')}"/></head><body></body></html>`;

function world(over:{pages?:Record<string,{status?:number;body?:string;location?:string}>;urls?:string[]}={}){
  const urls=over.urls??[`${ORIGIN}/br`,`${ORIGIN}/br/jogo/a-x-b-1111111111111111`,`${ORIGIN}/br/time/x-2222222222222222`,
    `${ORIGIN}/br/futebol?competition=liga-mx`];
  const calls:string[]=[];
  const fetcher=(async(url:string)=>{
    calls.push(url);
    if(url===`${ORIGIN}/sitemap.xml`)return new Response(sitemap(urls),{status:200});
    if(url===`${ORIGIN}/sports-sitemaps.xml`)return new Response(sitemap([]),{status:200});
    if(url===`${ORIGIN}/robots.txt`)return new Response('Sitemap: https://livasports.com/sitemap.xml\nSitemap: https://livasports.com/sports-sitemaps.xml',{status:200});
    const custom=over.pages?.[url];
    if(custom)return new Response(custom.body??'',{status:custom.status??200,headers:custom.location?{location:custom.location}:undefined});
    return new Response(page({canonical:url}),{status:200});
  }) as unknown as typeof fetch;
  return {fetcher,calls,urls};
}

describe('SEO technical snapshot',()=>{
  it('classifies every submitted route family and locale', ()=>{
    expect(familyOf(`${ORIGIN}/br`)).toBe('home');
    expect(familyOf(`${ORIGIN}/mx/partido/a-x-b-1`)).toBe('match');
    expect(familyOf(`${ORIGIN}/en/team/x-1`)).toBe('team');
    expect(familyOf(`${ORIGIN}/br/futebol?competition=liga-mx`)).toBe('competition');
    expect(familyOf(`${ORIGIN}/br/futebol`)).toBe('football');
    expect(familyOf(`${ORIGIN}/br/jogos/hoje`)).toBe('today');
    expect(familyOf('not a url')).toBe('other');
  });
  it('counts the submitted inventory and finds no problem in a healthy site',async()=>{
    const {fetcher}=world();
    const snapshot=await collectSeoSnapshot(fetcher,new Date('2026-09-24T05:40:00Z'));
    expect(snapshot.submittedTotal).toBe(4);
    expect(snapshot.families).toMatchObject({home:1,match:1,team:1,competition:1});
    expect(snapshot.locales).toMatchObject({br:4});
    expect(snapshot.problems).toEqual([]);
    expect(snapshot.robotsOk).toBe(true);
  });
  it('detects a submitted URL that is noindex, redirected, erroring or wrongly canonicalised',async()=>{
    const {fetcher}=world({pages:{
      [`${ORIGIN}/br/jogo/a-x-b-1111111111111111`]:{body:page({robots:'noindex, follow',canonical:`${ORIGIN}/br/jogo/a-x-b-1111111111111111`})},
      [`${ORIGIN}/br/time/x-2222222222222222`]:{status:308,location:`${ORIGIN}/br/time/y-2222222222222222`},
      [`${ORIGIN}/br/futebol?competition=liga-mx`]:{status:404},
      [`${ORIGIN}/br`]:{body:page({canonical:`${ORIGIN}/`})},
    }});
    const problems=(await collectSeoSnapshot(fetcher,new Date())).problems.map(p=>p.type);
    expect(problems).toEqual(expect.arrayContaining(['NOINDEX_IN_SITEMAP','REDIRECT_IN_SITEMAP','ERROR_IN_SITEMAP','CANONICAL_MISMATCH']));
  });
  it('accepts an escaped ampersand in a canonical, because that is correct HTML',async()=>{
    const url=`${ORIGIN}/br/futebol?competition=liga-mx&tab=results`;
    const {fetcher}=world({urls:[url]});
    expect((await collectSeoSnapshot(fetcher,new Date())).problems).toEqual([]);
  });
  it('reports an unreachable sitemap instead of silently recording zero URLs',async()=>{
    const fetcher=(async(url:string)=>url.includes('robots')?new Response('',{status:200}):new Response('',{status:500})) as unknown as typeof fetch;
    const snapshot=await collectSeoSnapshot(fetcher,new Date());
    expect(snapshot.problems.map(p=>p.type)).toContain('SITEMAP_UNREACHABLE');
  });
  it('samples a bounded, evenly spread slice of a large inventory',()=>{
    const items=Array.from({length:10000},(_,i)=>i);
    const sample=spreadSample(items,SEO_SAMPLE_SIZE);
    expect(sample).toHaveLength(SEO_SAMPLE_SIZE);
    expect(sample[0]).toBe(0);
    expect(sample.at(-1)).toBeGreaterThan(9000);
    expect(new Set(sample).size).toBe(SEO_SAMPLE_SIZE);
    expect(spreadSample([1,2],SEO_SAMPLE_SIZE)).toEqual([1,2]);
  });
});

describe('SEO monitor run',()=>{
  function db(){
    const queries:Array<{sql:string;params:unknown[]}>=[];
    const query=vi.fn(async(sql:string,params:unknown[]=[])=>{
      queries.push({sql,params});
      if(sql.includes('FROM seo_snapshots WHERE'))return {rows:[],rowCount:0};
      if(sql.includes('INSERT INTO seo_snapshots'))return {rows:[{id:'snap-1'}],rowCount:1};
      return {rows:[],rowCount:0};
    });
    return {db:{query:query as unknown as QueryExecutor['query']},queries};
  }
  it('stores one snapshot per day and upserts on a re-run, so a retry never duplicates',async()=>{
    const {fetcher}=world();const {db:client,queries}=db();
    const result=await runSeoMonitor(client,fetcher,new Date('2026-09-24T05:40:00Z'));
    expect(result).toMatchObject({state:'SUCCEEDED',day:'2026-09-24',submittedTotal:4,problems:0,providerRequests:0});
    const insert=queries.find(q=>q.sql.includes('INSERT INTO seo_snapshots'))!;
    expect(insert.sql).toContain('ON CONFLICT(captured_day,source) DO UPDATE');
    expect(insert.params[0]).toBe('2026-09-24');
  });
  it('writes alerts against the stored snapshot and dedupes them',async()=>{
    const {fetcher}=world({pages:{[`${ORIGIN}/br`]:{status:404}}});
    const {db:client,queries}=db();
    await runSeoMonitor(client,fetcher,new Date('2026-09-24T05:40:00Z'));
    const alert=queries.find(q=>q.sql.includes('INSERT INTO seo_alerts'));
    expect(alert?.sql).toContain('ON CONFLICT(snapshot_id,code,url_family) DO UPDATE');
    expect(alert?.params[0]).toBe('snap-1');
    expect(alert?.params[3]).not.toBeNull();
  });
  it('never throws out of the job: a failure is reported as state FAILED',async()=>{
    const failing={query:(async()=>{throw new Error('db down');}) as unknown as QueryExecutor['query']};
    const {fetcher}=world();
    expect(await runSeoMonitor(failing,fetcher,new Date('2026-09-24T05:40:00Z'))).toMatchObject({state:'FAILED',providerRequests:0});
  });
  it('spends no provider budget and touches only our own origin',async()=>{
    const {fetcher,calls}=world();const {db:client}=db();
    await runSeoMonitor(client,fetcher,new Date('2026-09-24T05:40:00Z'));
    expect(calls.every(url=>url.startsWith(ORIGIN))).toBe(true);
  });
});
