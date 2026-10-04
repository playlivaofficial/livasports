import {PublicRootLayout} from '@/localization/PublicRootLayout';
import {LocalizedNotFound} from '@/localization/LocalizedNotFound';
export const metadata={title:'Page not found | LivaSports',robots:{index:false,follow:true}};
export default function GlobalNotFound(){return <PublicRootLayout locale="en"><LocalizedNotFound locale="en"/></PublicRootLayout>;}
