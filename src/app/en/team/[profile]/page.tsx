import {EnglishProfileRoute,englishProfileMetadata} from '@/localization/english-routes';
  type Props={params:Promise<{profile:string}>};
  export function generateMetadata({params}:Props){return englishProfileMetadata(params,'team');}
  export default function Page({params}:Props){return <EnglishProfileRoute params={params} entity="team"/>;}
