import {EditorialDetail,editorialDetailParams,resolveEditorialDetail,v2Metadata} from '@/v2/pages';
export const dynamicParams=false;
export const generateStaticParams=()=>editorialDetailParams('pe');
export async function generateMetadata({params}:{params:Promise<{editorial:string[]}>}){const {section,slug}=resolveEditorialDetail('pe',(await params).editorial);return v2Metadata('pe',section,slug);}
export default async function Page({params}:{params:Promise<{editorial:string[]}>}){const {section,slug}=resolveEditorialDetail('pe',(await params).editorial);return <EditorialDetail locale="pe" section={section} slug={slug}/>;}
