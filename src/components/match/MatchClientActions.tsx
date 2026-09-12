'use client';

import { useEffect, useRef, useState } from 'react';
import {emitMatchEvent as emit,type MatchEventContext as Context} from './events';

export function MatchClientActions({ context, canonicalUrl, shareText, labels }: {
  context: Context; canonicalUrl: string; shareText: string; labels: { share: string; copied: string };
}) {
  const [copied, setCopied] = useState(false);
  const oddsRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    emit('match_open', context, 'match_header');
  }, [context]);

  async function share() {
    emit('match_share', context, 'match_header');
    if (navigator.share) await navigator.share({ title: shareText, text: shareText, url: canonicalUrl }).catch(() => undefined);
    else { await navigator.clipboard.writeText(canonicalUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  }

  return <div className="match-actions">
    <button type="button" className="match-share" onClick={share}>{copied ? labels.copied : labels.share}</button>
    <span ref={oddsRef} className="sr-only" aria-live="polite">{copied ? labels.copied : ''}</span>
  </div>;
}

export function MatchSectionNav({ context, items }: { context: Context; items: Array<{ href: string; label: string }> }) {
  return <nav className="match-tabs" aria-label={context.locale === 'br' ? 'Seções da partida' : 'Secciones del partido'}>
    {items.map(item => <a key={item.href} href={item.href} onClick={() => emit('match_tab_view', context, item.href.slice(1))}>{item.label}</a>)}
  </nav>;
}
