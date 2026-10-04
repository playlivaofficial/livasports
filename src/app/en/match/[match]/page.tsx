import {EnglishMatchRoute,englishMatchMetadata} from '@/localization/english-routes';
export const revalidate = 86400;
export function generateStaticParams() { return []; }
  type Props={params:Promise<{match:string}>};
  export function generateMetadata({params}:Props){return englishMatchMetadata(params);}
  export default function Page({params}:Props){return <EnglishMatchRoute params={params}/>;}
