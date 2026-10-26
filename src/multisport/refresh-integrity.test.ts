import {describe,it,expect} from 'vitest';
import {assertRefreshProgress} from './refresh-integrity';
import type {SportsSnapshot} from './model';
const previous={competitionId:'bundesliga',season:'2026/27',sourceId:'openligadb',observedAt:'2026-10-25T18:00:00Z'} as SportsSnapshot;
describe('automatic refresh monotonicity',()=>{
 it('allows equal-cutoff corrections and new results',()=>{expect(()=>assertRefreshProgress(previous,{...previous})).not.toThrow();expect(()=>assertRefreshProgress(previous,{...previous,observedAt:'2026-10-26T18:00:00Z'})).not.toThrow();});
 it('refuses a fresh retrieval of older results',()=>expect(()=>assertRefreshProgress(previous,{...previous,observedAt:'2026-10-24T18:00:00Z',retrievedAt:'2026-10-26T18:00:00Z'})).toThrow('UPSTREAM_CUTOFF_REGRESSION'));
 it.each(['season','competitionId','sourceId','observationBasis'])('refuses incomparable %s',field=>expect(()=>assertRefreshProgress(previous,{...previous,[field]:'different'})).toThrow('UPSTREAM_CONTEXT_CONFLICT'));
 it('permits the first validated publication',()=>expect(()=>assertRefreshProgress(null,previous)).not.toThrow());
});
