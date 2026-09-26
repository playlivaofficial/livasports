import {describe,it,expect} from 'vitest';
import {aggregate,byLocale,BRAZIL_COUNTRY,collapse,compare,countryTotals,ctrOpportunities,expectedCtr,
  growthPages,localeOfPage,losingVisibility,nearPageOne,SEARCH_THRESHOLDS,topBy,type SearchRow} from './intelligence';

const row=(key:string,clicks:number,impressions:number,position:number):SearchRow=>
  ({key,clicks,impressions,ctr:impressions?clicks/impressions:0,position});

describe('window aggregation is mathematically honest',()=>{
  it('recomputes CTR from summed clicks and impressions instead of averaging a ratio',()=>{
    // Averaging the two daily CTRs would give 27.5%; the true window CTR is 3/110.
    const totals=aggregate([row('',1,10,5),row('',2,100,5)]);
    expect(totals.clicks).toBe(3);expect(totals.impressions).toBe(110);
    expect(totals.ctr).toBeCloseTo(3/110,10);
    expect(totals.ctr).not.toBeCloseTo((0.1+0.02)/2,3);
  });
  it('weights average position by impressions, so a 1-impression day cannot dominate',()=>{
    const totals=aggregate([row('',0,1,1),row('',0,999,20)]);
    expect(totals.position).toBeGreaterThan(19);
    expect(totals.position).not.toBeCloseTo(10.5,1);
  });
  it('collapses per-day rows for the same key with the same rules',()=>{
    const collapsed=collapse([row('/br',1,10,4),row('/br',1,10,6),row('/mx',0,5,9)]);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.find(r=>r.key==='/br')).toMatchObject({clicks:2,impressions:20,position:5});
  });
  it('treats an empty window as no data rather than dividing by zero',()=>{
    expect(aggregate([])).toEqual({clicks:0,impressions:0,ctr:0,position:0});
  });
});

describe('period comparison',()=>{
  const current=[row('/a',10,200,8),row('/b',1,50,15),row('/new',5,120,9)];
  const previous=[row('/a',4,100,12),row('/b',5,300,10)];
  const movements=compare(current,previous);
  it('reports a falling position number as an improvement',()=>{
    const a=movements.find(m=>m.key==='/a')!;
    expect(a.positionChange).toBeCloseTo(4,10);       // 12 → 8 is four places better
    expect(a.impressionsChange).toBeCloseTo(1,10);
  });
  it('treats a key absent from the previous window as new, not as a 100% loss',()=>{
    expect(movements.find(m=>m.key==='/new')).toMatchObject({previousImpressions:0,impressionsChange:1});
  });
  it('classifies growth and decline against transparent thresholds',()=>{
    expect(growthPages(movements).map(m=>m.key)).toContain('/a');
    expect(losingVisibility(movements).map(m=>m.key)).toContain('/b');
    expect(losingVisibility(movements).map(m=>m.key)).not.toContain('/a');
  });
  it('ignores movement below the minimum-impressions floor',()=>{
    const noise=compare([row('/tiny',1,3,9)],[row('/tiny',0,1,20)]);
    expect(growthPages(noise)).toEqual([]);
    expect(losingVisibility(noise)).toEqual([]);
  });
});

describe('opportunity classification',()=>{
  it('finds queries ranking 8-20 with meaningful impressions',()=>{
    const found=nearPageOne([row('near',2,400,12),row('page one',50,400,3),row('page three',0,400,29),row('thin',0,5,12)]);
    expect(found.map(r=>r.key)).toEqual(['near']);
    expect(SEARCH_THRESHOLDS.nearPageOneFrom).toBe(8);
    expect(SEARCH_THRESHOLDS.nearPageOneTo).toBe(20);
  });
  it('ranks CTR opportunities by clicks at stake, and labels the curve as a heuristic',()=>{
    const found=ctrOpportunities([row('big miss',1,1000,4),row('small miss',0,40,4),row('over',60,100,4)]);
    expect(found[0].key).toBe('big miss');
    expect(found.map(r=>r.key)).not.toContain('over');   // already beating the heuristic band
    expect(expectedCtr(2)).toBeGreaterThan(expectedCtr(9));
    expect(expectedCtr(9)).toBeGreaterThan(expectedCtr(30));
  });
  it('orders top lists by the requested metric',()=>{
    const rows=[row('a',1,500,9),row('b',9,100,9)];
    expect(topBy(rows,'clicks')[0].key).toBe('b');
    expect(topBy(rows,'impressions')[0].key).toBe('a');
  });
});

describe('locale and country attribution',()=>{
  it('derives locale from our own canonical URL tree',()=>{
    expect(localeOfPage('https://livasports.com/br/jogo/a-x-b-1')).toBe('pt-BR');
    expect(localeOfPage('https://livasports.com/mx/partido/a-x-b-1')).toBe('es-MX');
    expect(localeOfPage('https://livasports.com/en/match/a-x-b-1')).toBe('en');
    expect(localeOfPage('https://livasports.com/robots.txt')).toBe('other');
  });
  it('aggregates locales from page rows without double counting',()=>{
    const locales=byLocale([row('https://livasports.com/br/a',2,100,5),row('https://livasports.com/br/b',3,100,7),
      row('https://livasports.com/en/c',1,50,9)]);
    expect(locales.find(l=>l.locale==='pt-BR')).toMatchObject({clicks:5,impressions:200});
    expect(locales.find(l=>l.locale==='en')).toMatchObject({clicks:1,impressions:50});
  });
  it('filters Brazil on the ISO-3 code Search Console actually reports',()=>{
    expect(BRAZIL_COUNTRY).toBe('bra');
    const totals=countryTotals([row('bra',7,300,6),row('usa',1,100,9)],BRAZIL_COUNTRY);
    expect(totals).toMatchObject({clicks:7,impressions:300});
    expect(countryTotals([row('BRA',2,10,4)],BRAZIL_COUNTRY).clicks).toBe(2);  // case-insensitive
  });
});
