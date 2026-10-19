import {EditorialDetail,editorialDetailParams,resolveEditorialDetail,v2Metadata} from '@/v2/pages';
export const dynamicParams=false;
export const generateStaticParams=()=>editorialDetailParams('co');
export async function generateMetadata({params}:{params:Promise<{editorial:string[]}>}){const {section,slug}=resolveEditorialDetail('co',(await params).editorial);return v2Metadata('co',section,slug);}
export default async function Page({params}:{params:Promise<{editorial:string[]}>}){const {section,slug}=resolveEditorialDetail('co',(await params).editorial);return <EditorialDetail locale="co" section={section} slug={slug}/>;}
