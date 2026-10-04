import {PublicRootLayout} from '@/localization/PublicRootLayout';
export {siteMetadata as metadata} from '@/localization/site-metadata';
export default function Layout({children}:{children:React.ReactNode}){return <PublicRootLayout locale="mx">{children}</PublicRootLayout>;}
