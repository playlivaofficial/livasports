import {createHash} from 'node:crypto';
import {validateSnapshot,type BasketballTable,type SportsEntity,type SportsSnapshot} from './model';
import {getWikimediaDataset,type WikimediaBatch} from './wikimedia';
import {nbaDivision,nbaConference} from './basketball-model';

/** Two fixed source tables; no template execution or inferred postseason qualification. */
export function normalizeWikimediaNba(batch:WikimediaBatch,now=new Date()):SportsSnapshot{
 const config=getWikimediaDataset('nba'),fail=(code:string):never=>{throw new Error(`WIKIMEDIA_NBA_${code}`);};
 if(batch.dataset.competitionId!=='nba'||batch.dataset.sourceUrl!==config.sourceUrl||batch.dataset.season!==config.season||batch.pages.length!==2)fail('DATASET');
 const entities:SportsEntity[]=[],tables:BasketballTable[]=[];
 for(const [index,title] of config.titles.entries()){
  const page=batch.pages.find(p=>p.title===title);if(!page) return fail('PAGE');
  const conference=index===0?'Eastern':'Western';
  if(!page.wikitext.startsWith('{{NBA team standings')||!page.wikitext.includes(`|conference = ${index===0?'East':'West'}`))fail('FORMAT');
  const lines=page.wikitext.split('\n').filter(line=>/^\|\s*\[\[/.test(line));
  if(lines.length!==15)fail('SIZE');
  const rows:BasketballTable['rows']=lines.map((line,i)=>{
   const match=/^\|\s*\[\[2026–27 [^|\]]+ season\|([^\]]+)\]\]\s*\|\s*([A-Z]{3})\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*\d+[–-]\d+\s*\|\s*(\w+)\s*$/.exec(line);
   if(!match)return fail('ROW');
   const name=match[1],division=nbaDivision(name);
   if(division!==match[7]||nbaConference(division??'')!==conference)fail('IDENTITY');
   const wins=Number(match[3])+Number(match[5]),losses=Number(match[4])+Number(match[6]),played=wins+losses;
   if(played>82)fail('RECORD');
   const entityId=`nba-${createHash('sha256').update(name).digest('hex').slice(0,24)}`;
   entities.push({id:entityId,name,kind:'club'});
   return {entityId,rank:i+1,played,wins,losses,winPercentage:played?wins/played:0};
  });
  if(rows.some((r,i)=>i>0&&r.winPercentage>rows[i-1].winPercentage))fail('ORDER');
  const leader=rows[0];for(const row of rows)row.gamesBehind=(leader.wins-row.wins+row.losses-leader.losses)/2;
  tables.push({id:conference.toLowerCase(),name:conference,conference,type:'basketball',stage:'Regular season',rows});
 }
 if(new Set(entities.map(e=>e.id)).size!==30||tables.flatMap(t=>t.rows).reduce((sum,r)=>sum+r.wins-r.losses,0)!==0)fail('TOTALS');
 const snapshot:SportsSnapshot={schemaVersion:1,competitionId:'nba',sport:'basketball',season:config.season,stage:'Regular season',sourceId:'wikimedia',sourceUrl:config.sourceUrl,observedAt:batch.pages.map(p=>p.revisionTimestamp).sort()[0],retrievedAt:batch.retrievedAt,mode:'manual',observationBasis:'source-revision',provenance:batch.pages.map(({title,revisionId,revisionTimestamp})=>({title,revisionId,revisionTimestamp})),entities,tables,events:[]};
 if(validateSnapshot(snapshot,now).length)fail('INVALID_SNAPSHOT');
 return snapshot;
}
