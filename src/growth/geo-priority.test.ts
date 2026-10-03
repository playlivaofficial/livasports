import {describe,it,expect} from 'vitest';
import {CORE_GEOS} from '@/config/geo';
import {scoreFixture} from './scoring';
import {buildShortlist} from './shortlist';
import {testSignals,testNow} from './fixtures.test-support';
describe('three independent shared Top5 lists',()=>{
  const rows=CORE_GEOS.flatMap((geo,g)=>Array.from({length:6},(_,index)=>testSignals({fixtureId:`${geo}-${index}`,publicId:`${g}${index}`,competitionSlug:geo==='MX'?'liga-mx':geo==='CO'?'colombia-primera-a':'peru-liga-1',
    home:{name:`${geo} club A`,slug:`club-${g}-${index}`,publicId:`home-${g}-${index}`,country:geo,imageUrl:null},away:{name:'Away',slug:'away',publicId:'away',country:geo,imageUrl:null}})));
  it('produces <=5 unique fixtures per GEO and at most15 total with stable explainable ranks',()=>{
    const lists=CORE_GEOS.map(geo=>buildShortlist(rows.map(r=>scoreFixture(r,testNow,{geo})),{size:5}));
    expect(lists.reduce((s,l)=>s+l.content.length,0)).toBe(15);
    for(let i=0;i<lists.length;i++){
      expect(lists[i].content).toHaveLength(5);expect(new Set(lists[i].content.map(r=>r.fixtureId)).size).toBe(5);
      expect(lists[i].content[0].fixtureId).toContain(CORE_GEOS[i]);expect(lists[i].content.every(r=>r.reasons.length>0)).toBe(true);
      const again=buildShortlist([...rows].reverse().map(r=>scoreFixture(r,testNow,{geo:CORE_GEOS[i]})),{size:5});
      expect(again.content).toEqual(lists[i].content);
    }
    expect(lists[0].content).not.toBe(lists[1].content);expect(lists[0].content[0].fixtureId).not.toBe(lists[1].content[0].fixtureId);
  });
  it('rotates finished and rescheduled fixtures without changing canonical fixture identity',()=>{
    const moved={...rows[0],kickoff:new Date(testNow.getTime()+48*3600000).toISOString()};
    expect(scoreFixture(moved,testNow,{geo:'MX'}).fixtureId).toBe(rows[0].fixtureId);
    const priorities=rows.map((r,i)=>scoreFixture(i===0?{...r,status:'FINISHED'}:r,testNow,{geo:'MX'}));
    expect(buildShortlist(priorities,{size:5}).content.some(r=>r.fixtureId===rows[0].fixtureId)).toBe(false);
  });
});
