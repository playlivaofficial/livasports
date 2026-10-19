import {NewsIndexPage,newsMetadata} from '@/editorial/pages';
export const revalidate=3600;
export const generateMetadata=()=>newsMetadata('mx');
export default function Page(){return <NewsIndexPage locale="mx"/>;}
