import {describe,it,expect,vi} from 'vitest';
vi.mock('@/affiliate/client',async()=>{const {displayOffer}=await import('@/affiliate/fixtures.test-support');return {useCommercialOffer:()=>displayOffer(),privacyOptOut:()=>false,qaBrowser:()=>true};});
import {renderToStaticMarkup} from 'react-dom/server';
import {PregameOdds} from './PregameOdds';
import type {OddsComparison} from '@/odds/types';
import {buildComparison} from '@/odds/comparison';
import type {ReadOddsQuote} from '@/odds/types';
const view:OddsComparison={market:'MATCH_WINNER',line:null,expiresAt:'2026-10-01T18:15:00Z',
  closesAt:'2026-10-01T19:00:00Z',rows:[{bookmaker:'betsson',name:'Betsson',action:'/go/betsson?placement=match-odds',cells:[
    {outcome:'HOME',decimalOdds:'2.5',best:false,state:'ACTIVE',expiresAt:'2026-10-01T18:15:00Z',priceKind:'REAL',targetBookmaker:'betsson',sourceBookmaker:'betsson',sourceBookmakerName:'Betsson',sourceQuoteId:'quote-1',sourceObservedAt:'2026-10-01T18:00:00Z'}]}],
  eligiblePrices:1,observedAt:'2026-10-01T18:00:00Z',providerUpdatedAt:'2026-10-01T17:59:00Z'};
describe('restrained commercial odds rendering',()=>{
  it('uses localized approved wording and sponsored markup for a server-approved action',()=>{
    for(const [locale,label] of [['br','Ver odds'],['mx','Ver cuotas'],['en','View odds']] as const){
      const html=renderToStaticMarkup(<PregameOdds initial={[view]} fixturePublicId="aaaaaaaaaaaaaaaa" uiLocale={locale==='en'?'en':undefined} context={{fixtureId:'test-only',competitionId:'test',locale:locale==='en'?'br':locale}}/>);
      expect(html).toContain('rel="sponsored nofollow noopener noreferrer"');expect(html).toContain(label);expect(html).toContain('18+');
      expect(html).toContain('odds-approx-mark');expect(html).toContain('data-price-kind="REAL"');
    }
  });
  it('does not show a link or affiliate commission disclosure without an approved action',()=>{
    const html=renderToStaticMarkup(<PregameOdds initial={[{...view,rows:view.rows.map(r=>({...r,action:null}))}]} context={{fixtureId:'test-only',competitionId:'test',locale:'br'}}/>);
    expect(html).not.toContain('/go/');expect(html).not.toContain('Podemos receber');expect(html).toContain('18+');
  });
  it('renders both Match Center rows with the same approximate mark from one current source',()=>{
    const now=Date.parse('2026-10-01T18:00:00Z');
    const source:ReadOddsQuote={quoteId:'quote-betano',fixtureId:'fixture',providerFixtureId:'provider',bookmaker:'betano.bet.br',bookmakerId:'book',bookmakerName:'Betano BR',market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'2.92',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:new Date(now).toISOString(),observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString(),providerKickoff:'2026-10-01T19:00:00Z',sourceDomain:'www.betano.bet.br',geoEligible:true};
    const quotes=[source,{...source,quoteId:'quote-draw',outcome:'DRAW' as const,decimalOdds:'3.80'},{...source,quoteId:'quote-away',outcome:'AWAY' as const,decimalOdds:'2.25'}];
    const union=buildComparison({quotes,kickoff:source.providerKickoff,fixtureStatus:'SCHEDULED'},'MATCH_WINNER',now);
    const html=renderToStaticMarkup(<PregameOdds initial={[union]} fixturePublicId="aaaaaaaaaaaaaaaa" context={{fixtureId:'fixture',competitionId:'test',locale:'br'}}/>);
    expect(html.match(/<tr/g)?.length).toBe(3);expect(html.match(/odds-approx-mark/g)?.length).toBe(6);
    expect(html.match(/data-price-kind="REAL"/g)?.length).toBe(3);expect(html.match(/data-price-kind="PROXY"/g)?.length).toBe(3);
    expect(html).toContain('data-target-bookmaker="betsson"');expect(html).toContain('Fonte estimada: Betano BR');
  });
});
