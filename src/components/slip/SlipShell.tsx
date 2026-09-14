'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
import type {SiteLocale} from '@/config/i18n';
import {interfaceRoutes,matchPath} from '@/localization/interface';
import {FEEDBACK_EVENT,feedback,setSlipStake,slipStore,useSlip,type SlipFeedback} from '@/slip/client';
import {STORAGE_KEY,type StorageNotice} from '@/slip/state';
import {selectionKey,SLIP_LIMIT,type SavedSelection} from '@/slip/types';
import {selectionLabel,slipCopy,type SlipUiLocale} from '@/slip/localization';
import {emitSlipEvent} from '@/slip/events';
import {resolvedByKey,useSlipResolution} from '@/slip/use-resolution';
import {SlipComparison} from './SlipComparison';
import {comparisonCopy} from '@/slip/comparison-copy';
import {formatMoney,formatSlipOdds,parseStake,potentialReturn} from '@/slip/decimal';
import {shareSlipImage,slipSharePayload} from '@/slip/share-card';

function TicketIcon(){return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h14v6a3 3 0 0 0 0 6v6l-3-2-4 2-4-2-3 2v-6a3 3 0 0 0 0-6V3Z" stroke="currentColor" strokeWidth="1.5"/><path d="M9 8h6M9 12h6M9 16h3" stroke="currentColor" strokeWidth="1.5"/></svg>;}

function formatPrice(value:string,locale:SlipUiLocale){
  return formatSlipOdds(value,locale);
}

function SlipDrawer({locale,uiLocale,selections,stake,slipId,pending,onPending,onClose,storageNotice,message}:{locale:SiteLocale;uiLocale:SlipUiLocale;selections:SavedSelection[];stake:string;slipId:string;pending:SlipFeedback|null;onPending:(v:SlipFeedback|null)=>void;onClose:()=>void;storageNotice:StorageNotice;message:string|null}){
  const text=slipCopy[uiLocale];const {resolved,comparison,failed,online,checking,resolvedAt}=useSlipResolution(selections,locale);
  const byKey=resolvedByKey(resolved);const [confirmClear,setConfirmClear]=useState(false);const [stakeDraft,setStakeDraft]=useState<string|null>(null);const [sharing,setSharing]=useState(false);
  const closeRef=useRef<HTMLButtonElement>(null);const panel=useRef<HTMLElement>(null);
  const stakeValue=stakeDraft??stake;
  useEffect(()=>{closeRef.current?.focus();const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose();}};
    window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
  },[onClose]);
  useEffect(()=>{const observer=new ResizeObserver(()=>{if(panel.current)document.body.style.setProperty('--slip-panel-height',`${panel.current.getBoundingClientRect().height}px`);});
    if(panel.current)observer.observe(panel.current);return()=>{observer.disconnect();document.body.style.removeProperty('--slip-panel-height');};
  },[]);
  const date=(value:string)=>new Intl.DateTimeFormat(uiLocale==='br'?'pt-BR':uiLocale==='mx'?'es-MX':'en-GB',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:uiLocale==='br'?'America/Sao_Paulo':uiLocale==='mx'?'America/Mexico_City':'UTC'}).format(new Date(value));
  function remove(s:SavedSelection,index:number){
    const result=slipStore.dispatch({type:'remove',key:selectionKey(s)});
    if(result.result==='REMOVED')emitSlipEvent('slip_selection_remove',locale,s);
    requestAnimationFrame(()=>{const buttons=panel.current?.querySelectorAll<HTMLButtonElement>('.slip-remove');(buttons?.[Math.min(index,(buttons?.length??1)-1)]??closeRef.current)?.focus();});
  }
  function clear(){slipStore.dispatch({type:'clear'});setConfirmClear(false);onPending(null);emitSlipEvent('slip_clear',locale);closeRef.current?.focus();}
  function commitStake(){const parsed=parseStake(stakeValue);if(!parsed){feedback({result:'INVALID_STAKE'});setStakeDraft(null);return;}setSlipStake(parsed);setStakeDraft(null);}
  function replace(){
    if(!pending?.selection||!pending.expiresAt||Date.now()>=Date.parse(pending.expiresAt)){feedback({result:'EXPIRED'});onPending(null);return;}
    const result=slipStore.dispatch({type:'replace',selection:pending.selection,expectedKey:pending.expectedKey??'',addedAt:new Date().toISOString()});
    if(result.result==='REPLACE_REQUIRED'){const previous=result.slip.selections.find(s=>s.fixturePublicId===pending.selection!.fixturePublicId&&s.market===pending.selection!.market);onPending({...pending,expectedKey:previous?selectionKey(previous):undefined});return;}
    if(result.result==='REPLACED'||result.result==='ADDED')emitSlipEvent('slip_selection_replace',locale,pending.selection,pending.bookmaker);
    feedback({result:result.result});onPending(null);closeRef.current?.focus();
  }
  const currentCount=resolved.filter(v=>v.price!==null).length;
  const best=comparison?.bookmakers.find(b=>b.best&&b.combinedDecimalOdds);
  const combined=best?.combinedDecimalOdds??comparison?.bookmakers.find(b=>b.combinedDecimalOdds)?.combinedDecimalOdds??null;
  const combinedLabel=combined?formatSlipOdds(combined,uiLocale):null;
  const estimated=combined?potentialReturn(stake,combined):null;
  const estimatedLabel=estimated?formatMoney(estimated,uiLocale):null;
  const browse=uiLocale==='en'?interfaceRoutes.en.football:uiLocale==='mx'?interfaceRoutes.mx.football:interfaceRoutes.br.football;
  return <aside className="slip-panel" ref={panel} role="dialog" aria-modal="false" aria-labelledby="slip-title" aria-describedby="slip-disclaimer" lang={uiLocale==='br'?'pt-BR':uiLocale==='mx'?'es-MX':'en'}>
    <header className="slip-heading"><div><TicketIcon/><h2 id="slip-title">{text.title}</h2><span className="slip-count">{selections.length}</span></div><button type="button" ref={closeRef} className="slip-icon-button" aria-label={text.close} onClick={onClose}>×</button></header>
    {message?<p className="slip-inline-feedback">{message}</p>:null}
    <div className="slip-body">
      {storageNotice?<p className="slip-notice" role="status">{text.notices[storageNotice]}</p>:null}
      {pending?.selection?<section className="slip-confirm" aria-label={text.replace}><strong>{text.replace}</strong><p>{text.replaceQuestion}</p>
        <p>{text.replaceWith}: <b>{text.markets[pending.selection.market]} · {selectionLabel(pending.selection,uiLocale,resolved.find(v=>v.selection.fixturePublicId===pending.selection?.fixturePublicId)?.fixture)}</b></p>
        <div><button type="button" onClick={replace}>{text.replace}</button><button type="button" onClick={()=>{onPending(null);closeRef.current?.focus();}}>{text.cancel}</button></div></section>:null}
      {confirmClear?<section className="slip-confirm" aria-label={text.clear}><strong>{text.clearQuestion}</strong><div><button type="button" onClick={clear}>{text.confirmClear}</button><button type="button" onClick={()=>{setConfirmClear(false);closeRef.current?.focus();}}>{text.cancel}</button></div></section>:null}
      {!selections.length?<div className="slip-empty"><span className="slip-empty-icon"><TicketIcon/></span><h3>{text.emptyTitle}</h3><p>{text.empty}</p><Link href={browse} onClick={onClose}>{text.browse} →</Link></div>:<>
        <div className="slip-summary"><div><span>{selections.length}/{SLIP_LIMIT} {text.selections}</span><small>{text.scope}</small></div><button type="button" onClick={()=>selections.length>1?setConfirmClear(true):clear()}>{text.clear}</button></div>
        <label className="slip-stake"><span>{text.stake}</span>
          <input inputMode="decimal" enterKeyHint="done" autoComplete="off" value={stakeValue} aria-invalid={parseStake(stakeValue)===null} aria-describedby="slip-stake-hint"
            onChange={event=>setStakeDraft(event.target.value)} onBlur={commitStake} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commitStake();}}}/>
          <small id="slip-stake-hint">{text.stakeHint} · {text.oddsMayChange}</small></label>
        {combinedLabel?<p className="slip-totals" role="status"><span>{text.combined}: <b>{combinedLabel}</b></span>{estimatedLabel?<span>{text.potentialReturn}: <b>{estimatedLabel}</b></span>:null}</p>:null}
        <button className="slip-compare-jump" type="button" onClick={()=>{const target=panel.current?.querySelector<HTMLElement>('#slip-comparison');const body=panel.current?.querySelector<HTMLElement>('.slip-body');
          if(target&&body){target.focus({preventScroll:true});body.scrollTo({top:body.scrollTop+target.getBoundingClientRect().top-body.getBoundingClientRect().top-8,behavior:'instant'});}}}>{comparisonCopy[uiLocale].jump}</button>
        {!online||failed?<p className="slip-notice">{!online?text.offline:text.retry}</p>:null}
        <ol className="slip-list">{selections.map((s,index)=>{const view=byKey.get(selectionKey(s));const fixture=view?.fixture;const title=fixture?`${fixture.home} × ${fixture.away}`:text.missing;
          return <li className="slip-item" key={selectionKey(s)} data-selection={selectionKey(s)} data-state={view?.state??'PENDING'}>
            <div className="slip-item-header"><div>{fixture?<Link href={`${matchPath(uiLocale,fixture.publicId,fixture.home,fixture.away)}#odds`} prefetch={false} onClick={()=>{if(window.matchMedia('(max-width:1099px)').matches)onClose();}}>{title}</Link>:<strong>{checking?text.checking:title}</strong>}
              {fixture?<small>{fixture.competition} · <time dateTime={fixture.kickoff}>{date(fixture.kickoff)}</time></small>:null}</div>
              <button type="button" className="slip-remove slip-icon-button" aria-label={`${text.remove}: ${title}, ${selectionLabel(s,uiLocale,fixture)}`} onClick={()=>remove(s,index)}>×</button></div>
            <p className="slip-market">{text.markets[s.market]}</p><div className="slip-pick"><strong>{selectionLabel(s,uiLocale,fixture)}</strong>
              {view?.price&&formatPrice(view.price.decimalOdds,uiLocale)?<strong className="slip-price">{formatPrice(view.price.decimalOdds,uiLocale)}</strong>:null}</div>
            {view?.state==='PRICE_CHANGED'&&view.previousDecimalOdds&&view.price&&formatPrice(view.previousDecimalOdds,uiLocale)&&formatPrice(view.price.decimalOdds,uiLocale)?<p className="slip-reprice">{text.priceUpdated}: {formatPrice(view.previousDecimalOdds,uiLocale)} → {formatPrice(view.price.decimalOdds,uiLocale)}</p>:null}
            <div className={`slip-state${view?.price?' is-current':''}`}><span>{view?text.states[view.state]:checking?text.checking:text.states.UNAVAILABLE}</span>
              {view?.price?<small>{view.price.bookmakerName} · {view.price.best?text.best:text.reference}</small>:view?.reason==='NO_VERIFIED_GEO'?<small>{text.geo}</small>:null}</div>
          </li>;
        })}</ol>
        <SlipComparison locale={locale} uiLocale={uiLocale} selections={selections} value={comparison} checking={checking} stake={stake} slipId={slipId}/>
        {resolvedAt?<p className="slip-verified">{text.updated}: <time dateTime={resolvedAt}>{date(resolvedAt)}</time><br/>{currentCount}/{selections.length} {text.currentCount}</p>:null}
        <button type="button" className="slip-share" disabled={sharing||!selections.length} onClick={async()=>{setSharing(true);await shareSlipImage(slipSharePayload({locale:uiLocale,slipId:slipId||'local',stake,generatedAt:resolvedAt??new Date().toISOString(),selections,resolved,comparison}));setSharing(false);}}>{text.share}</button>
        <p className="slip-comparison-note">{text.shareHint}</p>
      </>}
    </div>
    <footer className="slip-footer"><p id="slip-disclaimer">{text.disclaimer}</p><small>{text.local} · 18+</small></footer>
  </aside>;
}

