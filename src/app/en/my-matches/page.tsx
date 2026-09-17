import {MyMatchesPage,myMatchesMetadata} from '@/favorites/pages';
export const dynamic='force-dynamic';
export const metadata=myMatchesMetadata('en');
export default function Page(){return <MyMatchesPage locale="en"/>;}
