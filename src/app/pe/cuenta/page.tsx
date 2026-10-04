import {AccountPage,authPageMetadata} from '@/auth/pages';
export const dynamic='force-dynamic';
export const metadata=authPageMetadata('pe','account');
export default function Page(){return <AccountPage locale='pe'/>;}
