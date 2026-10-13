import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const state=vi.hoisted(()=>({now:Date.now(),nulls:0,clockIndex:1,market:'MATCH_WINNER'}));
vi.mock('react',async()=>{
  const actual=await vi.importActual<typeof import('react')>('react');
  return {...actual,useState:(initial:unknown)=>actual.useState(initial===null&&++state.nulls===state.clockIndex?state.now:initial==='MATCH_WINNER'?state.market:initial)};
});
vi.mock('@/slip/client',()=>({useSlip:()=>({ready:true,slip:{selections:[]}}),addSlipSelection:vi.fn()}));
vi.mock('@/affiliate/client',()=>({useCommercialOffer:()=>null,privacyOptOut:()=>false,qaBrowser:()=>true}));
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {OddsComparison} from '@/components/sports/OddsComparison';
import {PregameOdds} from '@/components/match/PregameOdds';
import {buildComparison} from '@/odds/comparison';
import {listingMatchWinnerOdds} from '@/odds/listing';
import {primaryVisibleBookmakers} from '@/odds/fallback-pool';
import {SELECTIONS,type OddsMarket,type OddsReadSnapshot} from '@/odds/types';
import {FixtureStatus} from '@/domain/enums';
import type {FixtureView} from '@/delivery/types';
function snapshot(geo:'MX'|'CO'|'PE',market:OddsMarket,sourceIndex:number):OddsReadSnapshot{
  const pair=primaryVisibleBookmakers(geo),source=pair[sourceIndex],observedAt=new Date(state.now).toISOString(),kickoff=new Date(state.now+3600000).toISOString();
  return {fixtureId:'fixture',kickoff,fixtureStatus:'SCHEDULED',insuranceEnabled:false,referenceGapBookmakers:pair,eligibleBookmakers:pair.map((id,priority)=>({id,name:id,priority})),
    quotes:SELECTIONS[market].map((outcome,i)=>({quoteId:`source-${outcome}`,fixtureId:'fixture',providerFixtureId:'provider',bookmaker:source,bookmakerId:source,bookmakerName:source,
      market,outcome,line:market==='TOTAL_GOALS'?2.5:null,decimalOdds:['1.95','3.40','3.50'][i],scope:'FULL_TIME_REGULATION',phase:'PREGAME',status:'ACTIVE',providerKickoff:kickoff,
      providerUpdatedAt:observedAt,observedAt,persistedAt:observedAt,lastSuccessfulRefreshAt:observedAt,sourceDomain:'test.invalid',geoEligible:true}))};
}
describe('all displayed local numeric cells are indicative slip controls',()=>{
  for(const geo of ['MX','CO','PE'] as const)for(const source of [0,1]){
    it(`${geo}/board/source-${source}: six accessible buttons, three genuine and three approximate`,()=>{
      state.nulls=0;state.clockIndex=1;const s=snapshot(geo,'MATCH_WINNER',source),listing=listingMatchWinnerOdds(s,state.now);
      const fixture:FixtureView={id:'fixture',publicId:'aaaaaaaaaaaaaaaa',homeTeam:'Home',awayTeam:'Away',competition:'League',kickoff:s.kickoff,status:FixtureStatus.SCHEDULED,
        homeScore:null,awayScore:null,freshness:'fresh',...listing};
      const $=load(renderToStaticMarkup(<OddsComparison locale={geo.toLowerCase() as 'mx'|'co'|'pe'} commercialLocale={geo.toLowerCase() as 'mx'|'co'|'pe'} fixture={fixture}/>));
      expect($('button.listing-odds-select')).toHaveLength(6);expect($('button:disabled')).toHaveLength(0);
      expect($('button [data-price-kind="CALCULATED_MINUS_10"]')).toHaveLength(3);expect($('button [data-price-kind="REAL"]')).toHaveLength(3);
      $('.sr-only').remove();expect($('.listing-odds').text()).not.toMatch(/Real|−10%|Estimación/);expect($('.listing-odds').text().match(/≈/g)).toHaveLength(3);
    });
    for(const market of Object.keys(SELECTIONS) as OddsMarket[]){
      it(`${geo}/${market}/source-${source}: all match cells are buttons without price-specific synthetic CTAs`,()=>{
        state.nulls=0;state.clockIndex=2;state.market=market;const s=snapshot(geo,market,source),locale=geo.toLowerCase() as 'mx'|'co'|'pe';
        const $=load(renderToStaticMarkup(<PregameOdds initial={[buildComparison(s,market,state.now)]} fixturePublicId="aaaaaaaaaaaaaaaa" context={{fixtureId:'fixture',competitionId:'test',locale}}/>));
        expect($('button.slip-odds-button')).toHaveLength(SELECTIONS[market].length*2);expect($('button.slip-odds-button:disabled')).toHaveLength(0);
        expect($('button [data-price-kind="CALCULATED_MINUS_10"]')).toHaveLength(SELECTIONS[market].length);
        expect($('.match-affiliate-cta')).toHaveLength(0);$('.sr-only').remove();expect($('.pregame-table').text()).not.toMatch(/Real|−10%|Estimación/);
      });
    }
  }
});
