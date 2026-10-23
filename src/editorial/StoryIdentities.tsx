import {identityAssets} from '@/multisport/identity-assets';
import {IdentityLogo} from '@/multisport/IdentityLogo';
import type {PublishedNews} from './model';

/** Exact canonical mentions only. An award recipient's publisher is not a match opponent. */
export function reportedIdentities(item:PublishedNews){
 const headline=item.title.en.normalize('NFKC');
 return identityAssets.filter(asset=>asset.kind==='team'&&asset.competitionId===item.competition&&asset.names.some(name=>{
  const escaped=name.normalize('NFKC').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'u').test(headline);
 }));
}
export function StoryIdentities({item}:{item:PublishedNews}){
 const teams=reportedIdentities(item);
 if(!teams.length)return null;
 return <div className="ed-reported-identities">{teams.map(asset=><span key={asset.id}><IdentityLogo competitionId={asset.competitionId} teamName={asset.names[0]}/><strong>{asset.names[0]}</strong></span>)}</div>;
}
