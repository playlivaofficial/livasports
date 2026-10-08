'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {OddsComparison,OddsMarket,OddsCell} from '@/odds/types';
import {SELECTIONS} from '@/odds/types';
import {emitMatchEvent,type MatchEventContext} from './events';
import {addSlipSelection,useSlip} from '@/slip/client';
import {canonicalSelection,selectionKey,SLIP_SCOPE} from '@/slip/types';
import {slipCopy,selectionLabel} from '@/slip/localization';
import {AffiliateLink,commercialCopy} from '@/components/commercial/AffiliateLink';
import {bookmakerShortName} from '@/slip/comparison-copy';
import {ApproximatePrice} from '@/components/odds/ApproximatePrice';
import {BookmakerLogo} from '@/components/odds/BookmakerLogo';
import type {BookmakerId} from '@/odds/registry';
import {withSpanishLocales} from '@/localization/spanish';
import {geoForLocale,geoProfile,isSpanishLocale,type GeoLocale} from '@/config/geo';
import {isSiteLocale,type SiteLocale} from '@/config/i18n';
import {ReferenceOdds} from '@/components/odds/ReferenceOdds';
import {UnpricedSelections} from '@/components/odds/UnpricedSelections';
import {currentReferences} from '@/odds/display';

const copy=withSpanishLocales({
  br:{title:'Compare as odds',pregame:'Pré-jogo · 90 minutos',markets:{MATCH_WINNER:'Resultado final',TOTAL_GOALS:'Gols · 2,5',BTTS:'Ambas marcam'},
    outcomes:{HOME:'1',DRAW:'X',AWAY:'2',OVER:'Mais de 2,5',UNDER:'Menos de 2,5',YES:'Sim',NO:'Não'},house:'Casa',action:'Ação',visit:'Ver odds',best:'Melhor odd',
    empty:'Odds ainda não disponíveis para esta partida.',stale:'Odds desatualizadas — aguardando nova verificação.',closed:'As odds pré-jogo não estão mais disponíveis.',suspended:'Mercado temporariamente suspenso.',
    observed:'Verificado em',changed:'Última mudança informada',single:'Uma casa disponível neste mercado.',responsible:'18+. Aposte com responsabilidade.',disclosure:'Podemos receber comissão pelos links de parceiros. Isso não altera a ordem das odds.'},
  mx:{title:'Compara las cuotas',pregame:'Prepartido · 90 minutos',markets:{MATCH_WINNER:'Resultado final',TOTAL_GOALS:'Goles · 2.5',BTTS:'Ambos anotan'},
    outcomes:{HOME:'1',DRAW:'X',AWAY:'2',OVER:'Más de 2.5',UNDER:'Menos de 2.5',YES:'Sí',NO:'No'},house:'Casa',action:'Acción',visit:'Ver cuotas',best:'Mejor cuota',
    empty:'Las cuotas aún no están disponibles para este partido.',stale:'Cuotas desactualizadas — pendientes de verificación.',closed:'Las cuotas prepartido ya no están disponibles.',suspended:'Mercado suspendido temporalmente.',
    observed:'Verificado el',changed:'Último cambio informado',single:'Una casa disponible en este mercado.',responsible:'18+. Apuesta con responsabilidad.',disclosure:'Podemos recibir una comisión por enlaces de socios. Esto no cambia el orden de las cuotas.'},
  en:{title:'Compare odds',pregame:'Pregame · 90 minutes',markets:{MATCH_WINNER:'Full-time result',TOTAL_GOALS:'Goals · 2.5',BTTS:'Both teams to score'},
    outcomes:{HOME:'1',DRAW:'X',AWAY:'2',OVER:'Over 2.5',UNDER:'Under 2.5',YES:'Yes',NO:'No'},house:'Bookmaker',action:'Action',visit:'View odds',best:'Best price',
    empty:'Odds are not available for this match yet.',stale:'Odds are out of date — waiting for a new check.',closed:'Pregame odds are no longer available.',suspended:'Market temporarily suspended.',
    observed:'Checked at',changed:'Last reported change',single:'One bookmaker available in this market.',responsible:'18+. Gamble responsibly.',disclosure:'We may receive a commission from partner links. That does not change the order of the odds.'},
});
export function PregameOdds({initial,context,fixturePublicId,uiLocale}:{initial:OddsComparison[];context:MatchEventContext;fixturePublicId?:string;uiLocale?:GeoLocale}){
  const saved=useSlip();const presentation=uiLocale??context.locale;
  // A cached SEO shell never chooses a visitor's commercial country. The private
  // odds response supplies it only after the existing trusted-GEO gate succeeds.
  const [resolvedCommercialLocale,setResolvedCommercialLocale]=useState<SiteLocale|null>(null);
  const commercialLocale=resolvedCommercialLocale??context.locale;
  const slipText=slipCopy[presentation];
  const [comparisons,setComparisons]=useState(initial);const [market,setMarket]=useState<OddsMarket>('MATCH_WINNER');
  const [clock,setClock]=useState<number|null>(null);const root=useRef<HTMLElement>(null);const visible=useRef(false);
  const text=copy[presentation];const selected=comparisons.find(c=>c.market===market);const sent=useRef(new Set<string>());
  const selectedMarket=useRef(market);
  const [commercial,setCommercial]=useState<Record<string,boolean>>({});
  const onAvailability=useCallback((bookmaker:string,available:boolean)=>setCommercial(current=>current[bookmaker]===available?current:{...current,[bookmaker]:available}),[]);
  useEffect(()=>{
    let stopped=false;let inFlight=false;let lastAttempt=0;const abort=new AbortController();
    const tick=()=>setClock(Date.now());
    async function refresh(){if(stopped||inFlight||!navigator.onLine||!visible.current||document.visibilityState!=='visible'||Date.now()-lastAttempt<60000)return;
      inFlight=true;lastAttempt=Date.now();tick();try{const response=await fetch(`/api/odds/${context.fixtureId}?locale=${presentation}`,{cache:'no-store',signal:abort.signal});
        if(response.ok){const body=await response.json();if(!stopped&&Array.isArray(body.comparisons)){
          setComparisons(body.comparisons);
          setResolvedCommercialLocale(isSiteLocale(body.commercialLocale)?body.commercialLocale:null);
        }}
      }catch{/* Expiry still applies when refresh is unavailable. */}finally{inFlight=false;}}
    const observe=(entries:IntersectionObserverEntry[])=>{visible.current=entries.some(e=>e.isIntersecting);if(visible.current){
      if(!sent.current.has('module')){sent.current.add('module');emitMatchEvent('odds_module_view',context,'match_odds');}
      if(!sent.current.has(selectedMarket.current)){sent.current.add(selectedMarket.current);emitMatchEvent('odds_market_view',context,'match_odds',{market:selectedMarket.current});}
      void refresh();}};
    const observer=new IntersectionObserver(observe,{threshold:0.15});if(root.current)observer.observe(root.current);
    const timer=window.setInterval(tick,1000);const refreshTimer=window.setInterval(()=>void refresh(),60000);
    const focus=()=>{tick();void refresh();};document.addEventListener('visibilitychange',focus);window.addEventListener('pageshow',focus);
    return()=>{stopped=true;abort.abort();observer.disconnect();clearInterval(timer);clearInterval(refreshTimer);document.removeEventListener('visibilitychange',focus);window.removeEventListener('pageshow',focus);};
  },[context.fixtureId,context.locale,context.competitionId,context,presentation]);
  const cellCurrent=(cell:OddsCell)=>cell.decimalOdds!==null&&cell.expiresAt!==null&&(clock===null||clock<Date.parse(cell.expiresAt));
  const available=selected?.rows.filter(r=>r.cells.some(cellCurrent)).length??0;
  const references=currentReferences(selected?.references,clock??Number.POSITIVE_INFINITY);
  const anyExpired=selected?.rows.some(r=>r.cells.some(c=>c.state==='STALE'||(c.decimalOdds!==null&&!cellCurrent(c))));
  const allClosed=selected?.rows.length&&selected.rows.every(r=>r.cells.every(c=>c.state==='CLOSED'||c.state==='UNAVAILABLE'));
  const pastKickoff=clock!==null&&selected?.closesAt&&clock>=Date.parse(selected.closesAt);
  const unavailable=allClosed||pastKickoff?text.closed:anyExpired?text.stale:selected?.rows.some(r=>r.cells.some(c=>c.state==='SUSPENDED'))?text.suspended:text.empty;
  const approximateLabel=presentation==='br'?'preço aproximado':isSpanishLocale(presentation)?'cuota aproximada':'approximate price';
  function select(next:OddsMarket){selectedMarket.current=next;setMarket(next);if(!sent.current.has(next)){sent.current.add(next);emitMatchEvent('odds_market_view',context,'match_odds',{market:next});}}
  return <section id="odds" ref={root} className="match-panel commercial-panel pregame-odds" aria-label={text.title}>
    <div className="odds-title"><div><h2>{text.title}</h2><p>{text.pregame}</p></div><span className="age-label">18+</span></div>
    <div className="odds-market-tabs" role="tablist" aria-label={text.title}>{(Object.keys(SELECTIONS) as OddsMarket[]).map((key,index,keys)=><button type="button" role="tab" key={key} id={`odds-tab-${key}`} aria-controls="odds-market-panel" aria-selected={key===market} tabIndex={key===market?0:-1} onClick={()=>select(key)} onKeyDown={event=>{
      const next=event.key==='ArrowRight'?keys[(index+1)%keys.length]:event.key==='ArrowLeft'?keys[(index+keys.length-1)%keys.length]:event.key==='Home'?keys[0]:event.key==='End'?keys.at(-1):null;
      if(next){event.preventDefault();select(next);document.getElementById(`odds-tab-${next}`)?.focus();}
    }}>{text.markets[key]}</button>)}</div>
    <div role="tabpanel" id="odds-market-panel" aria-labelledby={`odds-tab-${market}`}>
      {selected?.rows.length?<table className="pregame-table"><thead><tr><th scope="col">{text.house}</th>{SELECTIONS[market].map(outcome=><th scope="col" key={outcome}>{text.outcomes[outcome]}</th>)}<th scope="col">{text.action}</th></tr></thead>
        <tbody>{selected.rows.map(row=><tr key={row.bookmaker}><th scope="row"><BookmakerLogo bookmaker={row.bookmaker} uiLocale={presentation} sources={row.cells} context={fixturePublicId?{locale:commercialLocale,placement:'match_odds_table',bookmaker:row.bookmaker as BookmakerId,fixturePublicId,market}:undefined}/></th>{row.cells.map(cell=>{
          const current=cellCurrent(cell);const best=current&&cell.best&&selected.rows.filter(r=>r.cells.some(c=>c.outcome===cell.outcome&&cellCurrent(c))).length>=2;
          const intent=canonicalSelection({fixturePublicId,market,outcome:cell.outcome,line:selected.line,scope:SLIP_SCOPE});
          const pressed=intent?saved.slip.selections.some(s=>selectionKey(s)===selectionKey(intent)):false;
          const priceLabel=current?new Intl.NumberFormat(geoProfile(geoForLocale(presentation)).languageTag,{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(cell.decimalOdds)):'—';
          return <td key={cell.outcome} data-outcome-label={text.outcomes[cell.outcome]}>{current&&intent?<button type="button" className={`pregame-price slip-odds-button${best?' is-best':''}`} aria-pressed={pressed} disabled={!saved.ready}
            data-target-bookmaker={cell.targetBookmaker}
            aria-label={`${pressed?slipText.selected:slipText.add}: ${slipText.markets[market]}, ${selectionLabel(intent,presentation)}, ${priceLabel}, ${cell.priceKind==='PROXY'?approximateLabel:''} ${row.name}`}
            onClick={()=>addSlipSelection(intent,commercialLocale,cell.expiresAt!,row.bookmaker,{targetBookmaker:cell.targetBookmaker,priceKind:cell.priceKind!})}>{pressed?<span className="slip-selected-indicator" aria-hidden="true">✓</span>:null}{cell.priceKind==='PROXY'?<ApproximatePrice value={priceLabel} label={approximateLabel}/>:<strong data-price-kind="REAL">{priceLabel}</strong>}{best?<span className="sr-only"> {text.best}</span>:null}</button>:
            <span className={`pregame-price${best?' is-best':''}${!current?' is-unavailable':''}`} title={best?text.best:!current?unavailable:undefined}>{current?(cell.priceKind==='PROXY'?<ApproximatePrice value={priceLabel} label={approximateLabel}/>:<strong data-price-kind="REAL">{priceLabel}</strong>):priceLabel}{best?<span className="sr-only"> {text.best}</span>:null}</span>}</td>;})}
          <td>{row.action&&row.cells.some(cellCurrent)&&fixturePublicId?<AffiliateLink compact className="match-affiliate-cta" uiLocale={presentation} onAvailability={onAvailability} context={{locale:commercialLocale,placement:'match_odds_table',bookmaker:row.bookmaker as 'betsson'|'betano.bet.br',fixturePublicId,market}}>{commercialCopy[presentation].ctaAt(bookmakerShortName(row.bookmaker,row.name))} <span aria-hidden="true">↗</span></AffiliateLink>:<span className="odds-no-action">—</span>}</td></tr>)}</tbody></table>:null}
      {!available?<p className="pregame-empty" role="status">{unavailable}</p>:available===1?<p className="odds-note">{text.single}</p>:null}
      {references.length?<ReferenceOdds quotes={references} fixturePublicId={fixturePublicId} locale={resolvedCommercialLocale} uiLocale={presentation}/>:null}
      {!available&&!references.length?<UnpricedSelections fixturePublicId={fixturePublicId} kickoff={selected?.closesAt} market={market} locale={resolvedCommercialLocale} uiLocale={presentation}/>:null}
      <p className="odds-note">{slipText.oddsMayChange}</p>
    </div>
    {Object.values(commercial).some(Boolean)?<p className="affiliate-disclosure">{commercialCopy[presentation].destination} {commercialCopy[presentation].disclosure}</p>:null}
    <p className="affiliate-disclosure">{text.responsible}</p>
  </section>;
}
