import {schedulerResponse} from '@/odds/scheduler-server';
export const runtime='nodejs';
export const maxDuration=180;
export async function GET(request:Request){return schedulerResponse(request);}
export async function POST(request:Request){return schedulerResponse(request);}
