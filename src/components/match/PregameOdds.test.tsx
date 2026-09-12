import {describe,it,expect,vi} from 'vitest';
vi.mock('@/affiliate/client',async()=>{const {displayOffer}=await import('@/affiliate/fixtures.test-support');return {useCommercialOffer:()=>displayOffer(),privacyOptOut:()=>false,qaBrowser:()=>true};});
import {renderToStaticMarkup} from 'react-dom/server';
import {PregameOdds} from './PregameOdds';
import type {OddsComparison} from '@/odds/types';
const view:OddsComparison={market:'MATCH_WINNER',line:null,expiresAt:'2026-10-01T18:15:00Z',
  closesAt:'2026-10-01T19:00:00Z',rows:[{bookmaker:'betsson',name:'Betsson',action:'/go/betsson?placement=match-odds',cells:[
    {outcome:'HOME',decimalOdds:'2.5',best:false,state:'ACTIVE',expiresAt:'2026-10-01T18:15:00Z'}]}],
  eligiblePrices:1,observedAt:'2026-10-01T18:00:00Z',providerUpdatedAt:'2026-10-01T17:59:00Z'};
describe('restrained commercial odds rendering',()=>{
  it('uses localized approved wording and sponsored markup for a server-approved action',()=>{
    for(const [locale,label] of [['br','Ver odds'],['mx','Ver cuotas']] as const){
      const html=renderToStaticMarkup(<PregameOdds initial={[view]} fixturePublicId="aaaaaaaaaaaaaaaa" context={{fixtureId:'test-only',competitionId:'test',locale}}/>);
      expect(html).toContain('rel="sponsored nofollow noopener noreferrer"');expect(html).toContain(label);expect(html).toContain('18+');
    }
  });
  it('does not show a link or affiliate commission disclosure without an approved action',()=>{
    const html=renderToStaticMarkup(<PregameOdds initial={[{...view,rows:view.rows.map(r=>({...r,action:null}))}]} context={{fixtureId:'test-only',competitionId:'test',locale:'br'}}/>);
    expect(html).not.toContain('/go/');expect(html).not.toContain('Podemos receber');expect(html).toContain('18+');
  });
});
