import {DocumentPage,documentMetadata,documentParams} from '@/localization/DocumentPage';
export const generateStaticParams=()=>documentParams('co');
export async function generateMetadata({params}:{params:Promise<{document:string}>}){return documentMetadata('co',(await params).document);}
export default async function Page({params}:{params:Promise<{document:string}>}){return <DocumentPage locale='co' slug={(await params).document}/>;}
