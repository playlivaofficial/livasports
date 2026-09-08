'use client';

import { useEffect, useRef, useState } from 'react';

type EventName = 'match_open' | 'match_tab_view' | 'odds_module_view' | 'match_share';
interface Context { fixtureId: string; competitionId: string; locale: 'br' | 'mx'; }

function emit(name: EventName, context: Context, placement?: string): void {
  const key = `ls:${name}:${context.fixtureId}:${placement ?? ''}`;
  const now = Date.now();
  const previous = Number(sessionStorage.getItem(key) ?? 0);
  if (now - previous < 10_000) return;
  sessionStorage.setItem(key, String(now));
  void fetch('/api/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: crypto.randomUUID(), eventName: name, ...context, placement: placement ?? null }) }).catch(() => undefined);
}

export function MatchClientActions({ context, canonicalUrl, shareText, labels }: {
  context: Context; canonicalUrl: string; shareText: string; labels: { share: string; copied: string };
}) {
  const [copied, setCopied] = useState(false);
  const oddsRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    emit('match_open', context, 'match_header');
    const odds = document.getElementById('odds');
    if (!odds) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) emit('odds_module_view', context, 'match_odds'); }, { threshold: 0.35 });
    observer.observe(odds); return () => observer.disconnect();
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
