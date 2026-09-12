import {schedulerResponse} from '@/odds/scheduler-server';
export const runtime='nodejs';
export async function GET(request:Request){return schedulerResponse(request,true);}
