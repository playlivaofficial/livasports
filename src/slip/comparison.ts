import {quoteState} from '@/odds/comparison';
import {ODDS_TTL_MS} from '@/odds/types';
import type {SiteLocale} from '@/config/i18n';
import type {SlipFixtureRead} from './resolution';
import type {CanonicalSelection} from './types';
import type {BookmakerConfig,BookmakerSlip,SelectionQuote,SlipComparison,ComparisonState} from './comparison-types';
import {compareDecimal,multiplyDecimalOdds,validDecimalOdds} from './decimal';

function selectionQuote(selection:CanonicalSelection,read:SlipFixtureRead|null,bookmaker:string,now:number):SelectionQuote {
  const base:SelectionQuote={selection,fixture:read?.fixture??null,state:'UNAVAILABLE',reason:read?'NO_QUOTE':'MISSING_FIXTURE',decimalOdds:null,expiresAt:null,closesAt:read?.fixture.kickoff??null};
  if(!read)return base;
  const {fixture,snapshot}=read;
  if(fixture.status==='FINISHED')return {...base,state:'MATCH_FINISHED',reason:null};
  if(['LIVE','HALFTIME'].includes(fixture.status)||now>=Date.parse(fixture.kickoff))return {...base,state:'MATCH_STARTED',reason:null};
  if(fixture.status!=='SCHEDULED')return {...base,state:'CLOSED',reason:null};
  const matches=snapshot.quotes.filter(q=>q.geoEligible&&q.bookmaker===bookmaker&&q.market===selection.market&&q.outcome===selection.outcome&&q.line===selection.line&&q.scope===selection.scope&&q.phase==='PREGAME');
  if(matches.length!==1)return {...base,reason:matches.length?'INVALID_QUOTE':'NO_QUOTE'};
  const quote=matches[0];
  const close=Math.min(Date.parse(fixture.kickoff),Date.parse(quote.providerKickoff));
  if(!Number.isFinite(close))return {...base,reason:'INVALID_QUOTE'};
  base.closesAt=new Date(close).toISOString();
  if(now>=close)return {...base,state:'MATCH_STARTED',reason:null};
  const state=quoteState(quote,snapshot,now);
  if(state!=='ACTIVE')return {...base,state:['STALE','SUSPENDED','CLOSED'].includes(state)?state:'UNAVAILABLE',reason:null};
  if(!validDecimalOdds(quote.decimalOdds))return {...base,reason:'INVALID_QUOTE'};
  const expires=Math.min(close,Date.parse(quote.observedAt)+ODDS_TTL_MS,Date.parse(quote.lastSuccessfulRefreshAt)+ODDS_TTL_MS);
  if(!Number.isFinite(expires)||now>=expires)return {...base,state:'STALE',reason:null};
  return {...base,state:'CURRENT',reason:null,decimalOdds:quote.decimalOdds,expiresAt:new Date(expires).toISOString()};
}

