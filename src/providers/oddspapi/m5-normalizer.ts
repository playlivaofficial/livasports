import type { NormalizedOddsQuote, OddsMarket, OddsOutcome, OddsSnapshot, ProviderOddsFixture } from '@/odds/types';

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
] as const;
const rules: Record<string,{market:OddsMarket;name:string;type:string;line:number|null;outcomes:Record<string,{name:string;code:OddsOutcome}>}>={
  '101':{market:'MATCH_WINNER',name:'Full Time Result',type:'1x2',line:null,outcomes:{'101':{name:'1',code:'HOME'},'102':{name:'X',code:'DRAW'},'103':{name:'2',code:'AWAY'}}},
  '104':{market:'BTTS',name:'Both Teams To Score',type:'bothteamsscore',line:null,outcomes:{'104':{name:'Yes',code:'YES'},'105':{name:'No',code:'NO'}}},
  '1010':{market:'TOTAL_GOALS',name:'Over Under Full Time',type:'totals',line:2.5,outcomes:{'1010':{name:'Over',code:'OVER'},'1011':{name:'Under',code:'UNDER'}}},
};
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
  catalog:readonly {id:string;slug:string;category:string;canonical:string}[]=M5_TOURNAMENTS):OddsSnapshot {
  if(!['betano.bet.br','betsson'].includes(bookmaker)||!isoUtc(observedAt)||!Array.isArray(data))throw new Error('Invalid pregame snapshot envelope');
  const result:OddsSnapshot={bookmaker,observedAt,fixtures:[],quotes:[],rejected:{},tournamentIds:[...tournamentIds]};
  const reject=(key:string)=>{result.rejected[key]=(result.rejected[key]??0)+1;};
  const seen=new Set<string>();
  const idCounts=new Map<unknown,number>();for(const row of data){const id=obj(row).fixtureId;idCounts.set(id,(idCounts.get(id)??0)+1);}
  const duplicateIds=new Set([...idCounts].filter(([,count])=>count>1).map(([id])=>id));
  for(const value of data){
    const r=obj(value);const kickoff=isoUtc(r.startTime);const tournament=catalog.find(t=>t.id===String(r.tournamentId));
    if(!kickoff||r.sportId!==10||!tournament||!tournamentIds.includes(tournament.id)||typeof r.fixtureId!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(r.fixtureId)||seen.has(r.fixtureId)||duplicateIds.has(r.fixtureId)){reject('INVALID_FIXTURE');continue;}
    if((r.tournamentSlug!==undefined&&r.tournamentSlug!==tournament.slug)||(r.categorySlug!==undefined&&r.categorySlug!==tournament.category)){reject('COMPETITION_METADATA_CONFLICT');continue;}
    seen.add(r.fixtureId);
    const fixture:ProviderOddsFixture={providerId:r.fixtureId,sport:'FOOTBALL',competition:tournament.canonical,providerCompetitionId:tournament.id,kickoff,
      status:r.statusId===0&&!r.trueStartTime&&!r.trueEndTime?'PREGAME':'OTHER',homeProviderId:String(r.participant1Id??''),awayProviderId:String(r.participant2Id??''),
      homeNames:texts(r.participant1Name,r.participant1ShortName),awayNames:texts(r.participant2Name,r.participant2ShortName)};
    if(!Number.isInteger(r.participant1Id)||!Number.isInteger(r.participant2Id)||Number(r.participant1Id)<=0||Number(r.participant2Id)<=0||fixture.homeProviderId===fixture.awayProviderId){reject('INVALID_PARTICIPANTS');continue;}
    result.fixtures.push(fixture);
    const book=obj(obj(r.bookmakerOdds)[bookmaker]);
    let domain:string|null=null;
    if(typeof book.fixturePath==='string'){try { domain=new URL(book.fixturePath.includes('://')?book.fixturePath:`https://${book.fixturePath}`).hostname;}catch{/* No domain evidence. */}}
    for(const [id,rawMarket] of Object.entries(obj(book.markets))){
      const rule=rules[id];if(!rule){reject('OUT_OF_SCOPE_MARKET');continue;}
      const market=obj(rawMarket);
      for(const [outcomeId,rawOutcome] of Object.entries(obj(market.outcomes))){
        const outcome=rule.outcomes[outcomeId];if(!outcome){reject('OUT_OF_SCOPE_OUTCOME');continue;}
        const players=obj(obj(rawOutcome).players);const price=obj(players['0']);
        if(Object.keys(players).length!==1||price.playerName!=null){reject('PLAYER_OR_AMBIGUOUS_OUTCOME');continue;}
        const n=typeof price.price==='number'?price.price:NaN;
        if(!Number.isFinite(n)||n<=1||n>1000){reject('INVALID_DECIMAL_ODDS');continue;}
        const updated=isoUtc(price.bookmakerChangedAt)??isoUtc(price.changedAt);
        const stampInvalid=!updated||Date.parse(updated)>Date.parse(observedAt)+60000;
        const status:NormalizedOddsQuote['status']=fixture.status!=='PREGAME'||Date.parse(kickoff)<=Date.parse(observedAt)?'CLOSED':
          book.bookmakerIsActive!==true||book.suspended!==false||market.marketActive!==true||price.active!==true?'SUSPENDED':stampInvalid?'STALE':'ACTIVE';
        if(stampInvalid)reject('MISSING_OR_FUTURE_TIMESTAMP');
        result.quotes.push({providerFixtureId:fixture.providerId,bookmaker,market:rule.market,outcome:outcome.code,line:rule.line,
          decimalOdds:String(n),status,scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:updated,observedAt,sourceDomain:domain});
      }
    }
  }
  return result;
}
