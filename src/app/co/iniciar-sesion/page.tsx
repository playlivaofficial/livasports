import {authPageMetadata,SignInPage} from '@/auth/pages';
export const dynamic='force-dynamic';
export const metadata=authPageMetadata('co','signin');
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  return <SignInPage locale='co' searchParams={searchParams}/>;
}
