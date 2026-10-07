import {describe,expect,it} from 'vitest';
import {buildComparison} from './comparison';
import {summarizeFourSources} from './four-source-health';
import {ACTIVE_BOOKMAKER_IDS} from './registry';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';

const now=Date.parse('2026-09-12T18:00:00Z');
const quote=(overrides:Partial<ReadOddsQuote>={}):ReadOddsQuote=>({
  quoteId:'quote-test',fixtureId:'f',providerFixtureId:'p',bookmaker:'betsson',bookmakerId:'b',bookmakerName:'Betsson',
  market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'2.10',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',
  providerUpdatedAt:'2026-09-12T10:00:00Z',observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),
  lastSuccessfulRefreshAt:new Date(now).toISOString(),providerKickoff:'2026-09-12T19:00:00Z',sourceDomain:'www.betsson.com',geoEligible:true,...overrides,
});
const NAMES:Record<string,string>={betsson:'Betsson',bwin:'bwin'};
const DOMAINS:Record<string,string>={betsson:'www.betsson.com',bwin:'sports.bwin.com'};
/** A full 1X2 book for one operator. */
const mw=(home:string,draw:string,away:string,bookmaker:'betsson'|'bwin'):ReadOddsQuote[]=>[
  quote({quoteId:`${bookmaker}-home`,bookmaker,bookmakerName:NAMES[bookmaker],sourceDomain:DOMAINS[bookmaker],decimalOdds:home}),
  quote({quoteId:`${bookmaker}-draw`,bookmaker,bookmakerName:NAMES[bookmaker],sourceDomain:DOMAINS[bookmaker],outcome:'DRAW',decimalOdds:draw}),
  quote({quoteId:`${bookmaker}-away`,bookmaker,bookmakerName:NAMES[bookmaker],sourceDomain:DOMAINS[bookmaker],outcome:'AWAY',decimalOdds:away}),
];

/**
 * Colombia is the only jurisdiction comparing two books, so Betsson and bwin are the pair under test.
 * Production read paths pin insuranceEnabled false, which is the default here; the proxy-accounting
 * cases opt in explicitly because that is the only way those counters are reachable at all.
 */
const CO=[{id:'betsson',name:'Betsson',priority:10},{id:'bwin',name:'bwin',priority:20}];
const snap=(quotes:ReadOddsQuote[],insuranceEnabled=false):OddsReadSnapshot=>
  ({quotes,kickoff:'2026-09-12T19:00:00Z',fixtureStatus:'SCHEDULED',eligibleBookmakers:CO,insuranceEnabled});
const row=(c:ReturnType<typeof buildComparison>,bk:string)=>c.rows.find(r=>r.bookmaker===bk)!;

