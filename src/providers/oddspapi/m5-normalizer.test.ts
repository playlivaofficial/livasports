import {describe,it,expect} from 'vitest';
import {inspectM5OfferFlags,normalizeM5Snapshot} from './m5-normalizer';
const at='2026-09-12T10:00:00Z';
const price={active:true,playerName:null,price:2.12345678,changedAt:at,bookmakerChangedAt:null,mainLine:false};
const market={marketActive:true,outcomes:{'101':{players:{'0':price}}}};
const fixture={fixtureId:'external',sportId:10,tournamentId:325,startTime:'2026-09-12T19:00:00Z',statusId:0,participant1Id:1,participant2Id:2,
  participant1Name:'Home',participant2Name:'Away',bookmakerOdds:{'betano.bet.br':{bookmakerIsActive:true,suspended:false,fixturePath:'https://www.betano.bet.br/fixture',markets:{'101':market}}}};
const normalize=(data:unknown)=>normalizeM5Snapshot(data,'betano.bet.br',at,['325']);
describe('strict audited OddsPapi markets',()=>{
  it.each(['sportingbet.bet.br','betboo.bet.br'])('validates independent %s flags without copying the legacy Betsson exception',bookmaker=>{
    const book={bookmakerIsActive:true,suspended:false,fixturePath:`https://sports.${bookmaker}/fixture`,markets:{'101':structuredClone(market)}};
    const f={...fixture,bookmakerOdds:{[bookmaker]:book}};
    const read=()=>normalizeM5Snapshot([f],bookmaker,at,['325']).quotes[0];
    expect(read()).toMatchObject({bookmaker,status:'ACTIVE',decimalOdds:'2.12345678'});
    book.suspended=true;expect(read().status).toBe('SUSPENDED');book.suspended=false;
    book.bookmakerIsActive=false;expect(read().status).toBe('SUSPENDED');book.bookmakerIsActive=true;
    book.markets['101'].outcomes['101'].players['0'].active=false;expect(read().status).toBe('SUSPENDED');
  });
  it('normalizes canonical IDs/scope and preserves decimals independently of provider naming',()=>{
    const q=normalize([fixture]).quotes[0];expect(q.market).toBe('MATCH_WINNER');expect(q.outcome).toBe('HOME');expect(q.decimalOdds).toBe('2.12345678');expect(q.scope).toBe('FULL_TIME_REGULATION');expect(q.sourceDomain).toBe('www.betano.bet.br');
  });
  it('ignores deceptive names, double chance, 2up, halves, corners and unknown IDs',()=>{
    const f=structuredClone(fixture);Object.assign(f.bookmakerOdds['betano.bet.br'].markets,{'10761':market,'10775':market,'999':market});
    expect(normalize([f]).quotes).toHaveLength(1);expect(normalize([f]).rejected.OUT_OF_SCOPE_MARKET).toBe(3);
  });
  it('accepts only audited 2.5 goals/BTTS outcomes and does not require mainLine',()=>{
    const f=structuredClone(fixture);Object.assign(f.bookmakerOdds['betano.bet.br'].markets,{'1010':{marketActive:true,outcomes:{'1010':{players:{'0':price}}}},'104':{marketActive:true,outcomes:{'104':{players:{'0':price}}}}});
    expect(normalize([f]).quotes.map(q=>[q.market,q.outcome,q.line])).toEqual([['MATCH_WINNER','HOME',null],['BTTS','YES',null],['TOTAL_GOALS','OVER',2.5]]);
  });
  it.each([0,1,-2,NaN,Infinity,1001])('rejects invalid decimal %s',value=>{
    const f=structuredClone(fixture);f.bookmakerOdds['betano.bet.br'].markets['101'].outcomes['101'].players['0'].price=value;
    expect(normalize([f]).quotes).toHaveLength(0);
  });
  it('does not invent missing timestamps or treat a collected-inactive market as executable',()=>{
    const f=structuredClone(fixture);f.bookmakerOdds['betano.bet.br'].markets['101'].outcomes['101'].players['0'].changedAt='';
    expect(normalize([f]).quotes[0].providerUpdatedAt).toBe(null);expect(normalize([f]).quotes[0].status).toBe('STALE');
    const deadMarket=structuredClone(fixture);deadMarket.bookmakerOdds['betano.bet.br'].markets['101'].marketActive=false;
    expect(normalize([deadMarket]).quotes[0].status).toBe('SUSPENDED');
  });
  it('counts OddsPapi offer flags without dropping listed decimals',()=>{
    const f={...structuredClone(fixture),bookmakerOdds:{betsson:{bookmakerIsActive:false,suspended:true,markets:{'101':{marketActive:true,outcomes:{'101':{players:{'0':{...price,active:false}}}}}}}}};
    expect(inspectM5OfferFlags([f],'betsson')).toMatchObject({fixtures:1,withBook:1,listedQuotes:1,bookmakerIsActiveFalse:1,suspendedTrue:1,
      marketActiveTrue:1,priceActiveFalse:1,listedWhileBookmakerInactive:1,listedIndependentOfBookActive:1});
  });
  it('keeps listed Betsson prices current when OddsPapi marks the book inactive/suspended but still collects an active market',()=>{
    const f={...structuredClone(fixture),bookmakerOdds:{betsson:{bookmakerIsActive:false,suspended:true,fixturePath:'https://www.betsson.com/fixture',markets:{'101':{marketActive:true,outcomes:{'101':{players:{'0':{...price,active:false}}}}}}}}};
    const snapshot=normalizeM5Snapshot([f],'betsson',at,['325']);
    expect(snapshot.quotes[0]).toMatchObject({bookmaker:'betsson',decimalOdds:'2.12345678',status:'ACTIVE'});
  });
  it('cannot ingest basketball/live as active pregame',()=>{
    expect(normalize([{...fixture,sportId:11}]).quotes).toHaveLength(0);
    expect(normalize([{...fixture,statusId:1}]).quotes[0].status).toBe('CLOSED');
  });
  it('rejects conflicting duplicate event IDs and tournament metadata',()=>{
    expect(normalize([fixture,{...fixture,participant2Id:3}]).quotes).toHaveLength(0);
    expect(normalize([{...fixture,categorySlug:'italy'}]).quotes).toHaveLength(0);
  });
});
