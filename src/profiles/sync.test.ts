import { describe, expect, it } from 'vitest';
import { selectRepresentativePlayers } from './sync';
import type { ProviderSquadRow } from './provider';

describe('profile sync selection', () => {
  it('selects one persisted squad member from each football position without duplicates', () => {
    const rows=[24,25,26,27,27].map((position,index)=>({id:index+1,player_id:100+index,team_id:1,position_id:position})) as ProviderSquadRow[];
    expect(selectRepresentativePlayers(rows,4).map(row=>row.position_id)).toEqual([24,25,26,27]);
    expect(new Set(selectRepresentativePlayers(rows,4).map(row=>row.player_id)).size).toBe(4);
  });
  it('falls back deterministically when a position is unavailable', () => {
    const rows=[{id:1,player_id:10,team_id:1,position_id:24},{id:2,player_id:11,team_id:1,position_id:25},
      {id:3,player_id:12,team_id:1,position_id:null}] as ProviderSquadRow[];
    expect(selectRepresentativePlayers(rows,3).map(row=>row.player_id)).toEqual([10,11,12]);
  });
});