describe('bookmaker real-first display and coverage health',()=>{
  it('A: each book displays its own real price when both exist and differ',()=>{
    const c=buildComparison(snap([...mw('2.10','3.40','3.80','betsson'),...mw('1.98','3.55','4.10','bwin')]),'MATCH_WINNER',now);
    expect(row(c,'betsson').cells.map(cell=>[cell.decimalOdds,cell.priceKind])).toEqual([['2.10','REAL'],['3.40','REAL'],['3.80','REAL']]);
    expect(row(c,'bwin').cells.map(cell=>[cell.decimalOdds,cell.priceKind])).toEqual([['1.98','REAL'],['3.55','REAL'],['4.10','REAL']]);
  });

  it('B: a book with no price of its own is left blank, because proxy coverage is off in production',()=>{
    const c=buildComparison(snap(mw('2.10','3.40','3.80','betsson')),'MATCH_WINNER',now);
    expect(row(c,'betsson').cells.every(cell=>cell.priceKind==='REAL')).toBe(true);
    expect(row(c,'bwin').cells.every(cell=>cell.decimalOdds===null&&cell.priceKind===null)).toBe(true);
  });

  it('C: a peer is still left blank when proxying is explicitly enabled',()=>{
    // Enabling insurance cannot buy a cross-primary substitution: showing Betsson's 1.98 in bwin's row
    // would assert that bwin is offering 1.98. Continuity belongs to an attributed reference row.
    const c=buildComparison(snap(mw('1.98','3.55','4.10','betsson'),true),'MATCH_WINNER',now);
    expect(row(c,'betsson').cells.every(cell=>cell.priceKind==='REAL')).toBe(true);
    expect(row(c,'bwin').cells.every(cell=>cell.decimalOdds===null&&cell.priceKind===null&&cell.sourceBookmaker===null)).toBe(true);
  });

  it('D: identical real prices remain a valid coincidence and stay native for both',()=>{
    const c=buildComparison(snap([...mw('2.10','3.40','3.80','betsson'),...mw('2.10','3.40','3.80','bwin')]),'MATCH_WINNER',now);
    expect(row(c,'betsson').cells.every(cell=>cell.priceKind==='REAL')).toBe(true);
    expect(row(c,'bwin').cells.every(cell=>cell.priceKind==='REAL'&&cell.sourceBookmaker==='bwin')).toBe(true);
    expect(row(c,'betsson').cells[0].decimalOdds).toBe(row(c,'bwin').cells[0].decimalOdds);
  });

  it('E: health reports a real-coverage collapse when one book carries everything',()=>{
    const collapsed=Array.from({length:12},()=>snap(mw('2.10','3.40','3.80','betsson')));
    const health=summarizeFourSources(collapsed,now);
    // Sources follow registry order; only Betsson is priced, bwin and Inkabet report zero.
    expect(health.sources.map(s=>s.bookmaker)).toEqual([...ACTIVE_BOOKMAKER_IDS]);
    expect(health.sources.find(s=>s.bookmaker==='betsson')!.currentFixtures).toBe(12);
    expect(health.sources.find(s=>s.bookmaker==='bwin')!.currentFixtures).toBe(0);
    // One visible book is real on every fixture, so this is the "one" bucket, never "none".
    expect(health.visibleReal).toMatchObject({three:0,two:0,one:12,none:0});
    // With proxying off nothing is borrowed, so the degradation signal is uneven real coverage.
    expect(health.proxyPct).toBe(0);
    expect(health.degraded).toBe(true);
  });

  it('E2: a jurisdiction where both books price every fixture is not degraded',()=>{
    const healthy=Array.from({length:12},()=>snap([...mw('2.10','3.40','3.80','betsson'),...mw('1.98','3.55','4.10','bwin')]));
    const health=summarizeFourSources(healthy,now);
    expect(health.visibleReal).toMatchObject({two:12,none:0});
    expect(health.proxyPct).toBe(0);
    expect(health.degraded).toBe(false);
  });

  it('E3: no coverage is ever borrowed, so every insurance counter stays at zero',()=>{
    const unpriced=Array.from({length:4},()=>snap(mw('2.10','3.40','3.80','betsson'),true));
    const health=summarizeFourSources(unpriced,now);
    const bwin=health.targets.find(t=>t.bookmaker==='bwin')!;
    expect(bwin.proxy).toBe(0);
    expect(bwin.unavailable).toBeGreaterThan(0);
    // Betano is retired and cross-primary substitution is gone, so neither counter can ever move.
    expect(health.targets.every(t=>t.BETANO_INSURANCE_USED===0)).toBe(true);
    expect(health.targets.every(t=>t.ALTERNATE_INSURANCE_USED===0)).toBe(true);
    expect(health.proxyPct).toBe(0);
  });

  it('F: an unavailable slot becomes that book own quote on the next successful refresh',()=>{
    // The automatic-recovery contract: nothing is fabricated while a book is unpriced, and when the
    // scheduler later supplies its real quote it simply appears. No deploy, no manual action.
    const missing=snap(mw('2.10','3.40','3.80','betsson'),true);
    const before=buildComparison(missing,'MATCH_WINNER',now);
    expect(row(before,'bwin').cells[0]).toMatchObject({decimalOdds:null,priceKind:null,sourceBookmaker:null});
    const restored=buildComparison(snap([...missing.quotes,...mw('1.98','3.55','4.10','bwin')],true),'MATCH_WINNER',now);
    expect(row(restored,'bwin').cells[0]).toMatchObject({decimalOdds:'1.98',priceKind:'REAL',sourceBookmaker:'bwin'});
    expect(row(restored,'betsson').cells[0]).toMatchObject({decimalOdds:'2.10',priceKind:'REAL',sourceBookmaker:'betsson'});
  });
});
