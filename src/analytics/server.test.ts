import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocked=vi.hoisted(()=>({user:null as {id:string}|null}));
vi.mock('@/auth/session',()=>({currentUser:async()=>mocked.user}));
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {accessKeyHash,newOwnerSession,ownerCookie,signOwnerSession} from '@/owner/session';
import {analyticsIds,classifyTraffic,ingestClientBatch,recordServerEvent} from './server';

const origin='https://livasports.com';
const uuid=(n:number)=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
const event=(n:number,over:Record<string,unknown>={})=>({eventId:uuid(n),eventName:'page_viewed',eventVersion:1,occurredAt:new Date().toISOString(),sessionId:'sess_'+'s'.repeat(20),anonymousId:'anon_'+'a'.repeat(20),
  locale:'br',pageType:'match',canonicalPath:'/br/jogo/x-0123456789abcdef',referrerClass:'google_organic',utm:{},...over});
/** In-memory database: stores inserted analytics rows, enforces event_id uniqueness, answers the few lookups ingestion needs. */
function database(){
  const events:unknown[][]=[];const sessions:unknown[][]=[];const ids=new Set<string>();
  const query=vi.fn(async(sql:string,params:unknown[]=[])=>{
    if(sql.includes('FROM fixtures WHERE public_id=ANY'))return {rows:(params[0] as string[]).map(p=>({id:'f-'+p,public_id:p,competition_id:'c-'+p})),rowCount:1};
    if(sql.includes('FROM competitions WHERE slug=ANY'))return {rows:(params[0] as string[]).map(s=>({id:'c-'+s,slug:s})),rowCount:1};
    if(sql.includes('FROM teams WHERE')||sql.includes('FROM players WHERE'))return {rows:[],rowCount:0};
    if(sql.includes('count(*)::int AS n FROM analytics_events'))return {rows:[{n:events.length}],rowCount:1};
    if(sql.includes('INSERT INTO analytics_events')){const id=String(params[0]);if(ids.has(id))return {rows:[],rowCount:0};ids.add(id);events.push(params);return {rows:[{id:events.length}],rowCount:1};}
    if(sql.includes('INSERT INTO analytics_sessions'))sessions.push(params);
    return {rows:[],rowCount:0};
  });
  const typed=query as unknown as QueryExecutor['query'];
  return {db:{query:typed,transaction:async(w:(tx:{query:QueryExecutor['query']})=>unknown)=>w({query:typed}),close:async()=>{}} as DatabaseClient,query,events,sessions};
}
const post=(body:unknown,headers:Record<string,string>={})=>new Request(origin+'/api/events',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json','user-agent':'Mozilla/5.0 (test browser)',...headers},body:JSON.stringify(body)});
beforeEach(()=>{mocked.user=null;vi.stubEnv('OWNER_QA_SESSION_SECRET','s'.repeat(43));vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash('q'.repeat(43)));});
afterEach(()=>{vi.unstubAllEnvs();});

