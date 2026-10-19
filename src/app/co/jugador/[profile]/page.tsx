import {ArchivePage,archiveMetadata} from '@/v2/archive';
export const revalidate=false;
export const generateStaticParams=()=>[];
export async function generateMetadata({params}:{params:Promise<{profile:string}>}){return archiveMetadata('co','player',(await params).profile);}
export default async function Page({params}:{params:Promise<{profile:string}>}){return <ArchivePage locale="co" kind="player" param={(await params).profile}/>;}
