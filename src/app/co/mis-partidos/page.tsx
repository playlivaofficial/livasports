import {MyMatchesPage,myMatchesMetadata} from '@/favorites/pages';
export const dynamic='force-dynamic';
export const metadata=myMatchesMetadata('co');
export default function Page(){return <MyMatchesPage locale='co'/>;}
