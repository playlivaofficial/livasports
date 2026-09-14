import {describe,it,expect} from 'vitest';
import {seasonStatisticValue,primaryProfileStatistics} from './statistics';
import type {ProfileStatistic} from './types';
describe('source season statistic shapes',()=>{
  it('reads team counts without confusing percentages or averages with totals',()=>{
    expect(seasonStatisticValue({all:{count:8,percentage:50,average:2}},'all')).toBe(8);
    expect(seasonStatisticValue({all:{count:0,percentage:0}},'all')).toBe(0);
    expect(seasonStatisticValue({all:{percentage:50}},'all')).toBeNull();
  });
  it('preserves flat legacy totals and exact player/average values',()=>{
    expect(seasonStatisticValue({all:5},'all')).toBe(5);
    expect(seasonStatisticValue({total:0},'total')).toBe(0);
    expect(seasonStatisticValue({average:48,count:96},'average')).toBe(48);
    expect(seasonStatisticValue({},'total')).toBeNull();
  });
});
it('keeps profile headline metrics in one verified season and team context',()=>{
 const a={competitionId:'c',seasonId:'new',teamId:'t',code:'GOALS',value:1} as ProfileStatistic;
 const rows=[a,{...a,seasonId:'old',code:'ASSISTS'},{...a,teamId:'other',code:'MINUTES_PLAYED'},{...a,code:'YELLOWCARDS',value:0}];
 expect(primaryProfileStatistics(rows)).toEqual([rows[0],rows[3]]);expect(primaryProfileStatistics([])).toEqual([]);
});
