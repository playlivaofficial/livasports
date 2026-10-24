import type {PublishedNews} from '@/editorial/model';
import type {SportsEntity,SportsSnapshot} from './model';

export const experienceCompetitions=['colombia-primera-a','bundesliga','nhl'] as const;
export const hasCompetitionExperience=(id:string)=>(experienceCompetitions as readonly string[]).includes(id);
// Explicit domestic league/cup association, not fuzzy matching or a guessed crest.
const identities=[{id:'america-de-cali',competitions:['colombia-primera-a','copa-colombia'],names:['América de Cali','America de Cali']}] as const;
export function canonicalEntity(competition:string,entity:Pick<SportsEntity,'id'|'name'>){
 return identities.find(x=>(x.competitions as readonly string[]).includes(competition)&&(x.names as readonly string[]).includes(entity.name))?.id??`${competition}:${entity.id}`;
}
function mentions(text:string,name:string){
 const escaped=name.normalize('NFKC').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'iu').test(text.normalize('NFKC'));
}
export function newsForEntity(story:PublishedNews,snapshot:SportsSnapshot,entity:SportsEntity){
 if((story.sport??'football')!==snapshot.sport)return false;
 const identity=identities.find(x=>x.id===canonicalEntity(snapshot.competitionId,entity));
 if(story.competition!==snapshot.competitionId&&!identity?.competitions.some(id=>id===story.competition))return false;
 return Object.values(story.title).some(title=>(identity?.names??[entity.name]).some(name=>mentions(title,name)));
}
export function newsForCompetition(story:PublishedNews,snapshot:SportsSnapshot){
 return (story.sport??'football')===snapshot.sport&&(story.competition===snapshot.competitionId||snapshot.entities.some(entity=>newsForEntity(story,snapshot,entity)));
}
/** Source-recorded, completed results only. Do not turn old scheduled rows into results/live fixtures. */
export function recordedResults(snapshot:SportsSnapshot,entityId?:string){
 const cutoff=Date.parse(snapshot.observedAt.length===10?snapshot.observedAt+'T23:59:59Z':snapshot.observedAt);
 const ids=new Set(snapshot.entities.map(entity=>entity.id));
 return snapshot.events.filter(event=>event.status==='completed'&&event.scores&&ids.has(event.homeId)&&ids.has(event.awayId)&&event.homeId!==event.awayId&&(!entityId||event.homeId===entityId||event.awayId===entityId)&&event.start&&Date.parse(event.start)<=cutoff)
  .sort((a,b)=>b.start!.localeCompare(a.start!)||a.id.localeCompare(b.id));
}
export function tableMemberships(snapshot:SportsSnapshot,entityId:string){return snapshot.tables.flatMap(table=>{const row=table.rows.find(row=>row.entityId===entityId);return row?[{table,row}]:[];});}
