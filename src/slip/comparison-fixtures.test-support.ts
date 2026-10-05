// Synthetic unit/replay data only. Never imported by a production entry point.
import type {ReadOddsQuote} from '@/odds/types';
import type {SlipComparisonRead} from '@/odds/read-repository';
import {VISIBLE_BOOKMAKERS} from '@/odds/registry';
import {SLIP_SCOPE,type CanonicalSelection} from './types';
/**
 * A Colombian slip: after the MX/CO/PE cutover Colombia is the only jurisdiction with two public
 * books, so Betsson and bwin are the only honest pair for a two-book comparison fixture. bwin carries
 * no approved affiliate campaign, which is also true in production — Entain access does not exist yet
 * — so these fixtures exercise a priced, comparable book whose CTA stays closed.
 */
export function comparisonFixture(count=3,now=Date.parse('2026-09-12T15:00:00Z')){
  const selections:CanonicalSelection[]=Array.from({length:count},(_,i)=>({fixturePublicId:(i+1).toString(16).padStart(16,'0'),scope:SLIP_SCOPE,
    ...(i%3===1?{market:'TOTAL_GOALS' as const,outcome:'OVER' as const,line:2.5 as const}:i%3===2?{market:'BTTS' as const,outcome:'YES' as const,line:null}:{market:'MATCH_WINNER' as const,outcome:'HOME' as const,line:null})}));
  const data:SlipComparisonRead={fixtures:new Map(),bookmakers:[
    {bookmakerId:'betsson',displayName:'Betsson',geoEligibility:{locale:'co',eligible:true},affiliateEligibility:{approved:true,destinationConfigured:true}},
    {bookmakerId:'bwin',displayName:'bwin',geoEligibility:{locale:'co',eligible:true},affiliateEligibility:{approved:false,destinationConfigured:false}},
  ],destinations:{betsson:'https://betsson.co/?partner=test-only'}};
  for(const [i,s] of selections.entries()){
    const kickoff=new Date(now+3600000).toISOString(),observedAt=new Date(now).toISOString();
    const fixture={publicId:s.fixturePublicId,home:['Atlético Nacional','Millonarios','Club América'][i%3],away:['Junior','Independiente Santa Fe','Tigres UANL'][i%3],competition:'Competición de prueba',kickoff,status:'SCHEDULED'};
    const quotes:ReadOddsQuote[]=data.bookmakers.map(b=>({quoteId:`quote-${b.bookmakerId}-${i}`,fixtureId:s.fixturePublicId,providerFixtureId:`test-${i}`,bookmaker:b.bookmakerId,bookmakerId:b.bookmakerId,bookmakerName:b.displayName,
      market:s.market,outcome:s.outcome,line:s.line,decimalOdds:b.bookmakerId==='betsson'?['2.10','1.80','1.60'][i%3]:['2.15','1.82','1.65'][i%3],status:'ACTIVE',scope:SLIP_SCOPE,phase:'PREGAME',
      providerUpdatedAt:observedAt,observedAt,persistedAt:observedAt,lastSuccessfulRefreshAt:observedAt,sourceDomain:b.bookmakerId==='betsson'?'www.betsson.com':'sports.bwin.com',providerKickoff:kickoff,geoEligible:true}));
    data.fixtures.set(s.fixturePublicId,{fixture,snapshot:{kickoff,fixtureStatus:'SCHEDULED',quotes}});
  }
  return {selections,data,now};
}
/**
 * The public cards of the fixture's jurisdiction, in display order. Derived from the registry rather
 * than named, so adding or retiring an operator needs no test edit. These fixtures are Colombian, so
 * this is Colombia's line-up — never the union across jurisdictions, which would be a cross-GEO state
 * no visitor can ever see.
 */
export const PUBLIC_CARD_IDS=VISIBLE_BOOKMAKERS
  .filter(book=>(book.countries as readonly string[]).includes('CO')).map(book=>book.canonicalId);
/** Ensures a fixture carries every public card of its jurisdiction. A card present here without
 * quotes of its own is exactly how a book that has not priced a leg reaches the slip. */
export function withPublicCards<T extends ReturnType<typeof comparisonFixture>>(fixture:T):T{
  fixture.data.bookmakers=PUBLIC_CARD_IDS.map((id,i)=>fixture.data.bookmakers.find(b=>b.bookmakerId===id)??{
    bookmakerId:id,displayName:VISIBLE_BOOKMAKERS.find(book=>book.canonicalId===id)!.shortLabel,
    geoEligibility:{locale:'co' as const,eligible:true},
    affiliateEligibility:{approved:i===0,destinationConfigured:i===0},
  });
  return fixture;
}
