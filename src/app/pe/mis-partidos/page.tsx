import {MyMatchesPage,myMatchesMetadata} from '@/favorites/pages';
export const dynamic='force-dynamic';
export const metadata=myMatchesMetadata('pe');
export default function Page(){return <MyMatchesPage locale='pe'/>;}
