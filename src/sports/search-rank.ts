import type {SportsSearchResult} from './types';

export const SEARCH_SUGGESTION_LIMIT=5;
const KIND_RANK={competition:0,team:1,player:2} as const;

export function foldSearchText(value:string):string {
  return value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
}

export function searchPrefix(foldedHaystack:string,foldedNeedle:string):boolean {
  if(!foldedNeedle)return false;
  if(foldedHaystack.startsWith(foldedNeedle))return true;
  return foldedHaystack.split(/[\s/,-]+/).some(part=>part.startsWith(foldedNeedle));
}

export function moveSearchActive(key:'ArrowDown'|'ArrowUp',active:number,count:number):number {
  if(count<=0)return 0;
  if(key==='ArrowDown')return Math.min(count-1,active+1);
  return Math.max(0,active-1);
}

export function rankSportsSearch(rows:readonly SportsSearchResult[],query:string):SportsSearchResult[] {
  const needle=foldSearchText(query);
  if(!needle)return [];
  return rows.filter(row=>searchPrefix(foldSearchText(row.name),needle)||(row.context?searchPrefix(foldSearchText(row.context),needle):false))
    .sort((a,b)=>{
      const aFold=foldSearchText(a.name),bFold=foldSearchText(b.name);
      const aPrefix=aFold.startsWith(needle)?0:1,bPrefix=bFold.startsWith(needle)?0:1;
      return aPrefix-bPrefix||KIND_RANK[a.kind]-KIND_RANK[b.kind]||aFold.length-bFold.length||aFold.localeCompare(bFold);
    })
    .slice(0,SEARCH_SUGGESTION_LIMIT);
}
