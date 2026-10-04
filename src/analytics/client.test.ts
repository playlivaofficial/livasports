import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

/** Minimal browser fakes (no jsdom): storage, location, referrer, cookies, fetch. */
function browser(url:string,referrer=''){
  const store=new Map<string,string>();const session=new Map<string,string>();
  const u=new URL(url);
  const g=globalThis as Record<string,unknown>;
  g.window=g;g.location={pathname:u.pathname,search:u.search,hostname:u.hostname,protocol:u.protocol};
  g.document={referrer,cookie:'',visibilityState:'visible',addEventListener:()=>undefined};
  g.localStorage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);},removeItem:(k:string)=>{store.delete(k);}};
  g.sessionStorage={getItem:(k:string)=>session.get(k)??null,setItem:(k:string,v:string)=>{session.set(k,v);},removeItem:(k:string)=>{session.delete(k);}};
  Object.defineProperty(globalThis,'navigator',{value:{sendBeacon:()=>false},configurable:true});g.addEventListener=()=>undefined;
  const sent:Array<{body:{v:number;batch:Array<Record<string,unknown>>}}>=[];
  g.fetch=vi.fn(async(_url:string,init:{body:string})=>{sent.push({body:JSON.parse(init.body)});return new Response(null,{status:204});});
  return {store,session,sent,navigate:(next:string)=>{const nu=new URL(next);(g.location as Record<string,string>).pathname=nu.pathname;(g.location as Record<string,string>).search=nu.search;}};
}
const events=(sent:Array<{body:{batch:Array<Record<string,unknown>>}}>)=>sent.flatMap(s=>s.body.batch);
let mod:typeof import('./client');
beforeEach(async()=>{vi.useFakeTimers();vi.resetModules();mod=await import('./client');});
afterEach(()=>{vi.useRealTimers();for(const k of ['window','location','document','localStorage','sessionStorage','navigator','addEventListener'])delete (globalThis as Record<string,unknown>)[k];});

