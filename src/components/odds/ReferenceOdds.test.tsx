import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {ReferenceOdds} from './ReferenceOdds';
import type {IndicativeQuote} from '@/odds/types';
const quote:IndicativeQuote={kind:'INDICATIVE',fixtureId:'fixture',providerFixtureId:'provider',market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION',phase:'PREGAME',decimalOdds:'2.15',bookmaker:'bwin',bookmakerName:'bwin',sourceGeo:'CO',sourceDomain:'sports.bwin.com',quoteId:'source-id',observedAt:'2026-10-09T09:00:00Z',providerUpdatedAt:'2026-10-09T09:00:00Z',expiresAt:'2026-10-09T11:00:00Z',affiliateEligible:false,executable:false};
describe('informational inline grid cell',()=>{
 it.each(['mx','co','pe','br','en'] as const)('renders compact attributed non-executable %s copy',uiLocale=>{
  const html=renderToStaticMarkup(<ReferenceOdds quote={quote} uiLocale={uiLocale}/>);
  expect(html).toContain('2.15');expect(html).toContain('bwin');expect(html).toContain('sports.bwin.com');expect(html).toContain('CO');
  expect(html).toContain('data-reference-outcome="HOME"');expect(html).toContain('odds-approx-mark');
  expect(html).not.toMatch(/<section|<button|<a\s|<details|Cuota orientativa|REFERENCE ·|source-id/);
  expect(html).not.toContain('data-target-bookmaker');expect(html).not.toContain('data-price-kind="REAL"');
 });
 it('uses a fixed shared logo artwork size, never conditional availability dimensions',()=>{
  const css=readFileSync('src/app/four-source-odds.css','utf8');
  expect(css).toContain('width:80px; height:26px');expect(css).toContain('object-fit:contain');
  expect(css).not.toMatch(/is-unavailable[^}]*bookmaker-logo/);
  expect(css.match(/\.bookmaker-logo-art\s*\{/g)).toHaveLength(1);
 });
});
