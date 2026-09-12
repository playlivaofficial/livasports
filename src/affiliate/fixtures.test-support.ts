// Synthetic local test contracts only. Never imported by production runtime.
import type {Campaign,CommercialContext,PublicOffer} from './types';
import type {OfferDependencies} from './service';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
export const key='local-test-signing-key-not-a-real-secret-0000000000';
export function context():CommercialContext{return {locale:'br',bookmaker:'betsson',pagePath:'/br',placement:'slip_bookmaker_comparison',selections:comparisonFixture(3).selections};}
export function campaign(now=Date.now()):Campaign{return {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',linkId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',operatorCampaignId:'LOCAL_TEST_ONLY',
  bookmaker:'betsson',locale:'br',enabled:true,approved:true,geoEligible:true,affiliateApproved:true,destination:'https://betsson.bet.br/?approved=test-only%2Bvalue&keep=one&keep=two',destinationType:'HOMEPAGE',
  placements:['slip_bookmaker_comparison','match_odds_table','team_inline','mobile_inline'],domains:['betsson.bet.br'],startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+3600000).toISOString(),creatives:[]};}
export function dependencies(c=campaign()):OfferDependencies{return {campaigns:async()=>[c],page:async x=>({pageType:'HOME',pagePath:x.pagePath}),pricing:async()=>Date.now()+60000};}
export function displayOffer(locale:'br'|'mx'='br'):PublicOffer{return {bookmaker:'betsson',placement:'slip_bookmaker_comparison',href:'/go/betsson/slip_bookmaker_comparison?offer=local-test',token:'local-test',
  expiresAt:'2030-01-01T00:05:00.000Z',resolvedAt:'2030-01-01T00:00:00.000Z',destinationType:'HOMEPAGE',creative:null,...(locale==='mx'?{}:{})};}
