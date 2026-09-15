import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {SlipLegs} from './SlipLegs';
import {buildSlipComparison} from '@/slip/comparison';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import {selectionKey,type ResolvedSelection,type SavedSelection} from '@/slip/types';

function saved(f:ReturnType<typeof comparisonFixture>):SavedSelection[]{
  return f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}));
}
function resolved(f:ReturnType<typeof comparisonFixture>,selections:SavedSelection[]):Map<string,ResolvedSelection>{
  return new Map(selections.map(s=>{
    const fixture=f.data.fixtures.get(s.fixturePublicId)!.fixture;
    const quote=f.data.fixtures.get(s.fixturePublicId)!.snapshot.quotes.find(q=>q.bookmaker==='betsson')!;
    const view:ResolvedSelection={selection:s,fixture,state:'CURRENT',reason:null,price:{decimalOdds:quote.decimalOdds!,bookmaker:quote.bookmaker,bookmakerName:quote.bookmakerName,best:false,expiresAt:new Date(f.now+60000).toISOString()},closesAt:fixture.kickoff};
    return [selectionKey(s),view];
  }));
}

describe('My Slip selected-leg list',()=>{
  it('renders every selected fixture, market, outcome, odds and remove control',()=>{
    const f=comparisonFixture();const selections=saved(f);
    const comparison=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const html=renderToStaticMarkup(<SlipLegs uiLocale="en" selections={selections} resolvedByKey={resolved(f,selections)} comparison={comparison} checking={false} resolvedAt={new Date(f.now).toISOString()} now={f.now} onRemove={()=>{}}/>);
    expect(html).toContain('Flamengo vs Palmeiras');expect(html).toContain('Real Madrid vs Barcelona');expect(html).toContain('Club América vs Tigres UANL');
    expect(html).toContain('Full-time result — Flamengo');expect(html).toContain('Total goals · 2.5 — Over 2.5');expect(html).toContain('Both teams to score — Yes');
    expect(html.match(/class="slip-remove"/g)?.length).toBe(3);
    expect(html.match(/class="slip-item"/g)?.length).toBe(3);
    expect(html).toContain('Betano ✓');expect(html).toContain('Betsson ✓');
  });
  it('drops the middle leg from the visible list when that canonical selection is removed',()=>{
    const f=comparisonFixture();const selections=saved(f).filter((_,i)=>i!==1);
    const comparison=buildSlipComparison(selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const html=renderToStaticMarkup(<SlipLegs uiLocale="en" selections={selections} resolvedByKey={resolved(f,selections)} comparison={comparison} checking={false} resolvedAt={new Date(f.now).toISOString()} now={f.now} onRemove={()=>{}}/>);
    expect(html.match(/class="slip-item"/g)?.length).toBe(2);
    expect(html).toContain('Flamengo vs Palmeiras');expect(html).not.toContain('Real Madrid vs Barcelona');expect(html).toContain('Club América vs Tigres UANL');
    expect(html).toContain('aria-label="2 selections"');
  });
  it('replaces a same-market selection in place so the old outcome appears once',()=>{
    const f=comparisonFixture(1);const original=saved(f)[0];
    const next:SavedSelection={fixturePublicId:original.fixturePublicId,scope:original.scope,market:'MATCH_WINNER',outcome:'DRAW',line:null,addedAt:original.addedAt};
    const html=renderToStaticMarkup(<SlipLegs uiLocale="en" selections={[next]} resolvedByKey={resolved(f,[next])} comparison={null} checking={false} resolvedAt={null} now={f.now} onRemove={()=>{}}/>);
    expect(html.match(/class="slip-item"/g)?.length).toBe(1);
    expect(html).toContain('Full-time result — Draw');expect(html).not.toContain('Full-time result — Flamengo');
  });
  it('marks the exact missing Betano leg on the row without a closed-market lie',()=>{
    const f=comparisonFixture();f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes.pop();
    const selections=saved(f);
    const comparison=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const html=renderToStaticMarkup(<SlipLegs uiLocale="en" selections={selections} resolvedByKey={resolved(f,selections)} comparison={comparison} checking={false} resolvedAt={new Date(f.now).toISOString()} now={f.now} onRemove={()=>{}}/>);
    expect(html).toContain('data-bookmaker="betano.bet.br" data-available="false"');
    expect(html).toContain('Unavailable at Betano');expect(html).not.toContain('Market closed');
    expect(html).toContain('Betsson ✓');
  });
});
