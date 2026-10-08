import {describe,it,expect,vi,afterEach} from 'vitest';
import type {DatabaseClient} from '@/database/client';
import {M5OddsPapiAdapter} from './M5OddsPapiAdapter';
import {normalizeM5Snapshot} from './m5-normalizer';

const observedAt='2026-10-04T12:00:00Z';
const offer=(domain:string,price=2.25)=>({bookmakerIsActive:true,suspended:false,fixturePath:`https://${domain}/fixture`,markets:{'101':{
  marketActive:true,outcomes:{'101':{players:{'0':{active:true,playerName:null,price,changedAt:observedAt,bookmakerChangedAt:null}}}},
}}});
const fixture={fixtureId:'real-shape-only',sportId:10,tournamentId:325,startTime:'2026-10-04T19:00:00Z',statusId:0,participant1Id:1,participant2Id:2,
  participant1Name:'Home',participant2Name:'Away'};
const feeds=[{geo:'CO' as const,operatorId:'betsson',providerBookmakerId:'betsson.co',sourceDomains:['betsson.co']},
  {geo:'PE' as const,operatorId:'betsson',providerBookmakerId:'betsson.pe',sourceDomains:['betsson.pe']}];
const database=():DatabaseClient=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('max(started_at)')?[{at:null}]:sql.includes('FROM odds_budget_baselines')?[{hard_limit:5000,consumed:50}]:[{id:'job'}],rowCount:1}));
  return {query:query as unknown as DatabaseClient['query'],transaction:async work=>work({query:query as unknown as DatabaseClient['query']}),close:async()=>{}};
};
afterEach(()=>vi.restoreAllMocks());

describe('verified country feed transport and normalization',()=>{
  it('preserves the audited exact 1xBet feed policy through the Peru adapter mapping',async()=>{
    const book=offer('1xbet.com');book.bookmakerIsActive=false;
    vi.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json([{...fixture,startTime:new Date(Date.now()+86400000).toISOString(),bookmakerOdds:{'1xbet':book}}]));
    const adapter=new M5OddsPapiAdapter(database(),'test-only','test-job',2,false,Date.now()+140000,undefined,0);
    adapter.setOperatorFeeds([{geo:'PE',operatorId:'1xbet',providerBookmakerId:'1xbet',sourceDomains:['1xbet.com']}]);
    expect((await adapter.snapshot('1xbet',['325'])).quotes[0]).toMatchObject({bookmaker:'1xbet',status:'ACTIVE'});
  });
  it('keeps inactive 1xBet markets/prices, invalid timestamps and started fixtures unavailable',()=>{
    const book=offer('1xbet.com');book.bookmakerIsActive=false;book.suspended=true;
    const read=(raw=fixture)=>normalizeM5Snapshot([{...raw,bookmakerOdds:{'1xbet':book}}],'1xbet',observedAt,['325'],undefined,[],'1xbet').quotes[0];
    expect(read().status).toBe('ACTIVE');
    book.markets['101'].marketActive=false;expect(read().status).toBe('SUSPENDED');book.markets['101'].marketActive=true;
    book.markets['101'].outcomes['101'].players['0'].active=false;expect(read().status).toBe('SUSPENDED');
    book.markets['101'].outcomes['101'].players['0'].active=true;
    book.markets['101'].outcomes['101'].players['0'].changedAt='';expect(read().status).toBe('STALE');
    book.markets['101'].outcomes['101'].players['0'].changedAt=observedAt;
    expect(read({...fixture,statusId:1}).status).toBe('CLOSED');
  });
  it('requests only an exact verified feed ID and preserves its jurisdiction separately from canonical operator identity',async()=>{
    const request=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json([{...fixture,bookmakerOdds:{'betsson.co':offer('betsson.co'),'betsson.pe':offer('betsson.pe',3.75)}}]));
    const adapter=new M5OddsPapiAdapter(database(),'test-only','test-job',2,false,Date.now()+140000,undefined,0);
    adapter.setOperatorFeeds(feeds);
    const co=await adapter.snapshot('betsson.co',['325']);
    const pe=await adapter.snapshot('betsson.pe',['325']);
    expect(co).toMatchObject({bookmaker:'betsson',providerBookmakerId:'betsson.co',geoFeeds:[feeds[0]]});
    expect(pe).toMatchObject({bookmaker:'betsson',providerBookmakerId:'betsson.pe',geoFeeds:[feeds[1]]});
    expect(co.quotes[0]).toMatchObject({bookmaker:'betsson',sourceDomain:'betsson.co',decimalOdds:'2.25'});
    expect(pe.quotes[0]).toMatchObject({bookmaker:'betsson',sourceDomain:'betsson.pe',decimalOdds:'3.75'});
    expect(request.mock.calls.map(([url])=>new URL(String(url)).searchParams.get('bookmaker'))).toEqual(['betsson.co','betsson.pe']);
    expect(adapter.requestCount()).toBe(2);
  });
  it('denies generic, BR, unknown and empty verified feed requests before any budget reservation or network call',async()=>{
    const request=vi.spyOn(globalThis,'fetch');
    const adapter=new M5OddsPapiAdapter(database(),'test-only','test-job');adapter.setOperatorFeeds(feeds);
    for(const id of ['betsson','betano.bet.br','betsson.mx'])await expect(adapter.snapshot(id,['325'])).rejects.toThrow('OUT_OF_SCOPE_ODDS_REQUEST');
    adapter.setOperatorFeeds([]);await expect(adapter.snapshot('betsson.co',['325'])).rejects.toThrow('OUT_OF_SCOPE_ODDS_REQUEST');
    expect(adapter.requestCount()).toBe(0);expect(request).not.toHaveBeenCalled();
  });
  it('does not borrow a generic or other-country payload when the requested feed is absent',()=>{
    const raw={...fixture,bookmakerOdds:{betsson:offer('betsson.com'),'betsson.pe':offer('betsson.pe')}};
    expect(normalizeM5Snapshot([raw],'betsson.co',observedAt,['325'],undefined,[],'betsson').quotes).toEqual([]);
  });
  it('does not inherit the legacy BR Betsson inactive flag relaxation',()=>{
    const book=offer('betsson.co');
    const read=()=>normalizeM5Snapshot([{...fixture,bookmakerOdds:{'betsson.co':book}}],'betsson.co',observedAt,['325'],undefined,[],'betsson').quotes[0];
    expect(read().status).toBe('ACTIVE');book.suspended=true;expect(read().status).toBe('SUSPENDED');book.suspended=false;
    book.bookmakerIsActive=false;expect(read().status).toBe('SUSPENDED');book.bookmakerIsActive=true;
    book.markets['101'].outcomes['101'].players['0'].active=false;expect(read().status).toBe('SUSPENDED');
  });
});
