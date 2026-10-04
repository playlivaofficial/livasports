import type {NextRequest} from 'next/server';
import {requestOwnerSession} from '@/owner/session';
import {timeZoneCookie,deviceTimeZoneCookie,validTimeZone} from '@/localization/time-zone';

export const dynamic='force-dynamic';
export function GET(request:NextRequest){
  const owner=requestOwnerSession(request.headers);
  return Response.json({manual:validTimeZone(request.cookies.get(timeZoneCookie)?.value),device:validTimeZone(request.cookies.get(deviceTimeZoneCookie)?.value),
    owner:{authorized:!!owner,preview:owner?.preview??false}},
  {headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'}});
}
