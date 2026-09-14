import {EnglishSportsPage} from '@/localization/EnglishSportsPage';
  import {footballMetadata} from '@/sports/metadata';
  export function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return footballMetadata('en',searchParams);}
  export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <EnglishSportsPage searchParams={searchParams} page="football"/>;}
