import {timingSafeEqual} from 'node:crypto';
import {requestOwnerSession} from '@/owner/session';
export const v2RuntimePolicy={product:'editorial-v2',paidSportsProviders:'retired',liveOdds:'retired',sportsSchedulers:'retired',socialRendering:'retired',affiliateActivation:'pending_verification',providerRequests:0} as const;
const privateHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
/** A terminal, non-mutating response. Legacy database records and credentials remain untouched. */
export function retiredResponse(_request?:Request,_context?:unknown){void _request;void _context;return Response.json({state:'RETIRED_IN_V2',providerRequests:0},{status:410,headers:{'Cache-Control':'public, max-age=300','X-Robots-Tag':'noindex, nofollow'}});}
export function retiredOwnerResponse(request:Request,_context?:unknown){void _context;if(!requestOwnerSession(request.headers))return Response.json({error:'UNAUTHORIZED'},{status:401,headers:privateHeaders});return Response.json({state:'RETIRED_IN_V2',providerRequests:0},{status:410,headers:privateHeaders});}
export function retiredSchedulerResponse(request:Request){
  const secret=process.env.CRON_SECRET?.trim(),authorization=request.headers.get('authorization');
  const expected=secret?Buffer.from(`Bearer ${secret}`):null,actual=Buffer.from(authorization??'');
  if(!expected||expected.length!==actual.length||!timingSafeEqual(expected,actual))return Response.json({error:'UNAUTHORIZED'},{status:401,headers:privateHeaders});
  return Response.json({state:'RETIRED_IN_V2',providerRequests:0},{status:410,headers:privateHeaders});
}
