import {quoteFreshnessTtlMs,quoteState} from '@/odds/comparison';
import type {SiteLocale} from '@/config/i18n';
import type {SlipFixtureRead} from './resolution';
import type {CanonicalSelection} from './types';
import type {BookmakerAvailabilityState,BookmakerConfig,BookmakerSlip,ComparisonDiagnostic,SelectionQuote,SlipComparison,ComparisonState} from './comparison-types';
import {compareDecimal,multiplyDecimalOdds,validDecimalOdds} from './decimal';
import {BOOKMAKER_REGISTRY,isVisibleBookmaker,bookmakerConfig} from '@/odds/registry';
import {resolveInsurance} from '@/odds/insurance';

function diagnosticForState(state:SelectionQuote['state'],reason:SelectionQuote['reason']):ComparisonDiagnostic {
  if(state==='CURRENT')return 'COMPLETE';
  if(state==='STALE')return 'STALE_QUOTE';
  if(state==='SUSPENDED'||state==='CLOSED')return 'WITHDRAWN';
  if(state==='MATCH_STARTED')return 'MATCH_STARTED';
  if(state==='MATCH_FINISHED')return 'MATCH_FINISHED';
  if(reason==='MISSING_FIXTURE')return 'FIXTURE_MISSING';
  if(reason==='INVALID_QUOTE')return 'INVALID_QUOTE';
  if(reason==='NO_QUOTE')return 'MISSING_QUOTE';
  return 'SNAPSHOT_INCOMPATIBLE';
}
function withDiagnostic(quote:Omit<SelectionQuote,'diagnosticCode'>&Partial<Pick<SelectionQuote,'diagnosticCode'>>,forced?:ComparisonDiagnostic):SelectionQuote {
  const {diagnosticCode:_ignored,...rest}=quote;
  void _ignored;
  return {...rest,diagnosticCode:forced??diagnosticForState(rest.state,rest.reason)};
}
export function bookmakerAvailabilityState(quotes:readonly SelectionQuote[],complete:boolean):BookmakerAvailabilityState {
  if(complete)return quotes.some(q=>q.priceKind==='PROXY')?'ESTIMATED_COMPLETE':'COMPLETE';
  const codes=quotes.map(q=>q.diagnosticCode);
  if(codes.includes('FIXTURE_MISSING'))return 'FIXTURE_UNAVAILABLE';
  if(codes.includes('MATCH_STARTED')||codes.includes('MATCH_FINISHED'))return 'FIXTURE_UNAVAILABLE';
  if(codes.includes('STALE_QUOTE'))return 'STALE_LEG';
  if(codes.includes('WITHDRAWN'))return 'WITHDRAWN_LEG';
  if(codes.includes('MARKET_MISSING'))return 'MARKET_UNAVAILABLE';
  if(codes.includes('MISSING_QUOTE'))return 'MISSING_LEG';
  return 'OTHER_VERIFIED_UNAVAILABLE_REASON';
}

