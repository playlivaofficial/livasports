import {LegalPage,legalMetadata,legalParams} from '@/localization/LegalPage';
export const generateStaticParams=()=>legalParams('br');
export async function generateMetadata({params}:{params:Promise<{document:string}>}){return legalMetadata('br',(await params).document);}
export default async function Page({params}:{params:Promise<{document:string}>}){return <LegalPage locale="br" slug={(await params).document}/>;}
