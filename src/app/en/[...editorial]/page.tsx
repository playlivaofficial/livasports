import {EditorialDetail,editorialDetailParams,resolveEditorialDetail,v2Metadata} from '@/v2/pages';
export const dynamicParams=false;
export const generateStaticParams=()=>editorialDetailParams('en');
export async function generateMetadata({params}:{params:Promise<{editorial:string[]}>}){const {section,slug}=resolveEditorialDetail('en',(await params).editorial);return v2Metadata('en',section,slug);}
export default async function Page({params}:{params:Promise<{editorial:string[]}>}){const {section,slug}=resolveEditorialDetail('en',(await params).editorial);return <EditorialDetail locale="en" section={section} slug={slug}/>;}
