import {describe,expect,it} from 'vitest';
import {SHORTLIST} from './config';
import {buildShortlist,pickWithDiversity,rankPriorities,sharedPriorityRanks} from './shortlist';
import type {FixturePriority} from './scoring';

const priority=(id:string,total:number,competitionSlug='brasileirao-serie-a',kickoff='2026-09-23T12:00:00Z'):FixturePriority=>({fixtureId:id,publicId:id.padStart(16,'0').slice(-16),kickoff,competitionSlug,total,
  lines:[],reasons:[],rivalry:null,stage:null,eligible:true,ineligibleReason:null,oddsBookmakers:1});

describe('Traffic Engine V1 shortlist diversity',()=>{
  it('bounds one serverless generation run while retaining the broader shared Top 10',()=>{
    expect(SHORTLIST.contentSize).toBe(10);expect(SHORTLIST.generationBatchSize).toBe(5);
    expect(SHORTLIST.generationBatchSize).toBe(SHORTLIST.socialSize);
    expect(SHORTLIST.generationBatchSize).toBeLessThan(SHORTLIST.contentSize);
  });
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
  it('still fills the quota when the calendar cannot satisfy the diversity cap',()=>{
    // Regression: the cap was a hard veto while filling and the override can only replace an entry,
    // so a light week silently returned a short list — production landed on top_social 4 of 5.
    const oneCompetition=Array.from({length:12},(_,i)=>priority(`b${i}`,90-i));
    const result=buildShortlist(oneCompetition);
    expect(result.content).toHaveLength(SHORTLIST.contentSize);
    expect(result.social).toHaveLength(SHORTLIST.socialSize);
    expect(result.social.every(row=>result.content.includes(row))).toBe(true);
  });
  it('relaxes diversity one step at a time instead of abandoning it',()=>{
    // Nine Serie B, one La Liga 2 and two Liga MX — the real shape of a Brazilian international break.
    const rows=[...Array.from({length:9},(_,i)=>priority(`b${i}`,90-i)),
      priority('l1',60,'la-liga-2'),priority('m1',58,'liga-mx'),priority('m2',57,'liga-mx')];
    const content=pickWithDiversity(rankPriorities(rows),10,4);
    expect(content).toHaveLength(10);
    // Every competition the window offered is still represented; only the surplus comes from the deepest one.
    expect(new Set(content.map(row=>row.competitionSlug))).toEqual(new Set(['brasileirao-serie-a','la-liga-2','liga-mx']));
    expect(content.filter(row=>row.competitionSlug==='liga-mx')).toHaveLength(2);
  });
  it('never returns more than the requested size and keeps rank order',()=>{
    const rows=Array.from({length:20},(_,i)=>priority(String(i),90-i,`competition-${i%2}`));
    const list=pickWithDiversity(rankPriorities(rows),6,2);
    expect(list).toHaveLength(6);
    expect(list.map(row=>row.total)).toEqual([...list.map(row=>row.total)].sort((a,b)=>b-a));
    expect(new Set(list.map(row=>row.fixtureId)).size).toBe(6);
  });
  it('uses the diversity-aware shared Top 10 order as the canonical rank map',()=>{
    const rows=[priority('a',100),priority('b',99),priority('c',98),priority('d',97,'copa-libertadores')];
    const shortlist={content:[rows[0],rows[3]]},ranks=sharedPriorityRanks(shortlist,rows);
    expect(ranks.get('a')).toBe(1);expect(ranks.get('d')).toBe(2);expect(ranks.get('b')).toBe(3);expect(ranks.get('c')).toBe(4);
  });
});
