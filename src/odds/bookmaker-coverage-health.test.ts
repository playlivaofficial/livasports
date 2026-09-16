import {describe,expect,it} from 'vitest';
import {buildComparison} from './comparison';
import {bookmakerCoverageHealth,coverageFromComparisons} from './bookmaker-coverage-health';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';

const now=Date.parse('2026-09-12T18:00:00Z');
const quote=(overrides:Partial<ReadOddsQuote>={}):ReadOddsQuote=>({
  quoteId:'quote-test',fixtureId:'f',providerFixtureId:'p',bookmaker:'betano.bet.br',bookmakerId:'b',bookmakerName:'Betano BR',
  market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'2.10',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',
  providerUpdatedAt:'2026-09-12T10:00:00Z',observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),
  lastSuccessfulRefreshAt:new Date(now).toISOString(),providerKickoff:'2026-09-12T19:00:00Z',sourceDomain:'www.betano.bet.br',geoEligible:true,...overrides,
});
const mw=(home:string,draw:string,away:string,bookmaker:'betano.bet.br'|'betsson',name:string):ReadOddsQuote[]=>[
  quote({quoteId:`${bookmaker}-home`,bookmaker,bookmakerName:name,decimalOdds:home}),
  quote({quoteId:`${bookmaker}-draw`,bookmaker,bookmakerName:name,outcome:'DRAW',decimalOdds:draw}),
  quote({quoteId:`${bookmaker}-away`,bookmaker,bookmakerName:name,outcome:'AWAY',decimalOdds:away}),
];
const snap=(quotes:ReadOddsQuote[]):OddsReadSnapshot=>({quotes,kickoff:'2026-09-12T19:00:00Z',fixtureStatus:'SCHEDULED'});

describe('bookmaker real-first display and coverage health',()=>{
  it('A: each book displays its own real price when both exist and differ',()=>{
    const c=buildComparison(snap([...mw('2.10','3.40','3.80','betano.bet.br','Betano BR'),...mw('1.98','3.55','4.10','betsson','Betsson')]),'MATCH_WINNER',now);
    expect(c.rows[0].cells.map(cell=>[cell.decimalOdds,cell.priceKind])).toEqual([['2.10','REAL'],['3.40','REAL'],['3.80','REAL']]);
    expect(c.rows[1].cells.map(cell=>[cell.decimalOdds,cell.priceKind])).toEqual([['1.98','REAL'],['3.55','REAL'],['4.10','REAL']]);
    expect(bookmakerCoverageHealth(coverageFromComparisons([c])).abnormal).toBe(false);
  });
  it('B: Betsson may use the existing proxy fallback when only Betano is real',()=>{
    const c=buildComparison(snap(mw('2.10','3.40','3.80','betano.bet.br','Betano BR')),'MATCH_WINNER',now);
    expect(c.rows[0].cells.every(cell=>cell.priceKind==='REAL')).toBe(true);
    expect(c.rows[1].cells.every(cell=>cell.priceKind==='PROXY'&&cell.sourceBookmaker==='betano.bet.br')).toBe(true);
  });
  it('C: Betano may use the existing proxy fallback when only Betsson is real',()=>{
    const c=buildComparison(snap(mw('1.98','3.55','4.10','betsson','Betsson')),'MATCH_WINNER',now);
    expect(c.rows[1].cells.every(cell=>cell.priceKind==='REAL')).toBe(true);
    expect(c.rows[0].cells.every(cell=>cell.priceKind==='PROXY'&&cell.sourceBookmaker==='betsson')).toBe(true);
  });
  it('D: identical real prices remain valid coincidence',()=>{
    const c=buildComparison(snap([...mw('2.10','3.40','3.80','betano.bet.br','Betano BR'),...mw('2.10','3.40','3.80','betsson','Betsson')]),'MATCH_WINNER',now);
    expect(c.rows.every(row=>row.cells.every(cell=>cell.priceKind==='REAL'))).toBe(true);
    expect(c.rows[0].cells[0].decimalOdds).toBe(c.rows[1].cells[0].decimalOdds);
    expect(bookmakerCoverageHealth(coverageFromComparisons([c])).reasons).not.toContain('IDENTICAL_DISPLAY_FROM_PROXY');
  });
  it('E: health diagnostic detects a bookmaker real-coverage collapse that makes proxy dominant',()=>{
    const collapsed=Array.from({length:12},()=>buildComparison(snap(mw('2.10','3.40','3.80','betano.bet.br','Betano BR')),'MATCH_WINNER',now));
    const health=bookmakerCoverageHealth(coverageFromComparisons(collapsed));
    expect(health.realQuoteCoverageByBookmaker).toEqual({betano:12,betsson:0});
    expect(health.proxyUsagePercentage).toBeGreaterThan(80);
    expect(health.identicalProxyPairPercentage).toBeGreaterThan(80);
    expect(health.abnormal).toBe(true);
    expect(health.reasons).toEqual(expect.arrayContaining(['BETSSON_REAL_COVERAGE_COLLAPSE','PROXY_USAGE_DOMINANT','IDENTICAL_DISPLAY_FROM_PROXY']));
  });
  it('F: a restored real target quote immediately beats the prior proxy',()=>{
    const missing=snap(mw('2.10','3.40','3.80','betano.bet.br','Betano BR'));
    const proxied=buildComparison(missing,'MATCH_WINNER',now);
    expect(proxied.rows[1].cells[0]).toMatchObject({decimalOdds:'2.10',priceKind:'PROXY'});
    const restored=buildComparison(snap([...missing.quotes,...mw('1.98','3.55','4.10','betsson','Betsson')]),'MATCH_WINNER',now);
    expect(restored.rows[1].cells[0]).toMatchObject({decimalOdds:'1.98',priceKind:'REAL',sourceBookmaker:'betsson'});
    expect(restored.rows[0].cells[0]).toMatchObject({decimalOdds:'2.10',priceKind:'REAL'});
  });
});
