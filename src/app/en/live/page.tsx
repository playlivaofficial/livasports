import {EnglishSportsPage} from '@/localization/EnglishSportsPage';
  import {routeMetadata} from '@/config/metadata';
  export const metadata=routeMetadata('en','live');
  export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <EnglishSportsPage searchParams={searchParams} page="live"/>;}
