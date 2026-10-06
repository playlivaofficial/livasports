import {describe,it,expect} from 'vitest';
import {ACTIVE_BOOKMAKER_IDS,VISIBLE_BOOKMAKERS,bookmakerConfig,isRetiredBookmaker} from './registry';
import {normalizeM5Snapshot} from '@/providers/oddspapi/m5-normalizer';

const at='2026-10-06T16:00:00Z';
const priceAt=(changedAt:string)=>({active:true,playerName:null,price:3.42,changedAt,bookmakerChangedAt:null,mainLine:true});
// The exact shape the live Peru Liga 1 response returns: bookmakerIsActive false, prices active.
const fixtureWith=(changedAt:string)=>({fixtureId:'external',sportId:10,tournamentId:406,startTime:'2026-10-07T01:00:00Z',
  statusId:0,participant1Id:1,participant2Id:2,participant1Name:'Home',participant2Name:'Away',
  bookmakerOdds:{'1xbet':{bookmakerIsActive:false,suspended:false,fixturePath:'https://1xbet.com/line/375079266',
    markets:{'101':{marketActive:true,outcomes:{'101':{players:{'0':priceAt(changedAt)}}}}}}}});
// Peru Liga 1 as the live catalog resolves it, passed explicitly since it is not in the static set.
const PE_CATALOG=[{id:'406',slug:'liga-1',category:'peru',canonical:'peru-liga-1'}];
const norm=(f:unknown)=>normalizeM5Snapshot([f],'1xbet',at,['406'],PE_CATALOG);
const read=(changedAt:string)=>norm(fixtureWith(changedAt)).quotes[0];

describe('Peru 1xBet activation', () => {
  it('requests exactly the four entitled feeds and no retired Brazilian one', () => {
    expect([...ACTIVE_BOOKMAKER_IDS].sort()).toEqual(['1xbet','betsson','bwin','inkabet']);
    for (const retired of ['sportingbet.bet.br','betano.bet.br','betboo.bet.br']) {
      expect(isRetiredBookmaker(retired)).toBe(true);
      expect(ACTIVE_BOOKMAKER_IDS).not.toContain(retired);
    }
  });
  it('scopes each public book to its own GEO so nothing leaks across borders', () => {
    const geo = (id: string) => [...(bookmakerConfig(id)?.countries ?? [])];
    expect(geo('1xbet')).toEqual(['PE']);
    expect(geo('inkabet')).toEqual(['PE']);
    expect(geo('bwin')).toEqual(['CO']);
    expect(geo('betsson')).toEqual(['BR','MX','CO']);
    // The three forbidden pairings, stated directly.
    expect(geo('betsson')).not.toContain('PE');
    expect(geo('1xbet')).not.toContain('MX');
    expect(geo('1xbet')).not.toContain('CO');
  });
  it('keeps 1xBet publicly visible and ordered after Inkabet in Peru', () => {
    const pe = VISIBLE_BOOKMAKERS.filter(b => (b.countries as readonly string[]).includes('PE')).map(b => b.canonicalId);
    expect(pe).toEqual(['inkabet','1xbet']);
  });
  it('accepts the unreliable bookmaker-level flag, because the prices themselves are listed', () => {
    // Under STRICT this same payload would be SUSPENDED and never shown.
    expect(bookmakerConfig('1xbet')?.providerFlagPolicy).toBe('VERIFIED_LISTED_MARKET');
    expect(read(at)).toMatchObject({bookmaker:'1xbet',status:'ACTIVE',decimalOdds:'3.42',sourceDomain:'1xbet.com'});
  });
  it('still refuses a stale price — the exception relaxes flags, never freshness', () => {
    // A timestamp in the future of the observation is the normalizer's staleness signal.
    expect(read('2026-10-06T16:30:00Z').status).toBe('STALE');
  });
  it('still refuses a market the provider marks closed', () => {
    const f = fixtureWith(at);
    f.bookmakerOdds['1xbet'].markets['101'].marketActive = false;
    expect(norm(f).quotes[0].status).toBe('SUSPENDED');
  });
  it('relaxes only the bookmaker-level flags, which is exactly what the exception is for', () => {
    // Betsson reports suspended=true while still listing prices; 1xBet reports bookmakerIsActive=false.
    // Both are book-level metadata, so neither suspends a listed market under this policy.
    const f = fixtureWith(at);
    f.bookmakerOdds['1xbet'].suspended = true;
    expect(norm(f).quotes[0].status).toBe('ACTIVE');
  });
  it('does not grant the exception to books that never asked for it', () => {
    for (const strict of ['bwin','inkabet']) expect(bookmakerConfig(strict)?.providerFlagPolicy).toBe('STRICT');
  });
});
