import {describe,it,expect} from 'vitest';
import {rankNews} from './ranking';import type {EventFacts} from './policy';
const row=(eventKey:string,sport:string,sourceId:string,eventDate='2026-10-28')=>({eventKey,facts:{kind:'announcement',sport,sourceId,eventDate} as EventFacts});
describe('eligible newsroom queue diversity',()=>{
 it('promotes a verified underrepresented sport without mutating the queue',()=>{const rows=[row('football','football','dimayor-releases'),row('nba','basketball','nba-releases')];expect(rankNews(rows,[{sport:'football',sourceId:'openliga-results',count:3}]).map(r=>r.eventKey)).toEqual(['nba','football']);expect(rows[0].eventKey).toBe('football');});
 it('prefers a less represented source within a sport',()=>{expect(rankNews([row('bundesliga','football','openliga-results'),row('colombia','football','dimayor-releases')],[{sport:'football',sourceId:'openliga-results',count:2}])[0].eventKey).toBe('colombia');});
 it('uses freshness then stable identity for ties',()=>{expect(rankNews([row('old','basketball','nba-releases','2026-10-25'),row('z','football','dimayor-releases'),row('a','football','openliga-results')],[]).map(r=>r.eventKey)).toEqual(['a','z','old']);expect(rankNews([],[])).toEqual([]);});
});