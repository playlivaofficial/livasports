import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {parseContext} from './policy';
import {resolveOffer} from './service';
import {campaign,dependencies} from './fixtures.test-support';
import type {Campaign,CommercialContext} from './types';

/**
 * A bookmaker's logo on an odds board or slip comparison is a brand link. It used to resolve only
 * when that book held a current price for the fixture, so Peru's 1xBet and Mexico's Winpot logos went
 * dead wherever they had no live price while priced books' logos linked. The logo now resolves on the
 * book's approved campaign alone; the price CTA ("Ver cuotas en ...") keeps its price requirement.
 */
const now=Date.now();
const unpriced=(c:Campaign)=>({...dependencies(c),pricing:async()=>null});
const odds=(over:Partial<CommercialContext>={}):CommercialContext=>({locale:'pe',pagePath:'/pe/partido/a-x-b-0123456789abcdef',placement:'match_odds_table',
  bookmaker:'1xbet',fixturePublicId:'0123456789abcdef',market:'MATCH_WINNER',...over});
const peOneXBet=():Campaign=>({...campaign(now),bookmaker:'1xbet',locale:'pe',destination:'https://1xaff.pe/L?tag=synthetic&site=1&ad=2',destinationType:'SPORTSBOOK',
  domains:['1xaff.pe'],operatorDomains:['1xbet.pe','1xaff.pe'],placements:['match_odds_table','slip_bookmaker_comparison']});
const mxWinpot=():Campaign=>({...campaign(now),bookmaker:'winpot.mx',locale:'mx',destination:'https://record.affiliatesworld.com/_SyntheticWinpotToken0000/1/',destinationType:'SPORTSBOOK',
  domains:['record.affiliatesworld.com'],operatorDomains:['winpot.mx','record.affiliatesworld.com'],placements:['match_odds_table','slip_bookmaker_comparison']});

describe('bookmaker logo CTA',()=>{
  it.each([['1xBet Peru',peOneXBet,odds()],['Winpot Mexico',mxWinpot,odds({locale:'mx',pagePath:'/mx/partido/a-x-b-0123456789abcdef',bookmaker:'winpot.mx'})]] as const)(
    'resolves the %s logo through its approved campaign without a current price',async(_label,make,context)=>{
      const c=make();
      expect((await resolveOffer({...context,cta:'logo'},unpriced(c),now))?.campaign.bookmaker).toBe(c.bookmaker);
      // The price CTA for the same book and fixture still needs a live price.
      expect(await resolveOffer(context,unpriced(c),now)).toBeNull();
    });
  it('keeps a slip logo live even when that book cannot price the whole slip',async()=>{
    const c=peOneXBet();
    const slip=parseContext({locale:'pe',pagePath:'/pe',placement:'slip_bookmaker_comparison',bookmaker:'1xbet',cta:'logo',
      selections:[{fixturePublicId:'0123456789abcdef',market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION'}]});
    expect(slip).not.toBeNull();
    expect((await resolveOffer(slip!,unpriced(c),now))?.campaign.bookmaker).toBe('1xbet');
  });
  it('still enforces GEO, campaign and validity for a logo',async()=>{
    // Another jurisdiction's campaign never answers a Peru logo.
    expect(await resolveOffer({...odds(),cta:'logo'},unpriced(mxWinpot()),now)).toBeNull();
    // A campaign that does not allow the placement, or has expired, stays dark.
    expect(await resolveOffer({...odds(),cta:'logo'},unpriced({...peOneXBet(),placements:['slip_bookmaker_comparison']}),now)).toBeNull();
    expect(await resolveOffer({...odds(),cta:'logo'},unpriced({...peOneXBet(),endsAt:new Date(now-1000).toISOString()}),now)).toBeNull();
  });
  it('admits the logo marker only on a named bookmaker\'s odds or slip CTA',()=>{
    expect(parseContext({...odds(),cta:'logo'})).not.toBeNull();
    expect(parseContext({...odds(),cta:'banner'})).toBeNull();
    expect(parseContext({locale:'pe',pagePath:'/pe',placement:'home_top_banner',cta:'logo'})).toBeNull();
    const anonymous:Partial<CommercialContext>=odds();delete anonymous.bookmaker;
    expect(parseContext({...anonymous,cta:'logo'})).toBeNull();
  });
  it('is requested by every logo, and no board withholds it from an unpriced book',()=>{
    expect(readFileSync('src/components/odds/BookmakerLogo.tsx','utf8')).toContain("cta:'logo'");
    expect(readFileSync('src/components/sports/OddsComparison.tsx','utf8')).not.toMatch(/context=\{priced&&/);
    expect(readFileSync('src/components/slip/SlipComparison.tsx','utf8')).not.toMatch(/context=\{b\.complete\?/);
  });
});
