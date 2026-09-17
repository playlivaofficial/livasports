import {DocumentPage,documentMetadata,documentParams} from '@/localization/DocumentPage';
export const generateStaticParams=()=>documentParams('br');
export async function generateMetadata({params}:{params:Promise<{document:string}>}){return documentMetadata('br',(await params).document);}
export default async function Page({params}:{params:Promise<{document:string}>}){return <DocumentPage locale="br" slug={(await params).document}/>;}
