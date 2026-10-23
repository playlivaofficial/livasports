import {sportsOwnerRequest} from '@/multisport/http';
import {withSportsRepository} from '@/multisport/server';
import {invalidateSports} from '@/multisport/invalidate';
export const dynamic='force-dynamic';
const handle=(request:Request)=>sportsOwnerRequest(request,{withRepository:withSportsRepository,invalidate:invalidateSports});
export const GET=handle;
export const POST=handle;
