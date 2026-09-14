import {LegalPage,legalMetadata,legalParams} from '@/localization/LegalPage';
export const generateStaticParams=()=>legalParams('en');
export async function generateMetadata({params}:{params:Promise<{document:string}>}){return legalMetadata('en',(await params).document);}
export default async function Page({params}:{params:Promise<{document:string}>}){return <LegalPage locale="en" slug={(await params).document}/>;}
