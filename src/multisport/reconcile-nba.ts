import type {BasketballTable,SportsSnapshot} from './model';
export interface IndependentNbaRow {name:string;conference:string;rank:number;wins:number;losses:number;winPercentage:number;gamesBehind:number}
/** Compare factual records; a tie-order difference is NOT an official seed verification. */
export function reconcileNba(snapshot:SportsSnapshot,independent:IndependentNbaRow[]){
 const fail=():never=>{throw Error('NBA_RECONCILIATION_FAILED');};
 const tables=snapshot.tables.filter((t):t is BasketballTable=>t.type==='basketball');
 if(snapshot.competitionId!=='nba'||tables.length!==2||snapshot.entities.length!==30||independent.length!==30||new Set(independent.map(r=>r.name)).size!==30)fail();
 if(new Set(tables.map(t=>t.conference)).size!==2||new Set(tables.flatMap(t=>t.rows.map(r=>r.entityId))).size!==30)fail();
 const checks=[];
 for(const table of tables){
  if(!['Eastern','Western'].includes(table.conference??'')||table.rows.length!==15)fail();
  for(const row of table.rows){
   const name=snapshot.entities.find(e=>e.id===row.entityId)?.name,other=independent.find(r=>r.name===name);
   if(!other||other.conference!==table.conference)fail();
   if(other!.wins!==row.wins||other!.losses!==row.losses||!Number.isFinite(other!.winPercentage)||Math.abs(other!.winPercentage-row.winPercentage)>.00051||other!.gamesBehind!==row.gamesBehind)fail();
   if(!Number.isInteger(other!.rank)||other!.rank<1||other!.rank>15)fail();
   const tied=table.rows.filter(r=>r.wins===row.wins&&r.losses===row.losses).map(r=>r.rank).sort((a,b)=>a-b);
   const external=independent.filter(r=>r.conference===table.conference&&r.wins===row.wins&&r.losses===row.losses).map(r=>r.rank).sort((a,b)=>a-b);
   if(JSON.stringify(tied)!==JSON.stringify(external))fail();
   checks.push({name,conference:table.conference,recordVerified:true,sourceRank:row.rank,independentRank:other!.rank,tiedOrderDiffers:row.rank!==other!.rank});
  }
 }
 return {recordsVerified:checks.length,tiedOrderingDifferences:checks.filter(c=>c.tiedOrderDiffers).length,officialSeedingVerified:false as const,checks};
}
