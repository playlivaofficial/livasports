import type {ReactNode} from 'react';
import {PublicRootLayout} from '@/localization/PublicRootLayout';
export {siteMetadata as metadata} from '@/localization/site-metadata';
export default function Layout({children}:{children:ReactNode}){return <PublicRootLayout locale="co">{children}</PublicRootLayout>;}
