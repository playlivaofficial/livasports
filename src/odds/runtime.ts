import 'server-only';
import {CacheCoordinator,MemoryCacheStore} from '@/cache/cache';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {buildComparison} from './comparison';
import {readOddsSnapshot} from './read-repository';
import {SELECTIONS,type OddsComparison,type OddsMarket} from './types';
import {requestCommercialGeo,commercialLocale,type CommercialGeo} from './commercial-geo';

// Hard-expiring process cache, not stale-while-revalidate: a cached active status has a bounded lifetime.
// Cross-instance misses cost one indexed DB query, never an upstream request.
const cache=new CacheCoordinator(new MemoryCacheStore(),e=>console.info(`[LivaSports M5] ${JSON.stringify({event:`odds-cache-${e.event}`,key:e.key,providerRequests:0})}`));
let db:PostgresDatabaseClient|null=null;
function database(){const url=databaseUrl();if(!url)throw new Error('Odds DB unavailable');return db??=new PostgresDatabaseClient(url);}
export async function loadOddsComparisons(fixtureId:string,geo:CommercialGeo|null):Promise<OddsComparison[]>{
  const snapshot=(await cache.getOrSet(`odds:m5:${fixtureId}:${geo??'none'}`,{ttlSeconds:15,staleIfErrorSeconds:0},()=>readOddsSnapshot(database(),fixtureId,geo))).value;
  return (Object.keys(SELECTIONS) as OddsMarket[]).map(market=>{
    const locale=commercialLocale(geo);
    const actions=Object.fromEntries((locale?Object.keys(snapshot.destinations):[]).map(bookmaker=>[bookmaker,`/go/${bookmaker}?fixtureId=${fixtureId}&locale=${locale}&market=${market}&placement=match-odds`]));
    return buildComparison(snapshot,market,Date.now(),actions);
  });
}
export async function resolveOddsDestination(fixtureId:string,geo:CommercialGeo|null,bookmaker:string,market:OddsMarket):Promise<string|null>{
  // A click must revalidate against the DB, not a prefetched page or the short read cache.
  const snapshot=await readOddsSnapshot(database(),fixtureId,geo);
  const row=buildComparison(snapshot,market).rows.find(r=>r.bookmaker===bookmaker);
  return row?.cells.some(c=>c.decimalOdds!==null)?snapshot.destinations[bookmaker]??null:null;
}
export function commercialGeoFromHeaders(headers:Headers,env:Readonly<Record<string,string|undefined>>=process.env){
  return requestCommercialGeo(headers,env);
}
