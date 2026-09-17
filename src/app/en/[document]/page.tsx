import {DocumentPage,documentMetadata,documentParams} from '@/localization/DocumentPage';
export const generateStaticParams=()=>documentParams('en');
export async function generateMetadata({params}:{params:Promise<{document:string}>}){return documentMetadata('en',(await params).document);}
export default async function Page({params}:{params:Promise<{document:string}>}){return <DocumentPage locale="en" slug={(await params).document}/>;}
