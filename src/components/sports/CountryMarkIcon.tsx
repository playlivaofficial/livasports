import type {CountryMark} from '@/sports/country-mark';
import Image from 'next/image';

export function CountryMarkIcon({mark,decorative=true,className='competition-nav-flag'}:{mark:CountryMark;decorative?:boolean;className?:string}){
  const accessibility=decorative?{'aria-hidden':true as const}:{role:'img','aria-label':mark.label};
  return <span className={className} title={mark.label} {...accessibility}>{mark.assetCode?
    <Image src={`https://flagcdn.com/${mark.assetCode}.svg`} width={20} height={15} alt="" loading="lazy" unoptimized referrerPolicy="no-referrer"/>:
    <span aria-hidden="true">{mark.emoji}</span>}</span>;
}
