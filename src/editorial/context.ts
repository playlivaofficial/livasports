import type {SportsSnapshot,SportsEntity} from '@/multisport/model';
import type {PublishedNews} from './model';
import {orderSportsSnapshots} from '@/multisport/ordering';
import {identityAsset,type IdentityAsset} from '@/multisport/identity-assets';

export interface VerifiedIdentity {id:string;canonicalName:string;kind:SportsEntity['kind'];sport:string;competitionId:string;season:string;aliases:string[];sourceUrl:string;country:string|null;asset:IdentityAsset|null;assetStatus:'reviewed-editorial-artwork'|'text-only-rights-unverified'}
/** Source-qualified IDs prevent cross-provider/country merging. No fuzzy name guesses or fake crests. */
export function identityRegistry(snapshots:readonly SportsSnapshot[]):VerifiedIdentity[]{
  return snapshots.flatMap(s=>s.entities.map(e=>{const asset=identityAsset(s.competitionId,e.name)??null;return {id:`${s.sourceId}:${s.competitionId}:${e.id}`,canonicalName:e.name,kind:e.kind,sport:s.sport,competitionId:s.competitionId,season:s.season,aliases:[e.name],sourceUrl:s.sourceUrl,country:e.country??null,asset,assetStatus:asset?'reviewed-editorial-artwork' as const:'text-only-rights-unverified' as const};}));
}
const normalized=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
function mentions(text:string,name:string){const escaped=normalized(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'u').test(normalized(text));}
export function storyContext(story:PublishedNews,snapshots:SportsSnapshot[]){
  const snapshot=orderSportsSnapshots(snapshots.filter(s=>s.competitionId===story.competition&&s.sport===(story.sport??'football')))[0];
  if(!snapshot)return null;
  const text=Object.values(story.title).join(' ')+' '+Object.values(story.body).join(' ');
  const entities=snapshot.entities.filter(e=>mentions(text,e.name));
  // A matchup is inferred ONLY from two exact identities and an exact source-date match.
  // Automatic announcement slugs identify notices, not match reports. Their publication
  // day and mentioned teams must never manufacture an unrelated same-day matchup.
  const events=!story.slug.startsWith('announcement-')&&entities.length===2?snapshot.events.filter(e=>entities.some(x=>x.id===e.homeId)&&entities.some(x=>x.id===e.awayId)&&(e.start??e.date??'').slice(0,10)===story.sourcePublishedOn):[];
  return {snapshot,entities,event:events.length===1?events[0]:null};
}
