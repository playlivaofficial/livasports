import {describe,expect,it} from 'vitest';
import {estimatedDailySportmonksRequests} from './refresh-policy';
describe('shared refresh budget',()=>{it('makes the cost of frequent live snapshots explicit',()=>{
  expect(estimatedDailySportmonksRequests({concurrentLiveFixtures:2,activePrematchFixtures:5,standingsCompetitions:3,liveHours:6})).toEqual({live:1440,prematch:240,standings:144,total:1824});
});});
