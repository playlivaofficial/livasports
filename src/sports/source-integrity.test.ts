import {expect,it} from 'vitest';
import {fixtureCoachSources,fixtureFormationSources,fixtureLineupSources} from './source-integrity';
it('keeps exact fixture participant associations and separates contradictory provider links',()=>{
  const valid={id:10,meta:{participant_id:1}},other={id:11,participant_id:2},invalid={id:12,meta:{participant_id:3}};
  const result=fixtureCoachSources({participants:[{id:1},{id:2}],coaches:[valid,other,invalid]});
  expect(result.accepted).toEqual([valid,other]);expect(result.rejected).toEqual([invalid]);
});
it('retains formations only when the value and the exact fixture participant are supplied',()=>{
  const valid={participant_id:1,formation:'4-3-3'},wrong={participant_id:3,formation:'4-4-2'};
  expect(fixtureFormationSources({participants:[{id:1},{id:2}],formations:[valid,wrong,{participant_id:2,formation:null}]})).toEqual({accepted:[valid],rejected:[wrong]});
});
it('does not infer an association from a coach name or a missing participant',()=>{
  const missing={id:10,name:'Known coach'};
  expect(fixtureCoachSources({participants:[{id:1}],coaches:[missing]})).toEqual({accepted:[],rejected:[missing]});
  expect(fixtureCoachSources({})).toEqual({accepted:[],rejected:[]});
});

it('retains only lineup associations matching this fixture, including players without a global identity',()=>{
  const valid={id:1,team_id:10,player_id:7},unlinked={id:2,team_id:20,player_id:null},wrong={id:3,team_id:30,player_id:8},missing={id:4,player_id:9};
  expect(fixtureLineupSources({participants:[{id:10},{id:20}],lineups:[valid,wrong,unlinked,missing]})).toEqual({accepted:[valid,unlinked],rejected:[wrong,missing]});
});