function matchingQuotes(selection:CanonicalSelection,snapshot:SlipFixtureRead['snapshot'],bookmaker:string){
  return snapshot.quotes.filter(q=>q.geoEligible&&q.bookmaker===bookmaker&&q.market===selection.market&&q.outcome===selection.outcome&&q.line===selection.line&&q.scope===selection.scope&&q.phase==='PREGAME');
}
function evaluatedQuote(selection:CanonicalSelection,read:SlipFixtureRead,quote:SlipFixtureRead['snapshot']['quotes'][number],now:number,base:SelectionQuote):SelectionQuote {
  const {fixture,snapshot}=read;
  const close=Math.min(Date.parse(fixture.kickoff),Date.parse(quote.providerKickoff));
  if(!Number.isFinite(close))return withDiagnostic({...base,reason:'INVALID_QUOTE'});
  base={...base,closesAt:new Date(close).toISOString()};
  if(now>=close)return withDiagnostic({...base,state:'MATCH_STARTED',reason:null});
  const state=quoteState(quote,snapshot,now);
  if(state!=='ACTIVE')return withDiagnostic({...base,state:state==='WITHDRAWN'?'SUSPENDED':state,reason:null});
  if(!validDecimalOdds(quote.decimalOdds))return withDiagnostic({...base,reason:'INVALID_QUOTE'});
  const ttl=quoteFreshnessTtlMs(quote,snapshot,now);
  const expires=Math.min(close,Date.parse(quote.observedAt)+ttl,Date.parse(quote.lastSuccessfulRefreshAt)+ttl);
  if(!Number.isFinite(expires)||now>=expires)return withDiagnostic({...base,state:'STALE',reason:null});
  return withDiagnostic({...base,state:'CURRENT',reason:null,decimalOdds:quote.decimalOdds,expiresAt:new Date(expires).toISOString(),priceKind:'REAL',sourceBookmakerId:quote.bookmaker,sourceBookmakerName:quote.bookmakerName,sourceQuoteId:quote.quoteId,sourceObservedAt:quote.observedAt});
}
function absentQuote(selection:CanonicalSelection,read:SlipFixtureRead,bookmaker:string,base:SelectionQuote):SelectionQuote {
  const bookmakerQuotes=read.snapshot.quotes.filter(q=>q.geoEligible&&q.bookmaker===bookmaker&&q.phase==='PREGAME');
  const marketPresent=bookmakerQuotes.some(q=>q.market===selection.market&&q.line===selection.line&&q.scope===selection.scope);
  if(!marketPresent&&bookmakerQuotes.length)return withDiagnostic({...base,reason:'NO_QUOTE'},'MARKET_MISSING');
  return withDiagnostic(base);
}
function selectionQuote(selection:CanonicalSelection,read:SlipFixtureRead|null,bookmaker:string,now:number):SelectionQuote {
  const base:Omit<SelectionQuote,'diagnosticCode'>={selection,fixture:read?.fixture??null,state:'UNAVAILABLE',reason:read?'NO_QUOTE':'MISSING_FIXTURE',decimalOdds:null,expiresAt:null,closesAt:read?.fixture.kickoff??null,priceKind:null,sourceBookmakerId:null,sourceBookmakerName:null,sourceQuoteId:null,sourceObservedAt:null};
  if(!read)return withDiagnostic(base);
  const {fixture}=read;
  if(fixture.status==='FINISHED')return withDiagnostic({...base,state:'MATCH_FINISHED',reason:null});
  if(['LIVE','HALFTIME'].includes(fixture.status)||now>=Date.parse(fixture.kickoff))return withDiagnostic({...base,state:'MATCH_STARTED',reason:null});
  if(fixture.status!=='SCHEDULED')return withDiagnostic({...base,state:'CLOSED',reason:null});
  const matches=matchingQuotes(selection,read.snapshot,bookmaker);
  if(!matches.length)return absentQuote(selection,read,bookmaker,withDiagnostic(base));
  const evaluated=matches.map(quote=>evaluatedQuote(selection,read,quote,now,withDiagnostic(base)));
  const current=evaluated.filter(quote=>quote.state==='CURRENT'&&quote.decimalOdds);
  if(current.length){
    const prices=new Set(current.map(quote=>quote.decimalOdds));
    if(prices.size!==1)return withDiagnostic({...base,reason:'INVALID_QUOTE'});
    return current.reduce((best,quote)=>Date.parse(quote.expiresAt??'')>=Date.parse(best.expiresAt??'')?quote:best);
  }
  return evaluated.find(quote=>quote.reason==='INVALID_QUOTE')??evaluated[0]??withDiagnostic(base);
}

