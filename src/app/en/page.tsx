import {EnglishSportsPage} from '@/localization/EnglishSportsPage';
  import {routeMetadata} from '@/config/metadata';
  export const metadata=routeMetadata('en','home');
  export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <EnglishSportsPage searchParams={searchParams} page="home"/>;}
