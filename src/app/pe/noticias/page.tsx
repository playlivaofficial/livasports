import {NewsIndexPage,newsMetadata} from '@/editorial/pages';
export const revalidate=3600;
export const generateMetadata=()=>newsMetadata('pe');
export default function Page(){return <NewsIndexPage locale="pe"/>;}
