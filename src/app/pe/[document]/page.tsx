import {DocumentPage,documentMetadata,documentParams} from '@/localization/DocumentPage';
export const generateStaticParams=()=>documentParams('pe');
export async function generateMetadata({params}:{params:Promise<{document:string}>}){return documentMetadata('pe',(await params).document);}
export default async function Page({params}:{params:Promise<{document:string}>}){return <DocumentPage locale='pe' slug={(await params).document}/>;}
