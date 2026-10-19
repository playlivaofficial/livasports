import {notFound} from 'next/navigation';
export const metadata={metadataBase:new URL('https://livasports.com'),robots:{index:false,follow:true}};
/** Direct HTTP requests receive 410 from proxy; no live loader survives RSC navigation. */
export default function Page(){notFound();}
