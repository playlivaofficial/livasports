import type {NextRequest} from 'next/server';
import {requestOwnerSession} from '@/owner/session';
import {timeZoneCookie,deviceTimeZoneCookie,validTimeZone} from '@/localization/time-zone';
import {commercialLocale,requestCommercialGeo,requestEffectiveGeo} from '@/odds/commercial-geo';

export const dynamic='force-dynamic';
export function GET(request:NextRequest){
  const owner=requestOwnerSession(request.headers);
  return Response.json({manual:validTimeZone(request.cookies.get(timeZoneCookie)?.value),device:validTimeZone(request.cookies.get(deviceTimeZoneCookie)?.value),
    productGeo:requestEffectiveGeo(request.headers),commercialLocale:commercialLocale(requestCommercialGeo(request.headers)),
    owner:{authorized:!!owner,preview:owner?.preview??false,previewGeo:owner?.previewGeo??null}},
  {headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'}});
}
