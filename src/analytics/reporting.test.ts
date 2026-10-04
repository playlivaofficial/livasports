import {describe,expect,it,vi} from 'vitest';
import type {QueryExecutor} from '@/database/client';
import {readAnalyticsReport,windowBounds} from './reporting';
import {parseFilters} from './filters';
import {isPrivatePath,robotsDisallow} from '@/seo/policy';

describe('P4 owner reporting (§19–§25, §31, §37)',()=>{
  it('counts one ledger-backed outcome, never CTA plus redirect as two clicks',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));
    await readAnalyticsReport({query:query as unknown as QueryExecutor['query']},{window:'7d'});
    const calls=query.mock.calls as unknown as [string,unknown[]][];
    const clickLists=calls.flatMap(([,params])=>(params??[]).filter(Array.isArray)).filter(list=>list.includes('outbound_redirect_completed'));
    expect(clickLists.length).toBeGreaterThan(0);
    for(const list of clickLists)expect(list).toEqual(['outbound_redirect_completed','affiliate_embed_activated']);
    expect(calls[0][0]).toContain("event_name IN ('outbound_redirect_completed','affiliate_embed_activated'))::int AS affiliate_clicks");
    expect(calls[1][0]).toContain('WHERE content AND odds AND slip AND comparison AND click');
  });
  it('bounds every query to the window and to HUMAN traffic by default, and shapes the report from aggregates only',async()=>{
    const now=new Date('2026-09-18T12:00:00Z');
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('AS sessions,(SELECT count(*) FROM sess WHERE visitor_kind'))return {rows:[{sessions:100,new_visitors:70,returning_visitors:30,engaged:60,content_views:150,page_views:400,odds_selections:40,slips_created:25,comparisons:20,affiliate_clicks:12,click_sessions:12,outbound:10,sign_ins:5,favorites_added:8}],rowCount:1};
      if(sql.includes('AS s0,'))return {rows:[{s0:100,s1:80,s2:30,s3:25,s4:20,s5:12}],rowCount:1};
      if(sql.includes('AS bucket'))return {rows:[{bucket:'1',sessions:10},{bucket:'5+',sessions:3}],rowCount:2};
      if(sql.includes('comparison_state AS state'))return {rows:[{state:'REAL_COMPLETE',sessions:15}],rowCount:1};
      if(sql.includes('s.referrer_class AS source'))return {rows:[{source:'google_organic',sessions:60,engaged:40,slips:15,clicks:9},{source:'direct',sessions:10,engaged:3,slips:1,clicks:1}],rowCount:2};
      if(sql.includes('sum(accepted)'))return {rows:[{accepted:1000,duplicates:50,rejected:5,unknown:0,missing:0,oversized:0,server_events:20,lag:12}],rowCount:1};
      if(sql.includes('max(received_at)'))return {rows:[{at:now}],rowCount:1};
      return {rows:[],rowCount:0};
    });
    const report=await readAnalyticsReport({query:query as unknown as QueryExecutor['query']},{window:'7d',locale:'br'},now);
    expect(report.cards).toMatchObject({sessions:100,newVisitors:70,returningVisitors:30,affiliateClicks:12,outboundRedirects:10,clickThroughRate:12,signIns:5,favoritesAdded:8});
    expect(report.funnel.map(s=>[s.stage,s.sessions,s.fromPrevious,s.fromSession])).toEqual([['Sessions',100,null,100],['Sports content view',80,80,80],['Odds selection',30,37.5,30],['Slip creation',25,83.3,25],['Bookmaker comparison',20,80,20],['Affiliate click',12,60,12]]);
    expect(report.legBuckets).toEqual([{bucket:'1',sessions:10},{bucket:'2',sessions:0},{bucket:'3',sessions:0},{bucket:'4',sessions:0},{bucket:'5+',sessions:3}]);
    expect(report.acquisition[0]).toMatchObject({source:'google_organic',rate:15});
    expect(report.quality).toMatchObject({accepted:1000,duplicates:50,duplicateRate:4.8,flags:[]});
    for(const [sql,params] of query.mock.calls as unknown as [string,unknown[]][]){
      if(sql.includes('analytics_sessions s WHERE')){expect(sql).toContain('s.traffic_class=$3');expect(sql).toContain('s.locale=$4');expect(params[2]).toBe('HUMAN');expect(params[3]).toBe('br');}
      expect(sql).not.toMatch(/oddspapi|fetch\(/i);
    }
    const {from,to}=windowBounds('today',now);expect(from.toISOString()).toBe('2026-09-18T00:00:00.000Z');expect(to).toBe(now);
    expect(windowBounds('30d',now).from.toISOString()).toBe('2026-08-19T12:00:00.000Z');
  });
  it('raises data-quality flags for breakage and reports registrations/revenue nowhere',async()=>{
    const now=new Date('2026-09-18T12:00:00Z');
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('AS sessions,(SELECT count(*) FROM sess WHERE visitor_kind'))return {rows:[{sessions:50,page_views:0,cta_interactions:5,affiliate_clicks:0,outbound:0}],rowCount:1};
      if(sql.includes('sum(accepted)'))return {rows:[{accepted:100,duplicates:60,rejected:30,unknown:2,missing:1,lag:2000}],rowCount:1};
      if(sql.includes('max(received_at)'))return {rows:[{at:new Date('2026-09-17T00:00:00Z')}],rowCount:1};
      return {rows:[],rowCount:0};
    });
    const report=await readAnalyticsReport({query:query as unknown as QueryExecutor['query']},{window:'7d'},now);
    expect(report.quality.flags).toEqual(['SESSIONS_WITHOUT_PAGE_VIEWS','HIGH_DUPLICATE_RATE','HIGH_REJECTION_RATE','UNKNOWN_EVENT_TYPES','MISSING_SESSION_IDS','EVENT_LAG_OVER_15_MIN','CLIENT_CLICKS_WITHOUT_SERVER_REDIRECTS','NO_EVENTS_RECEIVED_RECENTLY']);
    expect(JSON.stringify(report)).not.toMatch(/revenue|registration|ftd/i);
  });
  it('owner analytics filters are allowlisted and the route stays private, noindex and out of sitemaps',()=>{
    expect(parseFilters({window:'30d',locale:'mx',geo:'MX',bookmaker:'betsson',competition:'la-liga',pageType:'match',source:'bing_organic',traffic:'QA'})).toEqual({window:'30d',locale:'mx',geo:'MX',bookmaker:'betsson',competition:'la-liga',pageType:'match',source:'bing_organic',traffic:'QA'});
    for(const [locale,geo,bookmaker] of [['mx','MX','caliente'],['co','CO','betplay'],['pe','PE','bet365']]){
      expect(parseFilters({window:'7d',locale,geo,bookmaker})).toMatchObject({window:'7d',locale,geo,bookmaker});
    }
    expect(parseFilters({window:'x',locale:'fr',geo:'US',bookmaker:'unknown-bookie',competition:'DROP TABLE',pageType:'admin',source:'evil',traffic:'ALL'})).toEqual({window:'7d',locale:undefined,geo:undefined,bookmaker:undefined,competition:undefined,pageType:undefined,source:undefined,traffic:undefined});
    expect(isPrivatePath('/owner/analytics')).toBe(true);expect(robotsDisallow).toContain('/owner/');
  });
});
