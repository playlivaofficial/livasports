import {NewsArticlePage,newsMetadata} from '@/editorial/pages';
export const revalidate=3600;
export const dynamicParams=true;
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props){return newsMetadata('mx',(await params).slug);}
export default async function Page({params}:Props){return <NewsArticlePage locale="mx" slug={(await params).slug}/>;}
