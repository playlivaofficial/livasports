import {EditorialDetail,editorialDetailParams,resolveEditorialDetail,v2Metadata} from '@/v2/pages';
export const dynamicParams=false;
export const generateStaticParams=()=>editorialDetailParams('mx');
export async function generateMetadata({params}:{params:Promise<{editorial:string[]}>}){const {section,slug}=resolveEditorialDetail('mx',(await params).editorial);return v2Metadata('mx',section,slug);}
export default async function Page({params}:{params:Promise<{editorial:string[]}>}){const {section,slug}=resolveEditorialDetail('mx',(await params).editorial);return <EditorialDetail locale="mx" section={section} slug={slug}/>;}
