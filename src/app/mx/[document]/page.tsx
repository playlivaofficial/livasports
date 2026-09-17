import {DocumentPage,documentMetadata,documentParams} from '@/localization/DocumentPage';
export const generateStaticParams=()=>documentParams('mx');
export async function generateMetadata({params}:{params:Promise<{document:string}>}){return documentMetadata('mx',(await params).document);}
export default async function Page({params}:{params:Promise<{document:string}>}){return <DocumentPage locale="mx" slug={(await params).document}/>;}
