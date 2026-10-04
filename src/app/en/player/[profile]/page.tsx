import {EnglishProfileRoute,englishProfileMetadata} from '@/localization/english-routes';
  type Props={params:Promise<{profile:string}>};
  export function generateMetadata({params}:Props){return englishProfileMetadata(params,'player');}
  export default function Page({params}:Props){return <EnglishProfileRoute params={params} entity="player"/>;}

// Generate once on first request, then share only the public path-specific shell.
export const revalidate = 21600;
export function generateStaticParams(){return [];}
