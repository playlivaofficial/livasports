import {describe,expect,it} from 'vitest';
import {buildShortlist,pickWithDiversity,rankPriorities} from './shortlist';
import type {FixturePriority} from './scoring';

const priority=(id:string,total:number,competitionSlug='brasileirao-serie-a',kickoff='2026-09-23T12:00:00Z'):FixturePriority=>({fixtureId:id,publicId:id.padStart(16,'0').slice(-16),kickoff,competitionSlug,total,
  lines:[],reasons:[],rivalry:null,stage:null,eligible:true,ineligibleReason:null,oddsBookmakers:1});

describe('Traffic Engine V1 shortlist diversity',()=>{
  it('is deterministic for multiple top fixtures on the same day regardless of input order',()=>{
    const rows=[priority('3',70),priority('1',70,'copa-libertadores'),priority('2',70,'champions-league')];
    expect(rankPriorities(rows).map(row=>row.fixtureId)).toEqual(rankPriorities([...rows].reverse()).map(row=>row.fixtureId));
  });
  it('prevents one competition from trivially monopolizing a comparable list',()=>{
    const rows=[...Array.from({length:7},(_,i)=>priority(`b${i}`,80-i)),priority('l1',76,'copa-libertadores'),priority('c1',75,'champions-league'),priority('p1',74,'premier-league')];
    const list=pickWithDiversity(rankPriorities(rows),5,2);
    expect(list.filter(row=>row.competitionSlug==='brasileirao-serie-a')).toHaveLength(2);
    expect(new Set(list.map(row=>row.competitionSlug)).size).toBeGreaterThan(1);
  });
  it('allows a truly dominant capped fixture to displace a much weaker diversity choice',()=>{
    const rows=[priority('a',100),priority('b',98),priority('c',96),priority('d',70,'copa-libertadores'),priority('e',69,'champions-league')];
    const list=pickWithDiversity(rankPriorities(rows),4,2,12);
    expect(list.map(row=>row.fixtureId)).toContain('c');
  });
  it('produces Top 5 as a subset of Top 10 and suppresses recent duplicates',()=>{
    const rows=Array.from({length:12},(_,i)=>priority(String(i),90-i,`competition-${i%5}`));
    const result=buildShortlist(rows,{excludeFixtureIds:new Set(['0'])});
    expect(result.social).toHaveLength(5);expect(result.content).toHaveLength(10);
    expect(result.social.every(row=>result.content.includes(row))).toBe(true);expect(result.suppressedAsDuplicate).toBe(1);
  });
});
