import {EnglishProfileRoute,englishProfileMetadata} from '@/localization/english-routes';
  type Props={params:Promise<{profile:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>};
  export function generateMetadata({params}:Props){return englishProfileMetadata(params,'team');}
  export default function Page({params,searchParams}:Props){return <EnglishProfileRoute params={params} searchParams={searchParams} entity="team"/>;}