describe('P4 client: identity, sessions, attribution, dedupe and the slip funnel (§5, §6, §7, §17, §34)',()=>{
  it('links a comparison to canonical fixtures without emitting one duplicate event per leg',async()=>{
    const b=browser('https://livasports.com/co');
    const linked=Array.from({length:10},(_,i)=>String(i).padStart(16,'0'));
    mod.bridgeLegacyEvent({eventName:'slip_comparison_view',selectionCount:10,fixturePublicIds:linked,selectionIdentity:'slip-a'});
    mod.bridgeLegacyEvent({eventName:'slip_comparison_view',selectionCount:10,fixturePublicIds:linked,selectionIdentity:'slip-a'});
    await vi.advanceTimersByTimeAsync(2000);
    const comparisons=events(b.sent).filter(e=>e.eventName==='bookmaker_comparison_viewed');
    expect(comparisons).toHaveLength(1);expect(Object.values(comparisons[0].props as Record<string,string>)).toEqual(linked);
    mod.bridgeLegacyEvent({eventName:'slip_comparison_view',selectionCount:10,fixturePublicIds:linked,selectionIdentity:'slip-b'});
    await vi.advanceTimersByTimeAsync(2000);expect(events(b.sent).filter(e=>e.eventName==='bookmaker_comparison_viewed')).toHaveLength(2);
  });
  it('starts one session per 30-minute window, freezes first-touch attribution across internal navigation and sends batches once',async()=>{
    const b=browser('https://livasports.com/br/jogo/bayern-x-union-b383489fbdeb4ef1?utm_source=news&utm_medium=email&utm_campaign=opening','https://www.google.com/');
    mod.trackNavigation('/br/jogo/bayern-x-union-b383489fbdeb4ef1','?utm_source=news&utm_medium=email&utm_campaign=opening');
    await vi.advanceTimersByTimeAsync(2000);
    let all=events(b.sent);
    expect(all.map(e=>e.eventName)).toEqual(['session_started','landing_viewed','page_viewed','match_viewed']);
    expect(all[0].session).toMatchObject({landingPath:'/br/jogo/bayern-x-union-b383489fbdeb4ef1?utm_source=news&utm_medium=email&utm_campaign=opening',landingPageType:'match',referrerHost:'www.google.com',visitorKind:'NEW'});
    expect(all[3]).toMatchObject({fixturePublicId:'b383489fbdeb4ef1',referrerClass:'google_organic',utm:{source:'news',medium:'email',campaign:'opening'},locale:'br',pageType:'match'});
    const sessionId=String(all[0].sessionId);expect(sessionId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);expect(all.every(e=>e.sessionId===sessionId&&e.anonymousId===all[0].anonymousId)).toBe(true);
    // internal navigation: same session, attribution unchanged, no new session_started
    b.navigate('https://livasports.com/br/futebol?competition=bundesliga');(globalThis as Record<string,unknown>).document=Object.assign((globalThis as unknown as {document:Record<string,unknown>}).document,{referrer:'https://livasports.com/br/jogo/x'});
    mod.trackNavigation('/br/futebol','?competition=bundesliga');await vi.advanceTimersByTimeAsync(2000);
    all=events(b.sent);
    expect(all.filter(e=>e.eventName==='session_started')).toHaveLength(1);
    expect(all.at(-1)).toMatchObject({eventName:'competition_viewed',competitionSlug:'bundesliga',sessionId,referrerClass:'google_organic',utm:{campaign:'opening'}});
    // React remount / reload of the same page: deduplicated inside the session
    mod.trackNavigation('/br/futebol','?competition=bundesliga');await vi.advanceTimersByTimeAsync(2000);
    expect(events(b.sent).filter(e=>e.eventName==='competition_viewed')).toHaveLength(1);
    // 31 minutes idle → new session, returning visitor, direct (no referrer), previous ids not reused
    vi.setSystemTime(Date.now()+31*60000);(globalThis as unknown as {document:Record<string,unknown>}).document.referrer='';
    b.navigate('https://livasports.com/en');mod.trackNavigation('/en','');await vi.advanceTimersByTimeAsync(2000);
    const second=events(b.sent).filter(e=>e.eventName==='returning_session_started');
    expect(second).toHaveLength(1);expect(second[0].sessionId).not.toBe(sessionId);expect(second[0].anonymousId).toBe(all[0].anonymousId);expect(second[0].session).toMatchObject({visitorKind:'RETURNING',landingPageType:'home'});
    expect(second[0].referrerClass).toBe('direct');
    expect(b.store.get('ls_aid')).toBe(all[0].anonymousId);
  });
  it('maps the legacy slip/odds/comparison/affiliate emitters onto the funnel exactly once per logical action',async()=>{
    const b=browser('https://livasports.com/br/jogo/bayern-x-union-b383489fbdeb4ef1');
    mod.trackNavigation('/br/jogo/bayern-x-union-b383489fbdeb4ef1','');
    const sel={fixturePublicId:'b383489fbdeb4ef1',market:'MATCH_WINNER',outcome:'HOME'};
    mod.bridgeLegacyEvent({eventName:'odds_module_view',fixturePublicId:'b383489fbdeb4ef1',placement:'match-odds'});
    mod.bridgeLegacyEvent({eventName:'odds_module_view',fixturePublicId:'b383489fbdeb4ef1',placement:'match-odds'});// remount
    mod.bridgeLegacyEvent({eventName:'slip_selection_add',selection:sel,bookmaker:'betsson',legCount:1,priceKind:'REAL'});
    mod.bridgeLegacyEvent({eventName:'slip_selection_add',selection:{...sel,fixturePublicId:'0123456789abcdef'},bookmaker:'betano.bet.br',legCount:2,priceKind:'PROXY'});
    mod.bridgeLegacyEvent({eventName:'slip_open',legCount:2});
    mod.bridgeLegacyEvent({eventName:'slip_comparison_view',selectionCount:2});
    mod.bridgeLegacyEvent({eventName:'slip_bookmaker_complete',bookmaker:'betsson',selectionCount:2,comparisonState:'REAL_COMPLETE'});
    mod.bridgeLegacyEvent({eventName:'slip_bookmaker_partial',bookmaker:'betano.bet.br',selectionCount:2,comparisonState:'ESTIMATED_COMPLETE'});
    mod.bridgeLegacyEvent({eventName:'slip_bookmaker_click',bookmaker:'betsson',selectionCount:2});
    mod.bridgeLegacyEvent({eventName:'slip_bookmaker_click',bookmaker:'betsson',selectionCount:2});// double click
    await vi.advanceTimersByTimeAsync(4000);
    const all=events(b.sent);const names=all.map(e=>e.eventName);
    expect(names.filter(n=>n==='odds_visible')).toHaveLength(1);
    expect(names.filter(n=>n==='odds_selected')).toHaveLength(2);expect(names.filter(n=>n==='slip_created')).toHaveLength(1);expect(names.filter(n=>n==='slip_leg_added')).toHaveLength(2);
    expect(names.filter(n=>n==='slip_opened')).toHaveLength(1);expect(names.filter(n=>n==='bookmaker_comparison_viewed')).toHaveLength(3);
    expect(names.filter(n=>n==='affiliate_cta_clicked')).toHaveLength(1);
    expect(all.find(e=>e.eventName==='odds_selected')).toMatchObject({fixturePublicId:'b383489fbdeb4ef1',bookmaker:'betsson',market:'MATCH_WINNER',outcome:'HOME',priceKind:'REAL',slipLegCount:1});
    expect(all.find(e=>e.eventName==='bookmaker_comparison_viewed'&&e.bookmaker==='betsson')).toMatchObject({comparisonState:'REAL_COMPLETE',slipLegCount:2});
    expect(all.find(e=>e.eventName==='affiliate_cta_clicked')).toMatchObject({bookmaker:'betsson',placement:'slip-comparison',slipLegCount:2});
    expect(new Set(all.map(e=>e.eventId)).size).toBe(all.length);expect(new Set(all.map(e=>e.sessionId)).size).toBe(1);
    expect(b.sent.every(s=>s.body.v===1&&s.body.batch.length<=25&&!('qa' in s.body))).toBe(true);
    // a controlled QA session self-marks every batch
    b.store.set('ls_qa','1');mod.track('search_used',{},{dedupeKey:'qa-mark'});await vi.advanceTimersByTimeAsync(2000);
    expect((b.sent.at(-1)!.body as {qa?:boolean}).qa).toBe(true);
  });
  it('never throws into product code when storage or fetch are unavailable',async()=>{
    const b=browser('https://livasports.com/en');
    (globalThis as Record<string,unknown>).localStorage={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
    (globalThis as Record<string,unknown>).fetch=()=>{throw new Error('offline');};
    expect(()=>mod.trackNavigation('/en','')).not.toThrow();expect(()=>mod.track('search_used')).not.toThrow();
    await vi.advanceTimersByTimeAsync(2000);expect(b.sent).toHaveLength(0);
  });
});
