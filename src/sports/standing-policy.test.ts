import {describe,it,expect} from 'vitest';
import {standingExtras,standingRule} from './standing-policy';
describe('official standing metadata',()=>{
  it('uses source home/away totals and preserves absent values',()=>{
    const row=standingExtras({provider_details:[{type_id:135,value:2},{type_id:139,value:0},{type_id:140,value:1},{type_id:185,value:0}],provider_form:[{sort_order:2,form:'D'},{sort_order:1,form:'W'}]});
    expect(row.home.played).toBe(2);expect(row.home.points).toBe(0);expect(row.home.goalDifference).toBe(-1);expect(row.away.played).toBeNull();expect(row.form).toEqual(['W','D']);
  });
  it('does not invent qualification rules from rank or unknown provider IDs',()=>{
    expect(standingRule('br',null)).toBeNull();expect(standingRule('en',99999)).toBeNull();
    expect(standingRule('mx',182)).toEqual({label:'Descenso',tone:'relegation'});
  });
});
