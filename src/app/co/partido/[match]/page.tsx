import {ArchivePage,archiveMetadata} from '@/v2/archive';
export const revalidate=false;
export const generateStaticParams=()=>[];
export async function generateMetadata({params}:{params:Promise<{match:string}>}){return archiveMetadata('co','match',(await params).match);}
export default async function Page({params}:{params:Promise<{match:string}>}){return <ArchivePage locale="co" kind="match" param={(await params).match}/>;}
