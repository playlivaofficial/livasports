import {describe,expect,it} from 'vitest';
import {publicBookmakerCopy,publicBookmakerSummary} from './public-bookmakers';
import type {OddsOutcome,OddsReadSnapshot,ReadOddsQuote} from '@/odds/types';

const now=Date.parse('2026-09-22T12:00:00Z'),kickoff='2026-09-22T18:00:00Z';
function market(bookmaker:string,name:string,prices:[string,string,string]):ReadOddsQuote[]{return (['HOME','DRAW','AWAY'] as OddsOutcome[]).map((outcome,index)=>({
  provider:'ODDSPAPI',quoteId:`${bookmaker}-${outcome}`,fixtureId:'f',providerFixtureId:'p',bookmaker,bookmakerId:bookmaker,bookmakerName:name,market:'MATCH_WINNER',outcome,line:null,
  decimalOdds:prices[index],status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:'2026-09-22T12:00:00Z',observedAt:'2026-09-22T12:00:00Z',persistedAt:'2026-09-22T12:00:00Z',lastSuccessfulRefreshAt:'2026-09-22T12:00:00Z',providerKickoff:kickoff,freshnessTtlMinutes:600,sourceDomain:'source.invalid',geoEligible:true}));}
const snapshot=(quotes:ReadOddsQuote[]):OddsReadSnapshot=>({quotes,kickoff,fixtureStatus:'SCHEDULED'});

describe('Traffic Engine V1.1 public bookmaker gate',()=>{
  it('never exposes Betano hidden insurance or unknown fallback provenance',()=>{
    const result=publicBookmakerSummary(snapshot([...market('betano.bet.br','Betano BR',['2.1','3.2','3.4']),...market('unlisted-source','Internal Source',['2.2','3.1','3.3'])]),now);
    expect(result.bookmakers).toEqual([]);expect(publicBookmakerCopy(result)).toBe('Compare as odds no LivaSports.com.');
  });
  it('exposes only complete current REAL markets from visible identities and computes a truthful gap',()=>{
    const result=publicBookmakerSummary(snapshot([...market('betsson','Betsson',['2.0','3.1','3.8']),...market('sportingbet.bet.br','Sportingbet BR',['2.3','3.0','3.5']),...market('betano.bet.br','Betano BR',['4','4','4'])]),now);
    expect(result.bookmakers.map(row=>row.name)).toEqual(['Betsson','Sportingbet BR']);expect(result.priceGap).toBe(.3);
    expect(publicBookmakerCopy(result)).not.toContain('Betano');
  });
});