describe('P4 ingestion boundary (§15, §17, §26, §33)',()=>{
  it('accepts a valid batch once, resolves entities, writes the session and counts a replay as duplicates',async()=>{
    const {db,events,sessions,query}=database();
    const batch={v:1,batch:[event(1,{eventName:'session_started',session:{landingPath:'/br/jogo/x-0123456789abcdef',landingPageType:'match',referrerHost:'www.google.com',visitorKind:'NEW'}}),event(2,{eventName:'match_viewed',fixturePublicId:'0123456789abcdef'})]};
    const first=await ingestClientBatch(post(batch),batch,db);
    expect(first).toMatchObject({status:204,accepted:2,duplicates:0,rejected:0,trafficClass:'HUMAN'});
    expect(events[1][18]).toBe('c-0123456789abcdef');expect(events[1][19]).toBe('f-0123456789abcdef');expect(events[0][7]).toBe('HUMAN');
    expect(sessions[0]).toEqual(expect.arrayContaining(['sess_'+'s'.repeat(20),'NEW','match','google_organic']));
    const replay=await ingestClientBatch(post(batch),batch,db);
    expect(replay).toMatchObject({accepted:0,duplicates:2});
    expect(query.mock.calls.filter(([sql])=>String(sql).includes('INSERT INTO analytics_ingestion_quality')).length).toBe(2);
  });
  it('rejects unknown, malformed, oversized and forged server-only events without failing the good ones',async()=>{
    const {db}=database();
    const batch={v:1,batch:[event(1),{...event(2),eventName:'sign_in_completed'},{...event(3),eventName:'not_an_event'},{...event(4),sessionId:undefined},{...event(5),occurredAt:'2020-01-01T00:00:00Z'}]};
    const summary=await ingestClientBatch(post(batch),batch,db);
    expect(summary).toMatchObject({accepted:1,rejected:4,unknown:1,missingSession:1});
    const big={v:1,batch:Array.from({length:30},(_,i)=>event(i+10))};
    expect((await ingestClientBatch(post(big),big,db)).status).toBe(413);
    expect((await ingestClientBatch(post({v:2,batch:[event(1)]}),{v:2,batch:[event(1)]},db)).status).toBe(400);
  });
  it('refuses cross-site posts and rate-limits a flooding visitor',async()=>{
    const {db,events}=database();
    const batch={v:1,batch:[event(1)]};
    expect((await ingestClientBatch(post(batch,{'sec-fetch-site':'cross-site'}),batch,db)).status).toBe(403);
    expect((await ingestClientBatch(post(batch,{origin:'https://evil.example'}),batch,db)).status).toBe(403);
    for(let i=0;i<241;i++)events.push([]);
    expect((await ingestClientBatch(post(batch),batch,db)).status).toBe(429);
  });
  it('classifies owner, QA and crawler traffic so it never pollutes human reporting',async()=>{
    const owner={cookie:ownerCookie+'='+signOwnerSession({...newOwnerSession(),preview:false})};
    expect(classifyTraffic(new Headers({...owner,'user-agent':'Mozilla/5.0'}))).toBe('OWNER');
    expect(classifyTraffic(new Headers({'user-agent':'Mozilla/5.0','x-livasports-qa':'1'}))).toBe('QA');
    expect(classifyTraffic(new Headers({'user-agent':'Mozilla/5.0 (compatible; Googlebot/2.1)'}))).toBe('BOT');
    expect(classifyTraffic(new Headers({'user-agent':'Mozilla/5.0 (compatible; bingbot/2.0)'}))).toBe('BOT');
    expect(classifyTraffic(new Headers({}))).toBe('BOT');
    expect(classifyTraffic(new Headers({'user-agent':'Mozilla/5.0 (iPhone)'}))).toBe('HUMAN');
    const {db,events}=database();const batch={v:1,batch:[event(1)]};
    await ingestClientBatch(post(batch,{'x-livasports-qa':'1'}),batch,db);expect(events[0][7]).toBe('QA');
    await ingestClientBatch(post({...batch,batch:[event(2)]},{'user-agent':'Googlebot'}),{...batch,batch:[event(2)]},db);expect(events[1][7]).toBe('BOT');
  });
  it('links events to the authenticated user server-side (never from the client) and keeps anonymous history intact (§36)',async()=>{
    const {db,events,query}=database();
    const guest={v:1,batch:[event(1,{eventName:'session_started',session:{landingPath:'/br',landingPageType:'home',visitorKind:'NEW'}}),event(2)]};
    await ingestClientBatch(post(guest),guest,db);
    expect(events[0][6]).toBeNull();expect(events[1][6]).toBeNull();
    mocked.user={id:'11111111-2222-4333-8444-555555555555'};
    const signedIn={v:1,batch:[event(3,{eventName:'my_matches_viewed',pageType:'my_matches',canonicalPath:'/br/meus-jogos',userId:'spoofed-from-client'})]};
    await ingestClientBatch(post(signedIn),signedIn,db);
    expect(events[2][6]).toBe('11111111-2222-4333-8444-555555555555');
    const link=query.mock.calls.filter(([sql])=>String(sql).includes('ON CONFLICT(session_id) DO UPDATE'));
    expect(String(link.at(-1)![0])).toContain('user_id=COALESCE(analytics_sessions.user_id,excluded.user_id)');
    expect(String(link.at(-1)![0])).toContain('WHERE analytics_sessions.anonymous_id=excluded.anonymous_id');
    expect(String(link.at(-1)![0])).toContain("traffic_class=CASE WHEN excluded.traffic_class<>'HUMAN' THEN excluded.traffic_class ELSE analytics_sessions.traffic_class END");
    expect(events[0][6]).toBeNull();// historical guest rows are never rewritten
  });
  it('server events read first-party cookies, take a server timestamp and can never be forged through the client boundary',async()=>{
    const {db,events,query}=database();
    const headers=new Headers({cookie:'ls_aid=anon_'+'a'.repeat(20)+'; ls_sid=sess_'+'s'.repeat(20),'user-agent':'Mozilla/5.0','referer':'https://livasports.com/br/jogo/x-0123456789abcdef'});
    expect(analyticsIds(headers)).toEqual({anonymousId:'anon_'+'a'.repeat(20),sessionId:'sess_'+'s'.repeat(20)});
    expect(await recordServerEvent({name:'outbound_redirect_completed',headers,locale:'br',canonicalPath:'/br/jogo/x-0123456789abcdef',bookmaker:'betsson',placement:'match_odds_table',slipLegCount:2,trafficClass:'HUMAN'},db)).toBe(true);
    expect(events[0][1]).toBe('outbound_redirect_completed');expect(events[0][3]).toBe('sess_'+'s'.repeat(20));expect(events[0][6]).toBe('HUMAN');expect(events[0][18]).toBe('betsson');
    expect(String(query.mock.calls.find(([sql])=>String(sql).includes('INSERT INTO analytics_events'))![0])).toContain("'server',now()");
    expect(await recordServerEvent({name:'sign_in_completed',headers,locale:'en',userId:'11111111-2222-4333-8444-555555555555'},db)).toBe(true);
    expect(String(query.mock.calls.at(-2)![0])).toContain('SET user_id=COALESCE(user_id,$2)');
    const noCookies=new Headers({'user-agent':'Mozilla/5.0'});
    expect(await recordServerEvent({name:'favorite_added',headers:noCookies,locale:'en',userId:'11111111-2222-4333-8444-555555555555'},db)).toBe(true);
    expect(String(events[2][3])).toMatch(/^nosess_/);
  });
});
