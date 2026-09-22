import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {SlipLegs} from './SlipLegs';
import {buildSlipComparison} from '@/slip/comparison';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import {slipCopy,type SlipUiLocale} from '@/slip/localization';
import {selectionKey,type CanonicalSelection,type ResolvedSelection,type SavedSelection} from '@/slip/types';

function saved(f:ReturnType<typeof comparisonFixture>,selections:CanonicalSelection[]=f.selections):SavedSelection[]{
  return selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}));
}
function resolved(f:ReturnType<typeof comparisonFixture>,selections:SavedSelection[]):Map<string,ResolvedSelection>{
  return new Map(selections.map(s=>{
    const read=f.data.fixtures.get(s.fixturePublicId)!;
    const quote=read.snapshot.quotes.find(q=>q.bookmaker==='betsson')!;
    return [selectionKey(s),{selection:s,fixture:read.fixture,state:'CURRENT',reason:null,
      price:{decimalOdds:quote.decimalOdds!,bookmaker:quote.bookmaker,bookmakerName:quote.bookmakerName,best:false,expiresAt:new Date(f.now+60000).toISOString()},
      closesAt:read.fixture.kickoff} satisfies ResolvedSelection];
  }));
}
function render(f:ReturnType<typeof comparisonFixture>,selections:SavedSelection[],uiLocale:SlipUiLocale='en'){
  return renderToStaticMarkup(<SlipLegs uiLocale={uiLocale} selections={selections} resolvedByKey={resolved(f,selections)}
    comparison={buildSlipComparison(selections,'br',f.data.fixtures,f.data.bookmakers,f.now)} checking={false}
    resolvedAt={new Date(f.now).toISOString()} now={f.now} onRemove={()=>{}}/>);
}
const rows=(html:string)=>html.match(/class="slip-item"/g)?.length??0;
const removeControls=(html:string)=>html.match(/class="slip-remove"/g)?.length??0;

describe('My Slip — selected matches list',()=>{
  it('renders one compact row per selection for 1, 3 and 5 selections, each with its own remove control',()=>{
    for(const count of [1,3,5]){
      const f=comparisonFixture(count);const html=render(f,saved(f));
      expect(rows(html)).toBe(count);expect(removeControls(html)).toBe(count);
    }
  });
  it('shows competition, kickoff, both teams, market, pick and the reference price on every row',()=>{
    const f=comparisonFixture(1);const selections=saved(f);const html=render(f,selections);
    const kickoff=f.data.fixtures.get(selections[0].fixturePublicId)!.fixture.kickoff;
    expect(html).toContain('Competição de teste');
    expect(html).toMatch(new RegExp(`<time [^>]*datetime="${kickoff}"`,'i'));
    expect(html).toContain('Flamengo vs Palmeiras');
    expect(html).toContain('<span>Full-time result</span><strong>Flamengo</strong>');
    expect(html).toContain('2.10');
    expect(html).toContain('aria-label="Remove: Flamengo vs Palmeiras, Flamengo"');
  });
  it('removes only the targeted selection — first, middle or last — and keeps the canonical order of the rest',()=>{
    const f=comparisonFixture(5);const all=saved(f);
    const names=(html:string)=>[...html.matchAll(/data-selection="([^"]+)"/g)].map(m=>m[1]);
    const keys=all.map(selectionKey);
    for(const index of [0,2,4]){
      const remaining=all.filter((_,i)=>i!==index);
      const html=render(f,remaining);
      expect(rows(html)).toBe(4);
      expect(names(html)).toEqual(keys.filter((_,i)=>i!==index));
      expect(html).not.toContain(`data-selection="${keys[index]}"`);
    }
  });
  it('renders nothing but an empty list when every selection is cleared',()=>{
    const f=comparisonFixture(3);const html=render(f,[]);
    expect(rows(html)).toBe(0);expect(removeControls(html)).toBe(0);
  });
  it('recomputes bookmaker coverage and combined odds from the same canonical slip the list renders',()=>{
    const f=comparisonFixture(5);const all=saved(f);
    const five=buildSlipComparison(all,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const betssonFive=five.bookmakers.find(b=>b.bookmakerId==='betsson')!;
    expect([betssonFive.availableSelectionCount,betssonFive.requiredSelectionCount]).toEqual([5,5]);
    const four=buildSlipComparison(all.filter((_,i)=>i!==0),'br',f.data.fixtures,f.data.bookmakers,f.now);
    const betssonFour=four.bookmakers.find(b=>b.bookmakerId==='betsson')!;
    expect([betssonFour.availableSelectionCount,betssonFour.requiredSelectionCount]).toEqual([4,4]);
    expect(betssonFour.combinedDecimalOdds).not.toBe(betssonFive.combinedDecimalOdds);
    expect(Number(betssonFour.combinedDecimalOdds)).toBeLessThan(Number(betssonFive.combinedDecimalOdds));
    expect(rows(render(f,all.filter((_,i)=>i!==0)))).toBe(4);
  });
  it('drops a bookmaker to partial coverage when the removed selection was the only one it could not price',()=>{
    const f=comparisonFixture(3);const all=saved(f);
    f.data.fixtures.get(all[1].fixturePublicId)!.snapshot.quotes=[];
    const withGap=buildSlipComparison(all,'br',f.data.fixtures,f.data.bookmakers,f.now);
    expect(withGap.bookmakers.every(b=>!b.complete)).toBe(true);
    const withoutGap=buildSlipComparison(all.filter((_,i)=>i!==1),'br',f.data.fixtures,f.data.bookmakers,f.now);
    expect(withoutGap.bookmakers.some(b=>b.complete)).toBe(true);
    const betsson=withoutGap.bookmakers.find(b=>b.bookmakerId==='betsson')!;
    expect([betsson.availableSelectionCount,betsson.requiredSelectionCount]).toEqual([2,2]);
  });
  it.each([['br','Suas seleções'],['mx','Tus selecciones'],['en','Your selections']] as const)('has a localized section heading in %s',(locale,label)=>{
    expect(slipCopy[locale].yourSelections).toBe(label);
  });
});

describe('My Slip — panel order',()=>{
  const shell=readFileSync(resolve(process.cwd(),'src/components/slip/SlipShell.tsx'),'utf8');
  it('keeps the approved order: stake, bookmaker comparison, selected matches, share, footer',()=>{
    const order=['className="slip-stake"','<SlipComparison','className="slip-selections"','<SlipLegs','className="slip-share"','className="slip-footer"']
      .map(marker=>{const at=shell.indexOf(marker);expect(at,marker).toBeGreaterThan(-1);return at;});
    expect(order).toEqual([...order].sort((a,b)=>a-b));
  });
  it('shows the list without a disclosure toggle, so selections are never hidden behind a collapsed details element',()=>{
    expect(shell).not.toContain('<details className="slip-selections"');
    expect(shell).toContain('{text.yourSelections}');
  });
  it('keeps Clear all and Share Slip available',()=>{
    expect(shell).toContain('{text.clear}');expect(shell).toContain('{text.share}');
  });
});