function summarize(config:BookmakerConfig,quotes:SelectionQuote[]):BookmakerSlip {
  const available=quotes.filter(q=>q.state==='CURRENT'&&q.decimalOdds!==null).length;
  const combined=available===quotes.length?multiplyDecimalOdds(quotes.map(q=>q.decimalOdds!)):null;
  const complete=quotes.length>0&&available===quotes.length&&combined!==null;
  const affiliate=config.affiliateEligibility.approved&&config.affiliateEligibility.destinationConfigured;
  return {...config,requiredSelectionCount:quotes.length,availableSelectionCount:available,
    missingSelections:quotes.filter(q=>q.state==='UNAVAILABLE'&&q.reason!=='INVALID_QUOTE'),
    invalidSelections:quotes.filter(q=>q.state!=='CURRENT'&&(q.state!=='UNAVAILABLE'||q.reason==='INVALID_QUOTE')),
    complete,selectionQuotes:quotes,combinedDecimalOdds:complete?combined:null,best:false,tiedBest:false,
    ctaState:!complete?'INCOMPLETE':affiliate?'ENABLED':'AFFILIATE_UNAVAILABLE',outboundCapability:affiliate?'HOMEPAGE':'NONE'};
}
function finish(locale:SiteLocale,count:number,bookmakers:BookmakerSlip[]):SlipComparison {
  const complete=bookmakers.filter(b=>b.complete);
  if(complete.length>=2){const highest=complete.reduce((a,b)=>compareDecimal(a.combinedDecimalOdds!,b.combinedDecimalOdds!)>=0?a:b).combinedDecimalOdds!;
    const winners=complete.filter(b=>compareDecimal(b.combinedDecimalOdds!,highest)===0);
    for(const b of winners){b.best=true;b.tiedBest=winners.length>1;}
  }
  const quotes=bookmakers.flatMap(b=>b.selectionQuotes);const states:ComparisonState[]=[];
  if(!count)states.push('EMPTY_SLIP');else{
    if(count===1)states.push('ONE_SELECTION');
    if(!bookmakers.length&&count>1)states.push('MULTI_SELECTION_NO_BOOKMAKER');
    if(complete.length===1)states.push('ONE_COMPLETE_BOOKMAKER');
    if(complete.length>1)states.push('MULTIPLE_COMPLETE_BOOKMAKERS');
    if(bookmakers.some(b=>!b.complete&&b.availableSelectionCount>0))states.push('PARTIAL_BOOKMAKER_COVERAGE');
    if(quotes.some(q=>q.state==='STALE'))states.push('STALE_SELECTION');
    if(quotes.some(q=>q.state==='MATCH_STARTED'||q.state==='MATCH_FINISHED'))states.push('MATCH_STARTED');
    if(!bookmakers.length||quotes.some(q=>q.state==='UNAVAILABLE'))states.push('MISSING_SELECTION_PRICE');
    if(quotes.some(q=>q.decimalOdds!==null)&&quotes.some(q=>q.decimalOdds===null))states.push('MIXED_VALIDITY');
  }
  const times=quotes.filter(q=>q.decimalOdds!==null).map(q=>Date.parse(q.expiresAt!));
  return {version:1,locale,states,bookmakers,expiresAt:times.length?new Date(Math.min(...times)).toISOString():null};
}
function eligibleBookmaker(b:BookmakerConfig,locale:SiteLocale){
  return b.geoEligibility.eligible&&b.geoEligibility.locale===locale&&(b.bookmakerId==='betsson'||(b.bookmakerId==='betano.bet.br'&&locale==='br'));
}
export function buildSlipComparison(selections:CanonicalSelection[],locale:SiteLocale,fixtures:Map<string,SlipFixtureRead>,configs:BookmakerConfig[],now=Date.now()):SlipComparison {
  const eligible=configs.filter(b=>eligibleBookmaker(b,locale));
  const bookmakers=selections.length?eligible.map(b=>summarize(b,selections.map(s=>selectionQuote(s,fixtures.get(s.fixturePublicId)??null,b.bookmakerId,now)))):[];
  return finish(locale,selections.length,bookmakers);
}
// Rebuild totals, best markers and CTAs at render time, including offline/failed reads.
export function guardSlipComparison(value:SlipComparison,count:number,now:number,connected=true):SlipComparison {
  return finish(value.locale,count,value.bookmakers.filter(b=>eligibleBookmaker(b,value.locale)).map(b=>summarize(b,b.selectionQuotes.map(q=>{
    if(q.state==='MATCH_FINISHED')return {...q,decimalOdds:null};
    if(q.closesAt&&now>=Date.parse(q.closesAt))return {...q,state:'MATCH_STARTED',decimalOdds:null};
    if(q.decimalOdds&&(!connected||!Number.isFinite(Date.parse(q.expiresAt??''))||now>=Date.parse(q.expiresAt!)))return {...q,state:'STALE',decimalOdds:null};
    if(q.decimalOdds&&!validDecimalOdds(q.decimalOdds))return {...q,state:'UNAVAILABLE',decimalOdds:null};
    return {...q};
  }))));
}
