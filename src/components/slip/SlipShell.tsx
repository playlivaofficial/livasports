'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import type {SiteLocale} from '@/config/i18n';
import {matchPath} from '@/match-center/routes';
import {FEEDBACK_EVENT,feedback,slipStore,useSlip,type SlipFeedback} from '@/slip/client';
import {STORAGE_KEY,type StorageNotice} from '@/slip/state';
import {selectionKey,SLIP_LIMIT,type SavedSelection} from '@/slip/types';
import {selectionLabel,slipCopy} from '@/slip/localization';
import {emitSlipEvent} from '@/slip/events';
import {resolvedByKey,useSlipResolution} from '@/slip/use-resolution';

function TicketIcon(){return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h14v6a3 3 0 0 0 0 6v6l-3-2-4 2-4-2-3 2v-6a3 3 0 0 0 0-6V3Z" stroke="currentColor" strokeWidth="1.5"/><path d="M9 8h6M9 12h6M9 16h3" stroke="currentColor" strokeWidth="1.5"/></svg>;}

function SlipDrawer({locale,selections,pending,onPending,onClose,storageNotice,message}:{locale:SiteLocale;selections:SavedSelection[];pending:SlipFeedback|null;onPending:(v:SlipFeedback|null)=>void;onClose:()=>void;storageNotice:StorageNotice;message:string|null}){
  const text=slipCopy[locale];const {resolved,failed,online,checking,resolvedAt}=useSlipResolution(selections,locale);
  const byKey=resolvedByKey(resolved);const [confirmClear,setConfirmClear]=useState(false);
  const closeRef=useRef<HTMLButtonElement>(null);const panel=useRef<HTMLElement>(null);
  useEffect(()=>{closeRef.current?.focus();const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose();}};
    window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
  },[onClose]);
  useEffect(()=>{const observer=new ResizeObserver(()=>{if(panel.current)document.body.style.setProperty('--slip-panel-height',`${panel.current.getBoundingClientRect().height}px`);});
    if(panel.current)observer.observe(panel.current);return()=>{observer.disconnect();document.body.style.removeProperty('--slip-panel-height');};
  },[]);
  const date=(value:string)=>new Intl.DateTimeFormat(locale==='br'?'pt-BR':'es-MX',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:locale==='br'?'America/Sao_Paulo':'America/Mexico_City'}).format(new Date(value));
  function remove(s:SavedSelection,index:number){
    const result=slipStore.dispatch({type:'remove',key:selectionKey(s)});
    if(result.result==='REMOVED')emitSlipEvent('slip_selection_remove',locale,s);
    requestAnimationFrame(()=>{const buttons=panel.current?.querySelectorAll<HTMLButtonElement>('.slip-remove');(buttons?.[Math.min(index,(buttons?.length??1)-1)]??closeRef.current)?.focus();});
  }
  function clear(){slipStore.dispatch({type:'clear'});setConfirmClear(false);onPending(null);emitSlipEvent('slip_clear',locale);closeRef.current?.focus();}
  function replace(){
    if(!pending?.selection||!pending.expiresAt||Date.now()>=Date.parse(pending.expiresAt)){feedback({result:'EXPIRED'});onPending(null);return;}
    const result=slipStore.dispatch({type:'replace',selection:pending.selection,expectedKey:pending.expectedKey??'',addedAt:new Date().toISOString()});
    if(result.result==='REPLACE_REQUIRED'){const previous=result.slip.selections.find(s=>s.fixturePublicId===pending.selection!.fixturePublicId);onPending({...pending,expectedKey:previous?selectionKey(previous):undefined});return;}
    if(result.result==='REPLACED'||result.result==='ADDED')emitSlipEvent('slip_selection_replace',locale,pending.selection,pending.bookmaker);
    feedback({result:result.result});onPending(null);closeRef.current?.focus();
  }
  const currentCount=resolved.filter(v=>v.price!==null).length;
  return <aside className="slip-panel" ref={panel} role="dialog" aria-modal="false" aria-labelledby="slip-title" aria-describedby="slip-disclaimer" lang={locale==='br'?'pt-BR':'es-MX'}>
    <header className="slip-heading"><div><TicketIcon/><h2 id="slip-title">{text.title}</h2><span className="slip-count">{selections.length}</span></div><button type="button" ref={closeRef} className="slip-icon-button" aria-label={text.close} onClick={onClose}>×</button></header>
    {message?<p className="slip-inline-feedback">{message}</p>:null}
    <div className="slip-body">
      {storageNotice?<p className="slip-notice" role="status">{text.notices[storageNotice]}</p>:null}
      {pending?.selection?<section className="slip-confirm" aria-label={text.replace}><strong>{text.replace}</strong><p>{text.replaceQuestion}</p>
        <p>{text.replaceWith}: <b>{text.markets[pending.selection.market]} · {selectionLabel(pending.selection,locale,resolved.find(v=>v.selection.fixturePublicId===pending.selection?.fixturePublicId)?.fixture)}</b></p>
        <div><button type="button" onClick={replace}>{text.replace}</button><button type="button" onClick={()=>{onPending(null);closeRef.current?.focus();}}>{text.cancel}</button></div></section>:null}
      {confirmClear?<section className="slip-confirm" aria-label={text.clear}><strong>{text.clearQuestion}</strong><div><button type="button" onClick={clear}>{text.confirmClear}</button><button type="button" onClick={()=>{setConfirmClear(false);closeRef.current?.focus();}}>{text.cancel}</button></div></section>:null}
      {!selections.length?<div className="slip-empty"><span className="slip-empty-icon"><TicketIcon/></span><h3>{text.emptyTitle}</h3><p>{text.empty}</p><Link href={locale==='br'?'/br/futebol':'/mx/futbol'} onClick={onClose}>{text.browse} →</Link></div>:<>
        <div className="slip-summary"><div><span>{selections.length}/{SLIP_LIMIT} {text.selections}</span><small>{text.scope}</small></div><button type="button" onClick={()=>selections.length>1?setConfirmClear(true):clear()}>{text.clear}</button></div>
        {!online||failed?<p className="slip-notice">{!online?text.offline:text.retry}</p>:null}
        <ol className="slip-list">{selections.map((s,index)=>{const view=byKey.get(selectionKey(s));const fixture=view?.fixture;const title=fixture?`${fixture.home} × ${fixture.away}`:text.missing;
          return <li className="slip-item" key={selectionKey(s)} data-selection={selectionKey(s)} data-state={view?.state??'PENDING'}>
            <div className="slip-item-header"><div>{fixture?<Link href={`${matchPath(locale,fixture.publicId,fixture.home,fixture.away)}#odds`} prefetch={false} onClick={()=>{if(window.matchMedia('(max-width:1099px)').matches)onClose();}}>{title}</Link>:<strong>{checking?text.checking:title}</strong>}
              {fixture?<small>{fixture.competition} · <time dateTime={fixture.kickoff}>{date(fixture.kickoff)}</time></small>:null}</div>
              <button type="button" className="slip-remove slip-icon-button" aria-label={`${text.remove}: ${title}, ${selectionLabel(s,locale,fixture)}`} onClick={()=>remove(s,index)}>×</button></div>
            <p className="slip-market">{text.markets[s.market]}</p><div className="slip-pick"><strong>{selectionLabel(s,locale,fixture)}</strong>
              {view?.price?<strong className="slip-price">{new Intl.NumberFormat(locale==='br'?'pt-BR':'es-MX',{minimumFractionDigits:2,maximumFractionDigits:3}).format(Number(view.price.decimalOdds))}</strong>:<span className="slip-no-price">—</span>}</div>
            <div className={`slip-state${view?.price?' is-current':''}`}><span>{view?text.states[view.state]:checking?text.checking:text.states.UNAVAILABLE}</span>
              {view?.price?<small>{view.price.bookmakerName} · {view.price.best?text.best:text.reference}</small>:view?.reason==='NO_VERIFIED_GEO'?<small>{text.geo}</small>:null}</div>
          </li>;
        })}</ol>
        {resolvedAt?<p className="slip-verified">{text.updated}: <time dateTime={resolvedAt}>{date(resolvedAt)}</time><br/>{currentCount}/{selections.length} {text.currentCount}</p>:null}
      </>}
    </div>
    <footer className="slip-footer"><p id="slip-disclaimer">{text.disclaimer}</p><small>{text.local} · 18+</small></footer>
  </aside>;
}

