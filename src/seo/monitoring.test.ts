import {describe,it,expect} from 'vitest';
import {buildSeoScorecard,deriveSeoAlerts,SEO_THRESHOLDS,type SeoSnapshot} from './monitoring';
import {gscStatus,GSC_PROPERTY} from './gsc';

const snapshot=(over:Partial<SeoSnapshot>={}):SeoSnapshot=>({
  capturedAt:'2026-09-24T05:40:00.000Z',submittedTotal:15225,
  families:{match:7647,team:7068,competition:477,content:21,home:3,football:3,live:3,today:3},
  locales:{br:5075,mx:5075,en:5075},sampled:24,problems:[],robotsOk:true,...over});

describe('SEO alert derivation',()=>{
  it('reports nothing when a healthy snapshot follows a healthy one',()=>{
    expect(deriveSeoAlerts(snapshot(),snapshot())).toEqual([]);
  });
  it('never invents a regression on the first ever snapshot',()=>{
    expect(deriveSeoAlerts(snapshot(),null)).toEqual([]);
  });
  it('flags index bloat returning and inventory disappearing, with both values',()=>{
    const spike=deriveSeoAlerts(snapshot({submittedTotal:25000}),snapshot())[0];
    expect(spike).toMatchObject({code:'SUBMITTED_URLS_SPIKE',severity:'WARNING',current:'25000',baseline:'15225'});
    const drop=deriveSeoAlerts(snapshot({submittedTotal:9000}),snapshot()).find(a=>a.code==='SUBMITTED_URLS_DROP');
    expect(drop).toMatchObject({severity:'CRITICAL',current:'9000',baseline:'15225'});
  });
  it('treats a family falling to zero as critical and names the family',()=>{
    const alert=deriveSeoAlerts(snapshot({families:{...snapshot().families,match:0},submittedTotal:15225}),snapshot())
      .find(a=>a.code==='FAMILY_DRIFT'&&a.urlFamily==='match');
    expect(alert).toMatchObject({severity:'CRITICAL',current:'0',baseline:'7647'});
  });
  it('escalates a sitemap that serves noindex, redirects or errors',()=>{
    const problems=[{type:'NOINDEX_IN_SITEMAP' as const,url:'https://livasports.com/br/jogo/a-b-1',family:'match'},
      {type:'REDIRECT_IN_SITEMAP' as const,url:'https://livasports.com/br/time/x-2',family:'team'},
      {type:'ERROR_IN_SITEMAP' as const,url:'https://livasports.com/br/jogo/c-d-3',family:'match'}];
    const codes=deriveSeoAlerts(snapshot({problems}),snapshot()).filter(a=>a.severity==='CRITICAL').map(a=>a.code);
    expect(codes).toEqual(expect.arrayContaining(['NOINDEX_IN_SITEMAP','REDIRECT_IN_SITEMAP','ERROR_IN_SITEMAP']));
  });
  it('treats a canonical problem as a warning rather than an outage',()=>{
    const alert=deriveSeoAlerts(snapshot({problems:[{type:'CANONICAL_MISMATCH',url:'https://livasports.com/br',detail:'https://livasports.com/'}]}),snapshot())
      .find(a=>a.code==='CANONICAL_MISMATCH');
    expect(alert?.severity).toBe('WARNING');
  });
  it('detects one locale silently leaving submission',()=>{
    const alert=deriveSeoAlerts(snapshot({locales:{br:5075,mx:5075,en:0}}),snapshot()).find(a=>a.code==='LOCALE_SKEW');
    expect(alert).toMatchObject({severity:'WARNING'});
  });
  it('raises robots and empty-sitemap failures without any history',()=>{
    const alerts=deriveSeoAlerts(snapshot({robotsOk:false,submittedTotal:0,sampled:0}),null).map(a=>a.code);
    expect(alerts).toEqual(expect.arrayContaining(['ROBOTS_UNHEALTHY','SITEMAP_EMPTY']));
  });
  it('keeps normal rolling-window movement quiet',()=>{
    // The match sitemap tracks a -30/+45 day kickoff window, so it moves every single day.
    const alerts=deriveSeoAlerts(snapshot({submittedTotal:15900,families:{...snapshot().families,match:8300}}),snapshot());
    expect(alerts).toEqual([]);
  });
});

describe('SEO weekly scorecard',()=>{
  it('classifies evidence into buckets and never produces a composite score',()=>{
    const entries=buildSeoScorecard(snapshot(),snapshot(),[]);
    expect(entries.every(e=>['WINS','WATCHLIST','ISSUES'].includes(e.bucket))).toBe(true);
    expect(entries.some(e=>e.code==='TECHNICAL_CLEAN')).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/score/i);
  });
  it('states Search Console as an issue while it is not connected, and shows no metrics',()=>{
    const entries=buildSeoScorecard(snapshot(),snapshot(),[],{state:'NOT_CONNECTED'});
    const gsc=entries.find(e=>e.code==='GSC_NOT_CONNECTED');
    expect(gsc).toMatchObject({bucket:'ISSUES',current:'NOT_CONNECTED',baseline:'CONNECTED'});
    expect(entries.some(e=>/clicks|impressions/i.test(e.code))).toBe(false);
  });
  it('reports real Search Console movement once connected',()=>{
    const entries=buildSeoScorecard(snapshot(),snapshot(),[],
      {state:'CONNECTED',clicks:40,impressions:9000,ctr:0.004,position:11,previous:{clicks:10,impressions:4000,ctr:0.0025,position:14}});
    expect(entries.find(e=>e.code==='CLICKS_UP')).toMatchObject({bucket:'WINS',current:'40',baseline:'10'});
    expect(entries.find(e=>e.code==='WEAK_CTR')?.bucket).toBe('WATCHLIST');
  });
  it('carries critical alerts into ISSUES and warnings into WATCHLIST',()=>{
    const alerts=deriveSeoAlerts(snapshot({submittedTotal:9000}),snapshot());
    const entries=buildSeoScorecard(snapshot({submittedTotal:9000}),snapshot(),alerts);
    expect(entries.find(e=>e.code==='SUBMITTED_URLS_DROP')?.bucket).toBe('ISSUES');
  });
});

describe('Search Console connector',()=>{
  it('is NOT_CONNECTED with the exact missing access when no credential exists',()=>{
    const status=gscStatus({});
    expect(status.state).toBe('NOT_CONNECTED');
    expect(status.property).toBe(GSC_PROPERTY);
    expect(status.missing).toMatch(/GSC_SERVICE_ACCOUNT_JSON|GSC_REFRESH_TOKEN/);
    expect(status.remedy).toContain(GSC_PROPERTY);
  });
  it('does not accept the NextAuth Google sign-in client as Search Console access',()=>{
    expect(gscStatus({} as Record<string,string>).state).toBe('NOT_CONNECTED');
  });
  it('reports a half-configured credential as MISCONFIGURED rather than connected',()=>{
    expect(gscStatus({GSC_REFRESH_TOKEN:'token'}).state).toBe('MISCONFIGURED');
    expect(gscStatus({GSC_SERVICE_ACCOUNT_JSON:'not json'}).state).toBe('MISCONFIGURED');
    expect(gscStatus({GSC_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'a@b.c',private_key:'k'})}).state).toBe('CONNECTED');
  });
  it('keeps thresholds explicit and reviewable',()=>{
    expect(SEO_THRESHOLDS.submittedGrowth).toBeGreaterThan(0);
    expect(SEO_THRESHOLDS.nearPageOneFrom).toBeLessThan(SEO_THRESHOLDS.nearPageOneTo);
  });
});
