import {SportsRoute,sportsMetadata,sportsStaticParams} from '@/multisport/pages';
export const revalidate=300;
export const generateStaticParams=sportsStaticParams;
type Props={params:Promise<{path?:string[]}>};
export async function generateMetadata({params}:Props){return sportsMetadata('en',(await params).path??[]);}
export default async function Page({params}:Props){return <SportsRoute locale="en" parts={(await params).path??[]}/>;}
