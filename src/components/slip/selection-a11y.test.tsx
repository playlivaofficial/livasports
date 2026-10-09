import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PregameOdds} from '@/components/match/PregameOdds';
import type {OddsComparison} from '@/odds/types';
const view:OddsComparison={market:'MATCH_WINNER',line:null,eligiblePrices:1,expiresAt:'2030-01-01T12:15:00Z',observedAt:'2030-01-01T12:00:00Z',providerUpdatedAt:'2030-01-01T12:00:00Z',closesAt:'2030-01-01T13:00:00Z',
  rows:[{bookmaker:'betano.bet.br',name:'Betano BR',action:null,cells:[{outcome:'HOME',decimalOdds:'2.5',state:'ACTIVE',best:false,expiresAt:'2030-01-01T12:15:00Z',priceKind:'REAL',targetBookmaker:'betano.bet.br',sourceBookmaker:'betano.bet.br',sourceBookmakerName:'Betano BR',sourceQuoteId:'quote-1',sourceObservedAt:'2030-01-01T12:00:00Z'}]}]};
describe('semantic odds selection',()=>{
  it.each(['br','mx','co','pe','en'] as const)('does not unlock prices before the hydration-time clock check in %s', locale=>{
    const html=renderToStaticMarkup(<PregameOdds fixturePublicId="1111111111111111" uiLocale={locale} initial={[view]} context={{fixtureId:'test',competitionId:'test',locale:locale==='en'?'co':locale}}/>);
    expect(html).not.toContain('slip-odds-button');expect(html).not.toContain('Guardar sin cuota');
    expect(html).not.toContain('/go/');expect(html).not.toContain('Place bet');
  });
  it.each(['STALE','SUSPENDED','CLOSED'] as const)('does not create selectable %s prices',state=>{
    const unavailable={...view,rows:view.rows.map(r=>({...r,cells:r.cells.map(c=>({...c,state,decimalOdds:null}))}))};
    const html=renderToStaticMarkup(<PregameOdds fixturePublicId="1111111111111111" initial={[unavailable]} context={{fixtureId:'test',competitionId:'test',locale:'br'}}/>);
    expect(html).not.toContain('slip-odds-button');
  });
});