export function SlipShell(){
  const pathname=usePathname();const locale:SiteLocale=pathname?.split('/')[1]==='mx'?'mx':'br';
  const {slip,notice:storageNotice,ready}=useSlip();const text=slipCopy[locale];
  const [open,setOpen]=useState(false);const [pending,setPending]=useState<SlipFeedback|null>(null);const [notice,setNotice]=useState<string|null>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{slipStore.reload();const storage=(e:StorageEvent)=>{if(e.key===STORAGE_KEY||e.key===null)slipStore.reload();};
    const action=(e:Event)=>{const value=(e as CustomEvent<SlipFeedback>).detail;
      if(value.result==='REPLACE_REQUIRED'){setNotice(null);setPending(value);setOpen(true);}else setNotice(value.result);
    };
    window.addEventListener('storage',storage);window.addEventListener(FEEDBACK_EVENT,action);return()=>{window.removeEventListener('storage',storage);window.removeEventListener(FEEDBACK_EVENT,action);};
  },[]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),6000);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{document.body.dataset.slipOpen=String(open);return()=>{delete document.body.dataset.slipOpen;};},[open]);
  // Stable callback keeps drawer focus from resetting on every price tick/store change.
  const close=useCallback(()=>{setOpen(false);setPending(null);requestAnimationFrame(()=>trigger.current?.focus());},[]);
  const message=notice&&notice in text.notices?text.notices[notice as keyof typeof text.notices]:null;
  return <div className="guest-slip" lang={locale==='br'?'pt-BR':'es-MX'}>
    <div className="slip-entry"><span className="slip-feedback sr-only" role="status" aria-live="polite">{message}</span>
      <button type="button" className="slip-trigger" ref={trigger} aria-expanded={open} aria-controls="guest-slip-drawer" disabled={!ready} onClick={()=>{if(open)close();else{setNotice(null);setOpen(true);emitSlipEvent('slip_open',locale);}}}>
        <TicketIcon/><span className="slip-trigger-text"><span>{text.title}</span>{message&&!open?<small aria-hidden="true">{message}</small>:null}</span><span className="slip-count">{slip.selections.length}</span><span aria-hidden="true">{open?'⌄':'↑'}</span>
      </button></div>
    <div id="guest-slip-drawer">{open?<SlipDrawer locale={locale} selections={slip.selections} pending={pending} onPending={setPending} onClose={close} storageNotice={storageNotice} message={message}/>:null}</div>
  </div>;
}
