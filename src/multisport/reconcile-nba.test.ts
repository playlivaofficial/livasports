import {describe,it,expect} from 'vitest';
import {reconcileNba,type IndependentNbaRow} from './reconcile-nba';
import type {SportsSnapshot,BasketballTable} from './model';
// Synthetic comparator-only data: never a publishable snapshot.
function fixture(){
 const tables:BasketballTable[]=['Eastern','Western'].map(conference=>({type:'basketball',id:conference,name:conference,stage:'Test',conference,rows:Array.from({length:15},(_,i)=>({entityId:conference+i,rank:i+1,played:2,wins:1,losses:1,winPercentage:.5,gamesBehind:0}))}));
 const snapshot={competitionId:'nba',tables,entities:tables.flatMap(t=>t.rows.map(r=>({id:r.entityId,name:r.entityId,kind:'club'})))} as SportsSnapshot;
 const rows:IndependentNbaRow[]=tables.flatMap(t=>t.rows.map(r=>({name:r.entityId,conference:t.conference!,rank:r.rank,wins:1,losses:1,winPercentage:.5,gamesBehind:0})));
 return {snapshot,rows};
}
describe('NBA independent record reconciliation',()=>{
 it('requires all 30 records and explicitly does not certify official seeding',()=>{const {snapshot,rows}=fixture();expect(reconcileNba(snapshot,rows)).toMatchObject({recordsVerified:30,tiedOrderingDifferences:0,officialSeedingVerified:false});});
 it('accepts only a permutation within an identical tied record',()=>{const {snapshot,rows}=fixture();[rows[0].rank,rows[1].rank]=[2,1];expect(reconcileNba(snapshot,rows).tiedOrderingDifferences).toBe(2);});
 it.each(['missing','duplicate','record','percentage','gamesBehind','conference','rank','tie-permutation'])('rejects %s disagreement',kind=>{const {snapshot,rows}=fixture();if(kind==='missing')rows.pop();if(kind==='duplicate')rows[1].name=rows[0].name;if(kind==='record')rows[0].wins++;if(kind==='percentage')rows[0].winPercentage=NaN;if(kind==='gamesBehind')rows[0].gamesBehind=.5;if(kind==='conference')rows[0].conference='Western';if(kind==='rank')rows[0].rank=0;if(kind==='tie-permutation')rows[0].rank=2;expect(()=>reconcileNba(snapshot,rows)).toThrow('NBA_RECONCILIATION_FAILED');});
});
