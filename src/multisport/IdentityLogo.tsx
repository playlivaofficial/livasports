import Image from 'next/image';
import {identityAsset} from './identity-assets';

/** Adjacent text provides the identity; never an affiliate link. */
export function IdentityLogo({competitionId,teamName}:{competitionId:string;teamName?:string}){
 const asset=identityAsset(competitionId,teamName);
 if(!asset)return null;
 return <span className={`ms-identity-logo ms-identity-logo-${asset.kind}`} data-identity={asset.id}><Image unoptimized src={asset.path} width={asset.width} height={asset.height} alt="" style={{objectFit:'contain',width:'100%',height:'100%'}}/></span>;
}
