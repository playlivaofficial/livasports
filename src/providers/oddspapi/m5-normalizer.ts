import type { NormalizedOddsQuote, OddsMarket, OddsOutcome, OddsSnapshot, ProviderOddsFixture } from '@/odds/types';
import { canonicalBookmakerSlug } from '@/odds/bookmaker';
import {bookmakerConfig} from '@/odds/registry';

type ObjectValue = Record<string,unknown>;
const obj=(value:unknown):ObjectValue=>value&&typeof value==='object'&&!Array.isArray(value)?value as ObjectValue:{};
const texts=(...values:unknown[]):string[]=>values.filter(v=>typeof v==='string'&&v.trim().length>0) as string[];
export function isoUtc(value:unknown):string|null {
  if(typeof value!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/i.test(value)||!Number.isFinite(Date.parse(value)))return null;
  return new Date(value).toISOString();
}
export const M5_TOURNAMENTS = [
  {id:'325',slug:'brasileiro-serie-a',category:'brazil',canonical:'brasileirao-serie-a'},
  {id:'27464',slug:'liga-mx-apertura',category:'mexico',canonical:'liga-mx'},
  {id:'17',slug:'premier-league',category:'england',canonical:'premier-league'},
  {id:'384',slug:'copa-libertadores',category:'international-clubs',canonical:'copa-libertadores'},
] as const;
/** IDs copied from unique OddsPapi catalog rows and canaried alone. Never guess. */
export const M5_EXPANDED_TOURNAMENTS = [
  {id:'390',slug:'brasileiro-serie-b',category:'brazil',canonical:'brasileirao-serie-b'},
  {id:'8',slug:'laliga',category:'spain',canonical:'la-liga'},
  {id:'35',slug:'bundesliga',category:'germany',canonical:'bundesliga'},
  {id:'23',slug:'serie-a',category:'italy',canonical:'serie-a-italy'},
  {id:'679',slug:'uefa-europa-league',category:'international-clubs',canonical:'europa-league'},
  {id:'480',slug:'copa-sudamericana',category:'international-clubs',canonical:'copa-sudamericana'},
  {id:'242',slug:'mls',category:'usa',canonical:'mls'},
  {id:'34',slug:'ligue-1',category:'france',canonical:'ligue-1'},
  {id:'238',slug:'liga-portugal',category:'portugal',canonical:'liga-portugal'},
  {id:'37',slug:'eredivisie',category:'netherlands',canonical:'eredivisie'},
  {id:'18',slug:'championship',category:'england',canonical:'championship'},
  {id:'7',slug:'uefa-champions-league',category:'international-clubs',canonical:'champions-league'},
  {id:'155',slug:'liga-profesional',category:'argentina',canonical:'argentina-primera-division'},
  {id:'182',slug:'ligue-2',category:'france',canonical:'ligue-2'},
  {id:'53',slug:'serie-b',category:'italy',canonical:'serie-b-italy'},
  {id:'52',slug:'super-lig',category:'turkiye',canonical:'super-lig'},
  {id:'328',slug:'coppa-italia',category:'italy',canonical:'coppa-italia'},
  {id:'21',slug:'efl-cup',category:'england',canonical:'carabao-cup'},
] as const;
/** Catalog-verified IDs that singleton canary proved empty. Do not schedule; 404 would burn quota every tick. */
export const M5_REJECTED_TOURNAMENTS = [
  {id:'373',slug:'copa-do-brasil',category:'brazil',canonical:'copa-do-brasil',reason:'SINGLETON_CANARY_FIXTURE_NOT_FOUND'},
  {id:'19',slug:'fa-cup',category:'england',canonical:'fa-cup',reason:'SINGLETON_CANARY_FIXTURE_NOT_FOUND'},
  {id:'329',slug:'copa-del-rey',category:'spain',canonical:'copa-del-rey',reason:'SINGLETON_CANARY_FIXTURE_NOT_FOUND'},
  {id:'955',slug:'saudi-pro-league',category:'saudi-arabia',canonical:'saudi-pro-league',reason:'SINGLETON_CANARY_FIXTURE_NOT_FOUND'},
] as const;
const rules: Record<string,{market:OddsMarket;name:string;type:string;line:number|null;outcomes:Record<string,{name:string;code:OddsOutcome}>}>={
  '101':{market:'MATCH_WINNER',name:'Full Time Result',type:'1x2',line:null,outcomes:{'101':{name:'1',code:'HOME'},'102':{name:'X',code:'DRAW'},'103':{name:'2',code:'AWAY'}}},
  '104':{market:'BTTS',name:'Both Teams To Score',type:'bothteamsscore',line:null,outcomes:{'104':{name:'Yes',code:'YES'},'105':{name:'No',code:'NO'}}},
  '1010':{market:'TOTAL_GOALS',name:'Over Under Full Time',type:'totals',line:2.5,outcomes:{'1010':{name:'Over',code:'OVER'},'1011':{name:'Under',code:'UNDER'}}},
};
const canonicalSemantics:Record<OddsMarket,{name:string;type:string;line:number|null;outcomes:Record<string,OddsOutcome>}>= {
  MATCH_WINNER:{name:'Full Time Result',type:'1x2',line:null,outcomes:{'1':'HOME','X':'DRAW','2':'AWAY'}},
  BTTS:{name:'Both Teams To Score',type:'bothteamsscore',line:null,outcomes:{'Yes':'YES','No':'NO'}},
  TOTAL_GOALS:{name:'Over Under Full Time',type:'totals',line:2.5,outcomes:{'Over':'OVER','Under':'UNDER'}},
};
/** Alternate IDs are accepted only when the provider catalog proves exact full-time semantics and outcome names. */
export function discoverCanonicalMarketRules(markets:unknown[]){
  const discovered:typeof rules={};
  for(const value of markets){const market=obj(value);const id=String(market.marketId??'');
    if(!/^\d+$/.test(id)||market.sportId!==10||market.playerProp!==false||market.period!=='fulltime')continue;
    for(const [canonical,semantic] of Object.entries(canonicalSemantics) as [OddsMarket,typeof canonicalSemantics[OddsMarket]][]){
      const line=semantic.line??0;if(market.marketName!==semantic.name||market.marketType!==semantic.type||Number(market.handicap??0)!==line)continue;
      const outcomes=Array.isArray(market.outcomes)?market.outcomes.map(obj):[];const mapped:Record<string,{name:string;code:OddsOutcome}>={};
      for(const [name,code] of Object.entries(semantic.outcomes)){const found=outcomes.filter(outcome=>outcome.outcomeName===name&&/^\d+$/.test(String(outcome.outcomeId??'')));
        if(found.length!==1){Object.keys(mapped).forEach(key=>delete mapped[key]);break;}mapped[String(found[0].outcomeId)]={name,code};}
      if(Object.keys(mapped).length===Object.keys(semantic.outcomes).length)discovered[id]={market:canonical,name:semantic.name,type:semantic.type,line:semantic.line,outcomes:mapped};
    }
  }
  return discovered;
}
export function inspectM5OfferFlags(data:unknown,bookmaker:string){
  const stats={fixtures:0,withBook:0,listedQuotes:0,bookmakerIsActiveTrue:0,bookmakerIsActiveFalse:0,bookmakerIsActiveMissing:0,
    suspendedTrue:0,suspendedFalse:0,marketActiveTrue:0,marketActiveFalse:0,priceActiveTrue:0,priceActiveFalse:0,
    currentLogicActive:0,listedWhileBookmakerInactive:0,listedWhileMarketInactive:0,listedIndependentOfBookActive:0};
  if(!Array.isArray(data))return stats;
  for(const value of data){
    const r=obj(value);stats.fixtures++;
    const oddsByBook=obj(r.bookmakerOdds);
    const book=obj(oddsByBook[bookmaker]??{});
    if(!Object.keys(book).length)continue;
    stats.withBook++;
    if(book.bookmakerIsActive===true)stats.bookmakerIsActiveTrue++;
    else if(book.bookmakerIsActive===false)stats.bookmakerIsActiveFalse++;
    else stats.bookmakerIsActiveMissing++;
    if(book.suspended===true)stats.suspendedTrue++;else stats.suspendedFalse++;
    for(const [id,rawMarket] of Object.entries(obj(book.markets))){
      if(!(id in rules))continue;
      const market=obj(rawMarket);
      for(const outcome of Object.values(obj(market.outcomes))){
        const price=obj(obj(obj(outcome).players)['0']);
        const n=typeof price.price==='number'?price.price:NaN;
        if(!Number.isFinite(n)||n<=1||n>1000)continue;
        stats.listedQuotes++;
        if(price.active===true)stats.priceActiveTrue++;else stats.priceActiveFalse++;
        if(market.marketActive===true)stats.marketActiveTrue++;else stats.marketActiveFalse++;
        if(book.bookmakerIsActive!==true)stats.listedWhileBookmakerInactive++;
        else if(market.marketActive!==true)stats.listedWhileMarketInactive++;
        else stats.currentLogicActive++;
        if(market.marketActive===true)stats.listedIndependentOfBookActive++;
      }
    }
  }
  return stats;
}
export function inspectCatalogMarkets(markets:unknown[]):Array<{marketId:string;marketName:string;marketType:string;period:unknown;playerProp:unknown;handicap:unknown;supported:boolean}>{
  return markets.map(obj).filter(m=>m.sportId===10).map(m=>({
    marketId:String(m.marketId),marketName:String(m.marketName??''),marketType:String(m.marketType??''),
    period:m.period,playerProp:m.playerProp,handicap:m.handicap,supported:String(m.marketId) in rules,
  }));
}
export const SUPPORTED_M5_MARKETS=['MATCH_WINNER','BTTS','TOTAL_GOALS'] as const;
export function verifyCatalog(markets:unknown[],tournaments:unknown[]):void {
  for(const [id,rule] of Object.entries(rules)) {
    const found=markets.map(obj).filter(m=>String(m.marketId)===id);
    const m=found[0];
    if(found.length!==1||m.sportId!==10||m.playerProp!==false||m.period!=='fulltime'||m.marketType!==rule.type||m.marketName!==rule.name||m.handicap!==(rule.line??0)) throw new Error(`Unverified M5 market ${id}`);
    const outcomes=Array.isArray(m.outcomes)?m.outcomes.map(obj):[];
    for(const [outcomeId,outcome] of Object.entries(rule.outcomes)) if(!outcomes.some(o=>String(o.outcomeId)===outcomeId&&o.outcomeName===outcome.name)) throw new Error(`Unverified M5 outcome ${outcomeId}`);
  }
  for(const rule of M5_TOURNAMENTS) {
    const found=tournaments.map(obj).filter(t=>String(t.tournamentId)===rule.id&&t.tournamentSlug===rule.slug&&t.categorySlug===rule.category);
    if(found.length!==1) throw new Error(`Unverified M5 tournament ${rule.id}`);
  }
}
export function normalizeM5Snapshot(data:unknown,bookmaker:string,observedAt:string,tournamentIds:readonly string[],
  catalog:readonly {id:string;slug:string;category:string;canonical:string}[]=M5_TOURNAMENTS,marketCatalog:unknown[]=[]):OddsSnapshot {
  if(!canonicalBookmakerSlug(bookmaker)||!isoUtc(observedAt)||!Array.isArray(data))throw new Error('Invalid pregame snapshot envelope');
  const activeRules={...rules,...discoverCanonicalMarketRules(marketCatalog)};
  const result:OddsSnapshot={provider:'ODDSPAPI',bookmaker:canonicalBookmakerSlug(bookmaker)??bookmaker,observedAt,fixtures:[],quotes:[],rejected:{},tournamentIds:[...tournamentIds]};
  let context={providerFixtureId:'',tournamentId:'',market:'',outcome:'',evidence:{} as Record<string,unknown>};
  const reject=(key:string)=>{result.rejected[key]=(result.rejected[key]??0)+1;
    // Unsupported markets are accounted for in aggregate, not thousands of redundant diagnostic rows per request.
    if(!key.startsWith('OUT_OF_SCOPE'))(result.diagnostics??=[]).push({...context,reason:key});};
  const seen=new Set<string>();
  const idCounts=new Map<unknown,number>();for(const row of data){const id=obj(row).fixtureId;idCounts.set(id,(idCounts.get(id)??0)+1);}
  const duplicateIds=new Set([...idCounts].filter(([,count])=>count>1).map(([id])=>id));
  for(const value of data){
    const r=obj(value);const kickoff=isoUtc(r.startTime);const tournament=catalog.find(t=>t.id===String(r.tournamentId));
    context={providerFixtureId:String(r.fixtureId??'UNKNOWN'),tournamentId:String(r.tournamentId??''),market:'',outcome:'',evidence:{home:r.participant1Name,away:r.participant2Name,kickoff:r.startTime,homeProviderId:r.participant1Id,awayProviderId:r.participant2Id}};
    if(!kickoff||r.sportId!==10||!tournament||!tournamentIds.includes(tournament.id)||typeof r.fixtureId!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(r.fixtureId)||seen.has(r.fixtureId)||duplicateIds.has(r.fixtureId)){reject('INVALID_FIXTURE');continue;}
    if((r.tournamentSlug!==undefined&&r.tournamentSlug!==tournament.slug)||(r.categorySlug!==undefined&&r.categorySlug!==tournament.category)){reject('COMPETITION_METADATA_CONFLICT');continue;}
    seen.add(r.fixtureId);
    const fixture:ProviderOddsFixture={providerId:r.fixtureId,sport:'FOOTBALL',competition:tournament.canonical,providerCompetitionId:tournament.id,kickoff,
      status:r.statusId===0&&!r.trueStartTime&&!r.trueEndTime?'PREGAME':'OTHER',homeProviderId:String(r.participant1Id??''),awayProviderId:String(r.participant2Id??''),
      homeNames:texts(r.participant1Name,r.participant1ShortName),awayNames:texts(r.participant2Name,r.participant2ShortName)};
    if(!Number.isInteger(r.participant1Id)||!Number.isInteger(r.participant2Id)||Number(r.participant1Id)<=0||Number(r.participant2Id)<=0||fixture.homeProviderId===fixture.awayProviderId){reject('INVALID_PARTICIPANTS');continue;}
    result.fixtures.push(fixture);
    const oddsByBook=obj(r.bookmakerOdds);
    const book=obj(oddsByBook[bookmaker]??oddsByBook[result.bookmaker]);
    let domain:string|null=null;
    if(typeof book.fixturePath==='string'){try { domain=new URL(book.fixturePath.includes('://')?book.fixturePath:`https://${book.fixturePath}`).hostname;}catch{/* No domain evidence. */}}
    for(const [id,rawMarket] of Object.entries(obj(book.markets))){
      context={...context,market:activeRules[id]?.market??id,outcome:''};
      const rule=activeRules[id];if(!rule){reject('OUT_OF_SCOPE_MARKET');continue;}
      const market=obj(rawMarket);
      for(const [outcomeId,rawOutcome] of Object.entries(obj(market.outcomes))){
        context={...context,outcome:rule.outcomes[outcomeId]?.code??outcomeId};
        const outcome=rule.outcomes[outcomeId];if(!outcome){reject('OUT_OF_SCOPE_OUTCOME');continue;}
        const players=obj(obj(rawOutcome).players);const price=obj(players['0']);
        const flag=(value:unknown)=>typeof value==='boolean'?value:null;
        (result.offerFlags??=[]).push({providerFixtureId:fixture.providerId,market:rule.market,outcome:outcome.code,
          bookmakerActive:flag(book.bookmakerIsActive),bookmakerSuspended:flag(book.suspended),marketActive:flag(market.marketActive),priceActive:flag(price.active)});
        context={...context,evidence:{...context.evidence,marketId:id,outcomeId,price:typeof price.price==='number'?price.price:null,
          bookmakerActive:book.bookmakerIsActive,bookmakerSuspended:book.suspended,marketActive:market.marketActive,priceActive:price.active}};
        if(Object.keys(players).length!==1||price.playerName!=null){reject('PLAYER_OR_AMBIGUOUS_OUTCOME');continue;}
        const n=typeof price.price==='number'?price.price:NaN;
        if(!Number.isFinite(n)||n<=1||n>1000){reject('INVALID_DECIMAL_ODDS');continue;}
        const updated=isoUtc(price.bookmakerChangedAt)??isoUtc(price.changedAt);
        const stampInvalid=!updated||Date.parse(updated)>Date.parse(observedAt)+60000;
        // Listed decimals on a collected, active market stay current. OddsPapi currently marks every
        // Betsson fixture bookmakerIsActive=false and suspended=true while still returning independent prices.
        const strictNewFeed=bookmakerConfig(result.bookmaker)?.providerFlagPolicy==='STRICT';
        const suspended=market.marketActive!==true||(strictNewFeed&&(book.bookmakerIsActive!==true||book.suspended===true||price.active!==true));
        const status:NormalizedOddsQuote['status']=fixture.status!=='PREGAME'||Date.parse(kickoff)<=Date.parse(observedAt)?'CLOSED':
          suspended?'SUSPENDED':stampInvalid?'STALE':'ACTIVE';
        if(stampInvalid)reject('MISSING_OR_FUTURE_TIMESTAMP');
        result.quotes.push({providerFixtureId:fixture.providerId,bookmaker:result.bookmaker,market:rule.market,outcome:outcome.code,line:rule.line,
          decimalOdds:String(n),status,scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:updated,observedAt,sourceDomain:domain});
      }
    }
  }
  return result;
}
