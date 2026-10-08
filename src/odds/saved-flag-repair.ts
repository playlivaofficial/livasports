import type {OddsSnapshot} from './types';

/** Reclassify only proven 1xBet flag defects; preserve the original prices and observation times. */
export function repairSavedPeruOneXBetFlags(snapshot:OddsSnapshot){
  if(snapshot.bookmaker!=='1xbet'||snapshot.providerBookmakerId!=='1xbet'||
    snapshot.geoFeeds?.length!==1||snapshot.geoFeeds[0].geo!=='PE'||
    snapshot.geoFeeds[0].operatorId!=='1xbet'||snapshot.geoFeeds[0].providerBookmakerId!=='1xbet')return {snapshot,repaired:0};
  let repaired=0;
  const quotes=snapshot.quotes.map(quote=>{
    const flags=snapshot.offerFlags?.filter(f=>f.providerFixtureId===quote.providerFixtureId&&f.market===quote.market&&f.outcome===quote.outcome)??[];
    const fixtures=snapshot.fixtures.filter(f=>f.providerId===quote.providerFixtureId);
    const updated=Date.parse(quote.providerUpdatedAt??''),observed=Date.parse(snapshot.observedAt);
    const kickoff=Date.parse(fixtures[0]?.kickoff??''),price=Number(quote.decimalOdds);
    if(quote.status!=='SUSPENDED'||quote.bookmaker!=='1xbet'||quote.observedAt!==snapshot.observedAt||
      flags.length!==1||flags[0].marketActive!==true||flags[0].priceActive!==true||
      quote.scope!=='FULL_TIME_REGULATION'||quote.phase!=='PREGAME'||!Number.isFinite(price)||price<=1||price>1000||
      fixtures.length!==1||fixtures[0].status!=='PREGAME'||!Number.isFinite(kickoff)||kickoff<=observed||
      !Number.isFinite(updated)||!Number.isFinite(observed)||updated>observed+60000)return quote;
    repaired++;return {...quote,status:'ACTIVE' as const};
  });
  return {snapshot:repaired?{...snapshot,quotes}:snapshot,repaired};
}