export function SlipShell(){
  const pathname=usePathname();const segment=pathname?.split('/')[1];const locale:SiteLocale=segment==='mx'?'mx':'br';
  const uiLocale:SlipUiLocale=segment==='en'?'en':segment==='mx'?'mx':'br';
  const outboundUnavailable=useSearchParams().get('slip')==='unavailable';
  const {slip,notice:storageNotice,ready}=useSlip();const text=slipCopy[uiLocale];
  const [open,setOpen]=useState(outboundUnavailable);const [pending,setPending]=useState<SlipFeedback|null>(null);const [notice,setNotice]=useState<string|null>(outboundUnavailable?'OUTBOUND_UNAVAILABLE':null);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{slipStore.reload();const storage=(e:StorageEvent)=>{if(e.key===STORAGE_KEY||e.key===null)slipStore.reload();};
    const action=(e:Event)=>{const value=(e as CustomEvent<SlipFeedback>).detail;
      if(value.result==='REPLACE_REQUIRED'){setNotice(null);setPending(value);setOpen(true);}else setNotice(value.result);
    };
    window.addEventListener('storage',storage);window.addEventListener(FEEDBACK_EVENT,action);return()=>{window.removeEventListener('storage',storage);window.removeEventListener(FEEDBACK_EVENT,action);};
  },[]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),6000);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{document.body.dataset.slipOpen=String(open);return()=>{delete document.body.dataset.slipOpen;};},[open]);
  const close=useCallback(()=>{setOpen(false);setPending(null);requestAnimationFrame(()=>trigger.current?.focus());},[]);
  const message=notice&&notice in text.notices?text.notices[notice as keyof typeof text.notices]:null;
  return <div className="guest-slip" lang={uiLocale==='br'?'pt-BR':uiLocale==='mx'?'es-MX':'en'}>
    <div className="slip-entry"><span className="slip-feedback sr-only" role="status" aria-live="polite">{message}</span>
      <button type="button" className="slip-trigger" ref={trigger} aria-expanded={open} aria-controls="guest-slip-drawer" disabled={!ready} onClick={()=>{if(open)close();else{setNotice(null);setOpen(true);emitSlipEvent('slip_open',locale);}}}>
        <TicketIcon/><span className="slip-trigger-text"><span>{text.title}</span>{message&&!open?<small aria-hidden="true">{message}</small>:null}</span><span className="slip-count">{slip.selections.length}</span><span aria-hidden="true">{open?'⌄':'↑'}</span>
      </button></div>
    <div id="guest-slip-drawer">{open?<SlipDrawer locale={locale} uiLocale={uiLocale} selections={slip.selections} stake={slip.stake} slipId={slip.slipId} pending={pending} onPending={setPending} onClose={close} storageNotice={storageNotice} message={message}/>:null}</div>
  </div>;
}
