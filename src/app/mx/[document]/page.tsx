import {LegalPage,legalMetadata,legalParams} from '@/localization/LegalPage';
export const generateStaticParams=()=>legalParams('mx');
export async function generateMetadata({params}:{params:Promise<{document:string}>}){return legalMetadata('mx',(await params).document);}
export default async function Page({params}:{params:Promise<{document:string}>}){return <LegalPage locale="mx" slug={(await params).document}/>;}
