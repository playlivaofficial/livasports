// Synthetic unit/replay data only. Never imported by a production entry point.
import type {ReadOddsQuote} from '@/odds/types';
import type {SlipComparisonRead} from '@/odds/read-repository';
import {VISIBLE_BOOKMAKERS} from '@/odds/registry';
import {SLIP_SCOPE,type CanonicalSelection} from './types';
export function comparisonFixture(count=3,now=Date.parse('2026-09-12T15:00:00Z')){
  const selections:CanonicalSelection[]=Array.from({length:count},(_,i)=>({fixturePublicId:(i+1).toString(16).padStart(16,'0'),scope:SLIP_SCOPE,
    ...(i%3===1?{market:'TOTAL_GOALS' as const,outcome:'OVER' as const,line:2.5 as const}:i%3===2?{market:'BTTS' as const,outcome:'YES' as const,line:null}:{market:'MATCH_WINNER' as const,outcome:'HOME' as const,line:null})}));
  const data:SlipComparisonRead={fixtures:new Map(),bookmakers:[
    {bookmakerId:'betsson',displayName:'Betsson',geoEligibility:{locale:'br',eligible:true},affiliateEligibility:{approved:true,destinationConfigured:true}},
    {bookmakerId:'sportingbet.bet.br',displayName:'Sportingbet',geoEligibility:{locale:'br',eligible:true},affiliateEligibility:{approved:false,destinationConfigured:false}},
  ],destinations:{betsson:'https://betsson.bet.br/?partner=test-only'}};
  for(const [i,s] of selections.entries()){
    const kickoff=new Date(now+3600000).toISOString(),observedAt=new Date(now).toISOString();
    const fixture={publicId:s.fixturePublicId,home:['Flamengo','Real Madrid','Club América'][i%3],away:['Palmeiras','Barcelona','Tigres UANL'][i%3],competition:'Competição de teste',kickoff,status:'SCHEDULED'};
    const quotes:ReadOddsQuote[]=data.bookmakers.map(b=>({quoteId:`quote-${b.bookmakerId}-${i}`,fixtureId:s.fixturePublicId,providerFixtureId:`test-${i}`,bookmaker:b.bookmakerId,bookmakerId:b.bookmakerId,bookmakerName:b.displayName,
      market:s.market,outcome:s.outcome,line:s.line,decimalOdds:b.bookmakerId==='betsson'?['2.10','1.80','1.60'][i%3]:['2.15','1.82','1.65'][i%3],status:'ACTIVE',scope:SLIP_SCOPE,phase:'PREGAME',
      providerUpdatedAt:observedAt,observedAt,persistedAt:observedAt,lastSuccessfulRefreshAt:observedAt,sourceDomain:b.bookmakerId==='betsson'?'www.betsson.com':'www.sportingbet.bet.br',providerKickoff:kickoff,geoEligible:true}));
    data.fixtures.set(s.fixturePublicId,{fixture,snapshot:{kickoff,fixtureStatus:'SCHEDULED',quotes}});
  }
  return {selections,data,now};
}
/** Every public card the registry currently exposes, in display order. Tests that assert the Brazil
 * line-up read this instead of naming operators, so adding or retiring one needs no test edit. */
export const PUBLIC_CARD_IDS=VISIBLE_BOOKMAKERS.map(book=>book.canonicalId);
/** Widens a fixture from its two priced books to the full set of public cards. The extra cards carry
 * no quotes of their own, which is exactly how a book that has not priced a leg reaches the slip. */
export function withPublicCards<T extends ReturnType<typeof comparisonFixture>>(fixture:T):T{
  fixture.data.bookmakers=VISIBLE_BOOKMAKERS.map((book,i)=>fixture.data.bookmakers.find(b=>b.bookmakerId===book.canonicalId)??{
    bookmakerId:book.canonicalId,displayName:book.shortLabel,geoEligibility:{locale:'br' as const,eligible:true},
    affiliateEligibility:{approved:i===0,destinationConfigured:i===0},
  });
  return fixture;
}
