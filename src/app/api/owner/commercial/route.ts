import {ownerCommercialRequest} from '@/affiliate/owner-commercial';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=(request:Request)=>ownerCommercialRequest(request);
export const POST=(request:Request)=>ownerCommercialRequest(request);
