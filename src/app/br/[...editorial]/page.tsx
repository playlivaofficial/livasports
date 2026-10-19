import {EditorialDetail,editorialDetailParams,resolveEditorialDetail,v2Metadata} from '@/v2/pages';
export const dynamicParams=false;
export const generateStaticParams=()=>editorialDetailParams('br');
export async function generateMetadata({params}:{params:Promise<{editorial:string[]}>}){const {section,slug}=resolveEditorialDetail('br',(await params).editorial);return v2Metadata('br',section,slug);}
export default async function Page({params}:{params:Promise<{editorial:string[]}>}){const {section,slug}=resolveEditorialDetail('br',(await params).editorial);return <EditorialDetail locale="br" section={section} slug={slug}/>;}