function summarize(config:BookmakerConfig,quotes:SelectionQuote[]):BookmakerSlip {
  const available=quotes.filter(q=>q.state==='CURRENT'&&q.decimalOdds!==null).length;
  const realSelectionCount=quotes.filter(q=>q.state==='CURRENT'&&q.decimalOdds!==null&&q.priceKind==='REAL').length;
  const proxySelectionCount=quotes.filter(q=>q.state==='CURRENT'&&q.decimalOdds!==null&&q.priceKind==='PROXY').length;
  const combined=available===quotes.length?multiplyDecimalOdds(quotes.map(q=>q.decimalOdds!)):null;
  const complete=quotes.length>0&&available===quotes.length&&combined!==null;
  const affiliate=config.affiliateEligibility.approved&&config.affiliateEligibility.destinationConfigured;
  return {...config,priceClassification:complete?(proxySelectionCount?'ESTIMATED_COMPLETE':'REAL_COMPLETE'):'INCOMPLETE',requiredSelectionCount:quotes.length,availableSelectionCount:available,realSelectionCount,proxySelectionCount,
    missingSelections:quotes.filter(q=>q.state==='UNAVAILABLE'&&q.reason!=='INVALID_QUOTE'),
    invalidSelections:quotes.filter(q=>q.state!=='CURRENT'&&(q.state!=='UNAVAILABLE'||q.reason==='INVALID_QUOTE')),
    complete,estimated:proxySelectionCount>0,availabilityState:bookmakerAvailabilityState(quotes,complete),selectionQuotes:quotes,combinedDecimalOdds:complete?combined:null,best:false,tiedBest:false,
    ctaState:!complete?'INCOMPLETE':affiliate?'ENABLED':'AFFILIATE_UNAVAILABLE',outboundCapability:affiliate?(config.affiliateEligibility.destinationType??'HOMEPAGE'):'NONE'};
}
function finish(locale:SiteLocale,count:number,bookmakers:BookmakerSlip[],generatedAt=new Date().toISOString()):SlipComparison {
  const complete=bookmakers.filter(b=>b.complete);
  const realComplete=complete.filter(b=>!b.estimated);
  if(realComplete.length>=1){const highest=realComplete.reduce((a,b)=>compareDecimal(a.combinedDecimalOdds!,b.combinedDecimalOdds!)>=0?a:b).combinedDecimalOdds!;
    const winners=realComplete.filter(b=>compareDecimal(b.combinedDecimalOdds!,highest)===0);
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
  return {version:1,locale,states,bookmakers,expiresAt:times.length?new Date(Math.min(...times)).toISOString():null,generatedAt};
}
function eligibleBookmaker(b:BookmakerConfig){
  return b.geoEligibility.eligible&&isVisibleBookmaker(b.bookmakerId);
}
export function buildSlipComparison(selections:CanonicalSelection[],locale:SiteLocale,fixtures:Map<string,SlipFixtureRead>,configs:BookmakerConfig[],now=Date.now()):SlipComparison {
  const eligible=configs.filter(eligibleBookmaker).sort((a,b)=>bookmakerConfig(a.bookmakerId)!.displayOrder-bookmakerConfig(b.bookmakerId)!.displayOrder);
  const sourceQuotes=new Map(BOOKMAKER_REGISTRY.map(book=>[book.canonicalId as string,selections.map(s=>selectionQuote(s,fixtures.get(s.fixturePublicId)??null,book.canonicalId,now))]));
  const native=selections.length?eligible.map(config=>({config,quotes:sourceQuotes.get(config.bookmakerId)!})):[];
  const withProxies=native.map(({config,quotes})=>({config,quotes:quotes.map((targetQuote,selectionIndex)=>{
    if(targetQuote.state==='CURRENT')return targetQuote;
    const source=resolveInsurance(config.bookmakerId,[...sourceQuotes].map(([bookmaker,quotes])=>({bookmaker,
      current:quotes[selectionIndex].state==='CURRENT',priceKind:quotes[selectionIndex].priceKind,
      decimalOdds:quotes[selectionIndex].decimalOdds,value:quotes[selectionIndex]}))).candidate?.value;
    if(!source?.decimalOdds||!source.sourceBookmakerId||!source.sourceBookmakerName||!source.sourceQuoteId||!source.sourceObservedAt)return targetQuote;
    return withDiagnostic({...targetQuote,state:'CURRENT',reason:null,decimalOdds:source.decimalOdds,expiresAt:source.expiresAt,closesAt:source.closesAt,priceKind:'PROXY',sourceBookmakerId:source.sourceBookmakerId,sourceBookmakerName:source.sourceBookmakerName,sourceQuoteId:source.sourceQuoteId,sourceObservedAt:source.sourceObservedAt},'PROXY_QUOTE');
  })}));
  const bookmakers=withProxies.map(({config,quotes})=>summarize(config,quotes));
  return finish(locale,selections.length,bookmakers,new Date(now).toISOString());
}
export function guardSlipComparison(value:SlipComparison,count:number,now:number,connected=true):SlipComparison {
  return finish(value.locale,count,value.bookmakers.filter(eligibleBookmaker).map(b=>summarize(b,b.selectionQuotes.map(q=>{
    if(q.state==='MATCH_FINISHED')return withDiagnostic({...q,decimalOdds:null},'MATCH_FINISHED');
    if(q.closesAt&&now>=Date.parse(q.closesAt))return withDiagnostic({...q,state:'MATCH_STARTED',decimalOdds:null},'MATCH_STARTED');
    if(q.decimalOdds&&(!connected||!Number.isFinite(Date.parse(q.expiresAt??''))||now>=Date.parse(q.expiresAt!)))return withDiagnostic({...q,state:'STALE',decimalOdds:null},'STALE_QUOTE');
    if(q.decimalOdds&&!validDecimalOdds(q.decimalOdds))return withDiagnostic({...q,state:'UNAVAILABLE',decimalOdds:null,reason:'INVALID_QUOTE'});
    return withDiagnostic(q);
  }))),value.generatedAt??new Date(now).toISOString());
}
