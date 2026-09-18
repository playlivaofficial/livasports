import {ownerHealthAction,ownerHealthStatus} from '@/owner/health-server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=(request:Request)=>ownerHealthStatus(request);
export const POST=(request:Request)=>ownerHealthAction(request);
